/**
 * @zudojs/database — Database Client Core
 *
 * Prisma-backed database client implementation.
 *
 * The client is a thin lifecycle wrapper over a Prisma client. It never
 * reads runtime values from the generated `Prisma` namespace, so it works
 * whether the consumer's generated client lives in `@prisma/client` or in a
 * custom output directory (the Prisma 7 default).
 *
 * Only PostgreSQL is exercised by the runners, locks and health helpers in
 * this package.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { DatabaseError, DatabaseOperation } from "@zudojs/errors";
import type {
  DatabaseClient as DatabaseClientContract,
  DatabaseConnectionOptions,
  DatabaseHealth,
  DatabaseLogger,
  DatabaseOperationOptions,
  DatabaseStatus,
  TransactionCallback,
  TransactionIsolationLevel,
  TransactionOptions,
} from "../databaseType/databaseType.type.js";
import { createDefaultLogger } from "./databaseClient.logger.js";
import { normalizeDatabaseError } from "./databaseClient.errors.js";

/**
 * Transaction client handed to callbacks. This is Prisma's interactive
 * transaction client (model delegates plus raw query helpers).
 */
export type DatabaseTransactionContext = Prisma.TransactionClient;

/**
 * Isolation levels accepted by Prisma's interactive transactions. The
 * values are identical to the string names, so no namespace lookup is
 * required.
 */
export const SUPPORTED_ISOLATION_LEVELS: readonly TransactionIsolationLevel[] =
  Object.freeze([
    "ReadUncommitted",
    "ReadCommitted",
    "RepeatableRead",
    "Serializable",
  ]);

/**
 * Options forwarded to Prisma's interactive `$transaction`.
 */
export interface PrismaTransactionOptions {
  readonly maxWait?: number;
  readonly timeout?: number;
  readonly isolationLevel?: TransactionIsolationLevel;
}

/**
 * Structural view of the Prisma client surface this package relies on.
 *
 * Any generated `PrismaClient` satisfies it; tests can supply a stub.
 */
export interface PrismaClientLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<TResult>(
    callback: (transaction: DatabaseTransactionContext) => Promise<TResult>,
    options?: PrismaTransactionOptions,
  ): Promise<TResult>;
  $queryRawUnsafe<TResult = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<TResult>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $on?(event: "query", callback: (event: PrismaQueryEvent) => void): void;
}

/**
 * Prisma query log event.
 */
export interface PrismaQueryEvent {
  readonly query: string;
  readonly params: string;
  readonly duration: number;
  readonly target: string;
}

/**
 * Prisma driver adapter (for example `@prisma/adapter-pg`).
 *
 * Typed structurally so this package does not depend on any adapter.
 */
export interface PrismaDriverAdapterLike {
  readonly provider: string;
  readonly adapterName: string;
}

/**
 * Options accepted by {@link DatabaseClient}.
 *
 * Prisma 7 requires either a driver adapter or an already constructed
 * client; connection URLs, pool sizes and SSL flags are configured on the
 * adapter and are therefore not accepted here.
 */
export interface DatabaseClientOptions
  extends Pick<DatabaseConnectionOptions, "connectionTimeoutMs" | "logging"> {
  /**
   * Pre-built Prisma client. Takes precedence over `adapter`.
   */
  readonly prisma?: PrismaClientLike;

  /**
   * Prisma driver adapter used to construct a client when `prisma` is
   * not supplied.
   */
  readonly adapter?: PrismaDriverAdapterLike;

  readonly logger?: DatabaseLogger;
}

/**
 * Raw query options.
 */
export type RawQueryOptions = DatabaseOperationOptions;

/**
 * Prisma-backed database client.
 *
 * `connect()` de-duplicates concurrent calls through a shared in-flight
 * promise, and `disconnect()` waits for an in-flight connect before
 * tearing the client down.
 */
export class DatabaseClient
  implements DatabaseClientContract<DatabaseTransactionContext>
{
  private readonly prisma: PrismaClientLike;
  private readonly logger: DatabaseLogger;
  private readonly options: DatabaseClientOptions;
  private status: DatabaseStatus = "disconnected";
  private connectedAt?: Date;
  private connectPromise?: Promise<void>;
  private disconnectPromise?: Promise<void>;

  constructor(options: DatabaseClientOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createDefaultLogger();
    this.prisma = options.prisma ?? createPrismaClient(options);
    this.registerQueryLogging();
  }

  /**
   * Returns the underlying Prisma client.
   */
  public getPrisma(): PrismaClientLike {
    return this.prisma;
  }

  /**
   * Opens the connection. Concurrent calls share one in-flight attempt.
   */
  public connect(): Promise<void> {
    if (this.status === "connected") return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    if (this.disconnectPromise) {
      return this.disconnectPromise.then(() => this.connect());
    }

    this.status = "connecting";
    this.connectPromise = this.performConnect().finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async performConnect(): Promise<void> {
    try {
      await this.withTimeout(
        this.prisma.$connect(),
        this.options.connectionTimeoutMs ?? 10_000,
        "Database connection timed out.",
      );
      if (this.status !== "connecting") {
        // A disconnect raced this connect; leave its final state alone.
        return;
      }
      this.status = "connected";
      this.connectedAt = new Date();
      this.logger.info("Database connected.");
    } catch (error) {
      this.status = "error";
      const normalized = normalizeDatabaseError(error, {
        operation: DatabaseOperation.CONNECT,
        fallbackMessage: "Database connection failed.",
      });
      this.logger.error(normalized.message, normalized);
      throw normalized;
    }
  }

  /**
   * Closes the connection. Waits for an in-flight connect first.
   */
  public disconnect(): Promise<void> {
    if (this.disconnectPromise) return this.disconnectPromise;
    if (this.status === "disconnected" && !this.connectPromise) {
      return Promise.resolve();
    }

    this.disconnectPromise = this.performDisconnect().finally(() => {
      this.disconnectPromise = undefined;
    });
    return this.disconnectPromise;
  }

  private async performDisconnect(): Promise<void> {
    if (this.connectPromise) {
      await this.connectPromise.catch(() => undefined);
    }
    this.status = "disconnecting";
    try {
      await this.prisma.$disconnect();
      this.status = "disconnected";
      this.connectedAt = undefined;
      this.logger.info("Database disconnected.");
    } catch (error) {
      this.status = "error";
      const normalized = normalizeDatabaseError(error, {
        operation: DatabaseOperation.DISCONNECT,
        fallbackMessage: "Database disconnection failed.",
      });
      this.logger.error(normalized.message, normalized);
      throw normalized;
    }
  }

  /**
   * Executes a lightweight `SELECT 1`.
   */
  public async ping(options: RawQueryOptions = {}): Promise<void> {
    try {
      await this.runRaw(
        () => this.prisma.$queryRawUnsafe("SELECT 1"),
        options,
        "Database ping timed out.",
      );
    } catch (error) {
      this.status = "error";
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Database ping failed.",
      });
    }
  }

  public getStatus(): DatabaseStatus {
    return this.status;
  }

  public getConnectedAt(): Date | undefined {
    return this.connectedAt;
  }

  /**
   * Pings the database and reports the real lifecycle status.
   */
  public async healthCheck(options: RawQueryOptions = {}): Promise<DatabaseHealth> {
    const startedAt = Date.now();
    try {
      await this.ping(options);
      return {
        status: this.status,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (error) {
      const normalized = normalizeDatabaseError(error, {
        fallbackMessage: "Database health check failed.",
      });
      return {
        status: "error",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
        error: normalized.message,
      };
    }
  }

  /**
   * Runs a callback inside a Prisma interactive transaction.
   */
  public async transaction<TResult>(
    callback: TransactionCallback<DatabaseTransactionContext, TResult>,
    options: TransactionOptions = {},
  ): Promise<TResult> {
    if (typeof callback !== "function") {
      throw new TypeError("A transaction callback is required.");
    }
    throwIfAborted(options.signal);
    await this.ensureConnected();
    const transactionOptions = buildPrismaTransactionOptions(options);
    try {
      return await raceAbort(
        this.prisma.$transaction(
          async (transaction) => callback(transaction),
          transactionOptions,
        ),
        options.signal,
      );
    } catch (error) {
      const normalized = normalizeDatabaseError(error, {
        operation: DatabaseOperation.TRANSACTION,
        fallbackMessage: "Database transaction failed.",
        metadata: options.metadata as DatabaseErrorMetadata | undefined,
      });
      this.logger.error(normalized.message, normalized);
      throw normalized;
    }
  }

  /**
   * Executes a raw statement with positional parameters and returns the
   * affected row count.
   */
  public async executeRawUnsafe(
    sql: string,
    values: readonly unknown[] = [],
    options: RawQueryOptions = {},
  ): Promise<number> {
    validateSql(sql);
    await this.ensureConnected();
    try {
      return await this.runRaw(
        () => this.prisma.$executeRawUnsafe(sql, ...values),
        options,
        "Raw database execution timed out.",
      );
    } catch (error) {
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Raw database execution failed.",
        metadata: options.metadata as DatabaseErrorMetadata | undefined,
      });
    }
  }

  /**
   * Executes a raw query with positional parameters.
   */
  public async queryRawUnsafe<TResult = unknown>(
    sql: string,
    values: readonly unknown[] = [],
    options: RawQueryOptions = {},
  ): Promise<TResult> {
    validateSql(sql);
    await this.ensureConnected();
    try {
      return await this.runRaw(
        () => this.prisma.$queryRawUnsafe<TResult>(sql, ...values),
        options,
        "Raw database query timed out.",
      );
    } catch (error) {
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Raw database query failed.",
        metadata: options.metadata as DatabaseErrorMetadata | undefined,
      });
    }
  }

  /**
   * Executes a `Prisma.sql` tagged statement.
   *
   * Only available when the underlying client supports `$executeRaw`.
   */
  public async executeRaw(
    query: Prisma.Sql,
    options: RawQueryOptions = {},
  ): Promise<number> {
    const prisma = this.prisma as PrismaClientLike & {
      $executeRaw?: (query: Prisma.Sql) => Promise<number>;
    };
    if (typeof prisma.$executeRaw !== "function") {
      throw new TypeError("The Prisma client does not support $executeRaw.");
    }
    await this.ensureConnected();
    try {
      return await this.runRaw(
        () => prisma.$executeRaw!(query),
        options,
        "Raw database execution timed out.",
      );
    } catch (error) {
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Raw database execution failed.",
      });
    }
  }

  /**
   * Executes a `Prisma.sql` tagged query.
   */
  public async queryRaw<TResult = unknown>(
    query: Prisma.Sql,
    options: RawQueryOptions = {},
  ): Promise<TResult> {
    const prisma = this.prisma as PrismaClientLike & {
      $queryRaw?: (query: Prisma.Sql) => Promise<TResult>;
    };
    if (typeof prisma.$queryRaw !== "function") {
      throw new TypeError("The Prisma client does not support $queryRaw.");
    }
    await this.ensureConnected();
    try {
      return await this.runRaw(
        () => prisma.$queryRaw!(query),
        options,
        "Raw database query timed out.",
      );
    } catch (error) {
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Raw database query failed.",
      });
    }
  }

  public async ensureConnected(): Promise<void> {
    if (this.status !== "connected") await this.connect();
  }

  public async destroy(): Promise<void> {
    await this.disconnect();
  }

  private registerQueryLogging(): void {
    if (!this.options.logging) return;
    this.prisma.$on?.("query", (event) => {
      this.logger.debug("Database query executed.", {
        durationMs: event.duration,
        target: event.target,
      });
    });
  }

  /**
   * Applies `signal` and `timeoutMs` to a raw operation.
   *
   * Timeouts are client-side only: the caller stops waiting, but the
   * statement keeps running on the server until it completes. Use
   * `statement_timeout` for server-side cancellation.
   */
  private runRaw<TResult>(
    operation: () => Promise<TResult>,
    options: RawQueryOptions,
    timeoutMessage: string,
  ): Promise<TResult> {
    throwIfAborted(options.signal);
    const promise = raceAbort(operation(), options.signal);
    return this.withTimeout(promise, options.timeoutMs ?? 0, timeoutMessage);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new DatabaseError(message, {
            code: "ERR_DATABASE_TIMEOUT",
            statusCode: 503,
            metadata: { timeoutMs },
          }),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

type DatabaseErrorMetadata = NonNullable<
  ConstructorParameters<typeof DatabaseError>[1]
>["metadata"];

/**
 * Builds a Prisma client from the supplied options.
 *
 * @throws {DatabaseError} when neither `prisma` nor `adapter` is provided.
 */
function createPrismaClient(options: DatabaseClientOptions): PrismaClientLike {
  if (!options.adapter) {
    throw new DatabaseError(
      "DatabaseClient requires either a pre-built `prisma` client or a Prisma driver `adapter` (for example @prisma/adapter-pg).",
      {
        code: "ERR_DATABASE_CONNECTION",
        operation: DatabaseOperation.CONNECT,
        isOperational: false,
      },
    );
  }

  const log = options.logging
    ? [
        { emit: "event", level: "query" },
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "warn" },
      ]
    : [{ emit: "stdout", level: "error" }];

  try {
    const Constructor = PrismaClient as unknown as new (config: {
      adapter: PrismaDriverAdapterLike;
      log: readonly { emit: string; level: string }[];
    }) => PrismaClientLike;
    return new Constructor({ adapter: options.adapter, log });
  } catch (error) {
    throw normalizeDatabaseError(error, {
      operation: DatabaseOperation.CONNECT,
      fallbackMessage: "Failed to construct the Prisma client.",
    });
  }
}

/**
 * Maps package transaction options onto Prisma's interactive transaction
 * options. Isolation levels are validated against the supported list and
 * passed through as strings.
 */
export function buildPrismaTransactionOptions(
  options: TransactionOptions = {},
): PrismaTransactionOptions {
  const result: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: TransactionIsolationLevel;
  } = {};

  if (options.maxWaitMs !== undefined) {
    validatePositive(options.maxWaitMs, "maxWaitMs");
    result.maxWait = Math.floor(options.maxWaitMs);
  }
  if (options.timeoutMs !== undefined) {
    validatePositive(options.timeoutMs, "timeoutMs");
    result.timeout = Math.floor(options.timeoutMs);
  }
  if (options.isolationLevel !== undefined) {
    if (!SUPPORTED_ISOLATION_LEVELS.includes(options.isolationLevel)) {
      throw new TypeError(
        `Unsupported transaction isolation level: ${String(options.isolationLevel)}`,
      );
    }
    result.isolationLevel = options.isolationLevel;
  }
  return result;
}

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Transaction ${name} must be a positive finite number.`);
  }
}

function validateSql(sql: string): void {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new TypeError("A non-empty SQL string is required.");
  }
}

/**
 * Throws an abort-typed `DatabaseError` when the signal is already aborted.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError(signal);
}

/**
 * Error raised when an operation is cancelled through an `AbortSignal`.
 */
export class DatabaseAbortError extends DatabaseError {
  constructor(signal?: AbortSignal) {
    super("Database operation aborted.", {
      code: "ERR_ABORTED",
      statusCode: 499,
      metadata: { aborted: true },
      cause: signal?.reason,
    });
  }
}

/**
 * Creates the error used when an operation is aborted through a signal.
 */
export function createAbortError(signal?: AbortSignal): DatabaseAbortError {
  return new DatabaseAbortError(signal);
}

/**
 * Rejects as soon as the signal aborts, even if the operation is still
 * running. The abort listener is removed once the operation settles.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(createAbortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/** Creates a database client. */
export function createDatabaseClient(
  options: DatabaseClientOptions = {},
): DatabaseClient {
  return new DatabaseClient(options);
}
