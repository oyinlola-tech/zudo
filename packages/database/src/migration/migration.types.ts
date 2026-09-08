import type { DatabaseTransactionContext } from "../databaseClient/databaseClient.core.js";
import type { TransactionOptions } from "../databaseType/databaseType.type.js";
import type { SqlDialectName } from "./migration.dialect.js";

/**
 * Migration definition.
 *
 * Each migration must have a unique, monotonically ordered version. The
 * version is stored in a BIGINT column, so timestamp-style versions such as
 * `20260908120000` are supported up to `Number.MAX_SAFE_INTEGER`.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;

  /**
   * Applies the migration.
   */
  readonly up: (database: DatabaseTransactionContext) => Promise<void>;

  /**
   * Reverts the migration.
   */
  readonly down?: (database: DatabaseTransactionContext) => Promise<void>;
}

/**
 * Persisted migration record.
 */
export interface MigrationRecord {
  readonly version: number;
  readonly name: string;
  readonly appliedAt: Date;
}

/**
 * Migration execution result.
 */
export interface MigrationResult {
  readonly applied: readonly MigrationRecord[];
  readonly skipped: readonly MigrationRecord[];
}

/**
 * Migration status.
 */
export interface MigrationStatus {
  readonly currentVersion: number;
  readonly latestVersion: number;
  readonly pending: readonly Migration[];
  readonly applied: readonly MigrationRecord[];
}

/**
 * Transaction options accepted by the runners.
 */
export type RunnerTransactionOptions = Pick<
  TransactionOptions,
  "timeoutMs" | "maxWaitMs" | "isolationLevel"
>;

/**
 * Migration runner options.
 */
export interface MigrationRunnerOptions {
  /**
   * Tracking table name. Must be a plain SQL identifier.
   */
  readonly tableName?: string;

  /**
   * Advisory lock key used to serialise concurrent runners.
   */
  readonly lockKey?: string;

  /**
   * SQL dialect. Only `postgresql` is implemented.
   */
  readonly dialect?: SqlDialectName;

  /**
   * Options forwarded to every transaction the runner opens
   * (`timeoutMs`, `maxWaitMs`, `isolationLevel`).
   */
  readonly transaction?: RunnerTransactionOptions;

  /**
   * When `true` (default) each migration runs in its own transaction, so a
   * slow migration cannot roll back earlier ones and the Prisma transaction
   * timeout applies per migration. When `false` the whole batch runs in one
   * transaction and is all-or-nothing.
   *
   * The advisory lock is transaction-scoped: it is held for the whole run
   * when `perItemTransaction` is `false`, and re-acquired for every
   * migration otherwise. Applied history is always re-read under the lock,
   * so concurrent runners never execute the same migration twice.
   */
  readonly perItemTransaction?: boolean;
}
