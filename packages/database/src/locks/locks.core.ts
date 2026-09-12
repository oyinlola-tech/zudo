import { DatabaseError, DatabaseOperation, ErrorCode } from "@zudojs/errors";

import type {
  DatabaseClient,
  DatabaseTransactionContext,
} from "../databaseClient/databaseClient.core.js";
import { normalizeDatabaseError } from "../databaseClient/databaseClient.errors.js";
import type { TransactionOptions } from "../databaseType/databaseType.type.js";
import {
  fnv1a64,
  hashLockKey,
  SQL_IDENTIFIER_PATTERN,
} from "../migration/migration.helpers.js";

/**
 * Supported row lock modes (PostgreSQL).
 */
export type DatabaseLockMode =
  "for-update" | "for-no-key-update" | "for-share" | "for-key-share";

/**
 * Options for acquiring a database lock.
 *
 * All locking in this module is PostgreSQL-specific (`pg_advisory_xact_lock`,
 * `FOR UPDATE ... SKIP LOCKED`, `lock_timeout`).
 */
export interface DatabaseLockOptions {
  /**
   * Row lock mode. Ignored for advisory locks.
   */
  readonly mode?: DatabaseLockMode;

  /**
   * Maximum time to wait for the lock. Applied with
   * `SET LOCAL lock_timeout` inside the transaction, so a contended lock
   * fails with a lock-timeout error instead of Prisma's generic
   * transaction timeout. When it exceeds Prisma's 5 s default and
   * `transaction.timeoutMs` is not set, the transaction timeout is raised
   * automatically (see `resolveLockTransactionOptions`).
   *
   * Must be a positive number: PostgreSQL treats `lock_timeout = 0` as
   * "disabled" (wait forever), so `0` is rejected. Use `noWait` to fail
   * immediately instead.
   */
  readonly timeoutMs?: number;

  /**
   * Row locks only: skip rows locked by other transactions instead of
   * waiting. When the row is skipped the lock is *not* held and
   * `acquired` is `false`.
   */
  readonly skipLocked?: boolean;

  /**
   * Fail immediately when the lock is held by another transaction.
   */
  readonly noWait?: boolean;

  /**
   * Advisory locks only: optional namespace. When supplied the two-int
   * form `pg_advisory_xact_lock(int, int)` is used with the namespace
   * hashed into the first argument, so unrelated services sharing one
   * database cannot collide on the same 64-bit key space.
   */
  readonly namespace?: string;

  /**
   * Options forwarded to the transaction opened by the lock manager.
   */
  readonly transaction?: TransactionOptions;
}

/**
 * Result of a lock acquisition.
 */
export interface DatabaseLockResult {
  readonly acquired: boolean;
  readonly lockKey: string;
  readonly mode?: DatabaseLockMode;
}

/**
 * Application-level lock abstraction for PostgreSQL.
 *
 * Locks are acquired inside a transaction and released when it ends.
 */
export class DatabaseLockManager {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    if (!client) {
      throw new TypeError("A database client is required.");
    }
    this.client = client;
  }

  /**
   * Executes work inside a transaction after acquiring a PostgreSQL
   * advisory transaction lock.
   */
  public async withAdvisoryLock<TResult>(
    lockKey: string,
    callback: (transaction: DatabaseTransactionContext) => Promise<TResult>,
    options: DatabaseLockOptions = {},
  ): Promise<TResult> {
    validateLockKey(lockKey);
    validateCallback(callback);

    return this.client.transaction(async (transaction) => {
      await acquireAdvisoryLock(transaction, lockKey, options);
      return callback(transaction);
    }, resolveLockTransactionOptions(options));
  }

  /**
   * Acquires a row-level lock and executes work while holding it.
   *
   * @throws {DatabaseError} when the row does not exist or was skipped
   * because another transaction holds it (`skipLocked`).
   */
  public async withRowLock<TResult>(
    tableName: string,
    id: string | number,
    callback: (transaction: DatabaseTransactionContext) => Promise<TResult>,
    options: DatabaseLockOptions = {},
  ): Promise<TResult> {
    validateIdentifier(tableName, "table name");
    validateId(id);
    validateCallback(callback);

    return this.client.transaction(async (transaction) => {
      const lock = await lockRow(transaction, tableName, id, options);
      if (!lock.acquired) {
        throw new DatabaseError(
          `Row ${String(id)} in "${tableName}" is locked by another transaction.`,
          {
            code: ErrorCode.CONFLICT,
            statusCode: 409,
            operation: DatabaseOperation.QUERY,
            metadata: { tableName, id, mode: lock.mode ?? null, skipped: true },
          },
        );
      }
      return callback(transaction);
    }, resolveLockTransactionOptions(options));
  }

  /**
   * Returns the underlying database client.
   */
  public getClient(): DatabaseClient {
    return this.client;
  }
}

/**
 * Creates a lock manager.
 */
export function createLockManager(client: DatabaseClient): DatabaseLockManager {
  return new DatabaseLockManager(client);
}

/**
 * Acquires a PostgreSQL advisory transaction lock.
 *
 * The lock key is hashed with FNV-1a to a signed 64-bit key (or, with a
 * `namespace`, to a pair of signed 32-bit keys).
 */
export async function acquireAdvisoryLock(
  transaction: DatabaseTransactionContext,
  lockKey: string,
  options: DatabaseLockOptions = {},
): Promise<DatabaseLockResult> {
  validateLockKey(lockKey);

  const useNamespace = options.namespace !== undefined;
  if (useNamespace) validateLockKey(options.namespace as string, "lock namespace");

  const fn = options.noWait ? "pg_try_advisory_xact_lock" : "pg_advisory_xact_lock";
  const sql = useNamespace
    ? `SELECT ${fn}($1, $2) AS acquired`
    : `SELECT ${fn}($1) AS acquired`;
  const values: readonly unknown[] = useNamespace
    ? normalizeAdvisoryKeyPair(options.namespace as string, lockKey)
    : [normalizeAdvisoryKey(lockKey)];

  try {
    await applyLockTimeout(transaction, options.timeoutMs);
    const rows = await transaction.$queryRawUnsafe<
      readonly { acquired: boolean | null }[]
    >(sql, ...values);

    if (options.noWait && rows[0]?.acquired !== true) {
      throw new DatabaseError(
        `Database advisory lock "${lockKey}" is already held.`,
        {
          code: ErrorCode.CONFLICT,
          statusCode: 409,
          operation: DatabaseOperation.QUERY,
          metadata: { lockKey, namespace: options.namespace ?? null },
        },
      );
    }

    return { acquired: true, lockKey };
  } catch (error) {
    throw normalizeDatabaseError(error, {
      operation: DatabaseOperation.QUERY,
      fallbackMessage: `Failed to acquire database advisory lock "${lockKey}".`,
      metadata: { lockKey, namespace: options.namespace ?? null },
    });
  }
}

/**
 * Acquires a row-level PostgreSQL lock.
 *
 * @throws {DatabaseError} when the row does not exist.
 * @returns `acquired: false` only when `skipLocked` skipped a row held by
 * another transaction.
 */
export async function lockRow(
  transaction: DatabaseTransactionContext,
  tableName: string,
  id: string | number,
  options: DatabaseLockOptions = {},
): Promise<DatabaseLockResult> {
  validateIdentifier(tableName, "table name");
  validateId(id);

  const mode = options.mode ?? "for-update";
  const clause = buildLockClause(mode, options);
  const lockKey = `${tableName}:${String(id)}`;

  try {
    await applyLockTimeout(transaction, options.timeoutMs);
    const rows = await transaction.$queryRawUnsafe<readonly unknown[]>(
      `SELECT 1 FROM "${tableName}" WHERE "id" = $1 ${clause}`,
      id,
    );

    if (rows.length > 0) return { acquired: true, lockKey, mode };

    if (options.skipLocked) return { acquired: false, lockKey, mode };

    throw new DatabaseError(
      `Row ${String(id)} in "${tableName}" was not found.`,
      {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        statusCode: 404,
        expose: true,
        operation: DatabaseOperation.QUERY,
        metadata: { tableName, id, mode },
      },
    );
  } catch (error) {
    throw normalizeDatabaseError(error, {
      operation: DatabaseOperation.QUERY,
      fallbackMessage: `Failed to acquire row lock on "${tableName}".`,
      metadata: { tableName, id, mode },
    });
  }
}

/**
 * Builds a safe PostgreSQL lock clause.
 */
export function buildLockClause(
  mode: DatabaseLockMode,
  options: DatabaseLockOptions = {},
): string {
  const lockMode = getLockModeSql(mode);
  const modifiers: string[] = [];
  if (options.noWait) modifiers.push("NOWAIT");
  else if (options.skipLocked) modifiers.push("SKIP LOCKED");
  return [lockMode, ...modifiers].join(" ");
}

function getLockModeSql(mode: DatabaseLockMode): string {
  switch (mode) {
    case "for-update":
      return "FOR UPDATE";
    case "for-no-key-update":
      return "FOR NO KEY UPDATE";
    case "for-share":
      return "FOR SHARE";
    case "for-key-share":
      return "FOR KEY SHARE";
    default:
      throw new TypeError(`Unsupported database lock mode: ${String(mode)}`);
  }
}

/**
 * Converts an application lock key into a deterministic signed 64-bit
 * advisory key (FNV-1a 64).
 */
export function normalizeAdvisoryKey(lockKey: string): bigint {
  validateLockKey(lockKey);
  return hashLockKey(lockKey);
}

/**
 * Converts a namespace and key into the two signed 32-bit integers used by
 * the two-argument advisory lock functions.
 */
export function normalizeAdvisoryKeyPair(
  namespace: string,
  lockKey: string,
): readonly [number, number] {
  validateLockKey(namespace, "lock namespace");
  validateLockKey(lockKey);
  return [toInt32(fnv1a64(namespace)), toInt32(fnv1a64(lockKey))];
}

function toInt32(value: bigint): number {
  return Number(BigInt.asIntN(32, value ^ (value >> 32n)));
}

/**
 * Prisma's default interactive-transaction timeout.
 */
const DEFAULT_PRISMA_TRANSACTION_TIMEOUT_MS = 5_000;

/**
 * Derives the transaction options for a lock so that `lock_timeout` is
 * always shorter than the surrounding Prisma transaction timeout.
 *
 * Without this, a lock wait longer than Prisma's 5 s default would surface
 * as a generic "transaction already closed" error instead of a lock
 * timeout. When `transaction.timeoutMs` is not supplied it is raised to
 * cover the lock wait plus the default budget for the callback.
 *
 * @throws {TypeError} when `transaction.timeoutMs` is explicitly shorter
 * than `timeoutMs`.
 */
export function resolveLockTransactionOptions(
  options: DatabaseLockOptions = {},
): TransactionOptions | undefined {
  const { timeoutMs, transaction } = options;
  if (timeoutMs === undefined) return transaction;
  validateLockTimeout(timeoutMs);

  const explicit = transaction?.timeoutMs;
  if (explicit !== undefined) {
    if (explicit <= timeoutMs) {
      throw new TypeError(
        `Lock timeoutMs (${timeoutMs}) must be shorter than transaction.timeoutMs (${explicit}).`,
      );
    }
    return transaction;
  }

  if (timeoutMs < DEFAULT_PRISMA_TRANSACTION_TIMEOUT_MS) return transaction;
  return {
    ...transaction,
    timeoutMs: Math.floor(timeoutMs) + DEFAULT_PRISMA_TRANSACTION_TIMEOUT_MS,
  };
}

/**
 * Applies `SET LOCAL lock_timeout` for the current transaction.
 */
async function applyLockTimeout(
  transaction: DatabaseTransactionContext,
  timeoutMs: number | undefined,
): Promise<void> {
  if (timeoutMs === undefined) return;
  validateLockTimeout(timeoutMs);
  await transaction.$executeRawUnsafe(
    `SET LOCAL lock_timeout = ${Math.floor(timeoutMs)}`,
  );
}

/**
 * Rejects lock timeouts PostgreSQL would silently disable. `lock_timeout`
 * is "no timeout" at `0`, and `Math.floor` turns any value below 1 ms into
 * `0`, so anything under one millisecond is refused.
 */
function validateLockTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new TypeError(
      "Lock timeoutMs must be a finite number of at least 1 ms; PostgreSQL treats lock_timeout = 0 as disabled. Use noWait to fail immediately.",
    );
  }
}

function validateCallback(callback: unknown): void {
  if (typeof callback !== "function") {
    throw new TypeError("A lock callback is required.");
  }
}

function validateLockKey(lockKey: string, name = "lock key"): void {
  if (typeof lockKey !== "string" || lockKey.trim().length === 0) {
    throw new TypeError(`A non-empty database ${name} is required.`);
  }
  if (lockKey.length > 255) {
    throw new TypeError(`Database ${name}s cannot exceed 255 characters.`);
  }
}

function validateIdentifier(value: string, name: string): void {
  if (typeof value !== "string" || !SQL_IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(`Invalid ${name}: "${String(value)}".`);
  }
}

function validateId(id: string | number): void {
  if (typeof id === "string" && id.trim().length === 0) {
    throw new TypeError("A non-empty database identifier is required.");
  }
  if (typeof id === "number" && !Number.isFinite(id)) {
    throw new TypeError("A finite database identifier is required.");
  }
  if (typeof id !== "string" && typeof id !== "number") {
    throw new TypeError("A database identifier must be a string or number.");
  }
}
