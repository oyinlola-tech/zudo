import {
  DatabaseError,
  DatabaseOperation,
  type DatabaseErrorOptions,
} from "@zudojs/errors";

import type {
  DatabaseClient,
  DatabaseTransactionContext,
} from "../databaseClient/databaseClient.core.js";
import { isDatabaseErrorLike } from "../databaseClient/databaseClient.errors.js";
import type { TransactionOptions } from "../databaseType/databaseType.type.js";
import type {
  Migration,
  MigrationRecord,
  MigrationResult,
  MigrationRunnerOptions,
  MigrationStatus,
  RunnerTransactionOptions,
} from "./migration.types.js";
import {
  DEFAULT_MIGRATION_TABLE,
  DEFAULT_MIGRATION_LOCK,
  normalizeMigrations,
  getCurrentVersion,
  getLatestVersion,
  hashLockKey,
  validateIdentifier,
  validateLockKey,
} from "./migration.helpers.js";
import { getSqlDialect, type SqlDialect } from "./migration.dialect.js";

export * from "./migration.types.js";
export {
  DEFAULT_MIGRATION_TABLE,
  DEFAULT_MIGRATION_LOCK,
  normalizeMigrations,
  getCurrentVersion,
  getLatestVersion,
  validateMigration,
} from "./migration.helpers.js";

/**
 * Minimal raw-query surface shared by the transaction client and the
 * database client wrapper.
 */
interface RawExecutor {
  query<TRow>(sql: string, ...values: readonly unknown[]): Promise<TRow[]>;
  execute(sql: string, ...values: readonly unknown[]): Promise<number>;
}

interface MigrationRow {
  readonly version: number | bigint | string;
  readonly name: string;
  readonly applied_at: Date | string;
}

/**
 * Runs and tracks database migrations.
 *
 * Every entry point re-reads the applied history *inside* the advisory
 * lock before deciding what to execute, so two runners started together
 * never apply or revert the same migration twice.
 */
export class MigrationRunner {
  private readonly client: DatabaseClient;
  private readonly migrations: readonly Migration[];
  private readonly tableName: string;
  private readonly lockKey: string;
  private readonly dialect: SqlDialect;
  private readonly transactionOptions: RunnerTransactionOptions;
  private readonly perItemTransaction: boolean;

  constructor(
    client: DatabaseClient,
    migrations: readonly Migration[],
    options: MigrationRunnerOptions = {},
  ) {
    if (!client) throw new TypeError("A database client is required.");
    this.client = client;
    this.migrations = normalizeMigrations(migrations);
    this.tableName = options.tableName ?? DEFAULT_MIGRATION_TABLE;
    this.lockKey = options.lockKey ?? DEFAULT_MIGRATION_LOCK;
    this.dialect = getSqlDialect(options.dialect);
    this.transactionOptions = { ...options.transaction };
    this.perItemTransaction = options.perItemTransaction ?? true;

    validateIdentifier(this.tableName, "migration table name");
    validateLockKey(this.lockKey, "migration lock key");
  }

  /**
   * Returns the migration status without executing anything.
   */
  public async status(): Promise<MigrationStatus> {
    await this.ensureMigrationTable();
    const applied = await this.getAppliedMigrations();
    return {
      currentVersion: getCurrentVersion(applied),
      latestVersion: getLatestVersion(this.migrations),
      pending: this.computePending(applied),
      applied,
    };
  }

  /**
   * Applies every pending migration in version order.
   */
  public async migrate(): Promise<MigrationResult> {
    await this.ensureMigrationTable();
    const before = await this.getAppliedMigrations();
    const pending = this.computePending(before);
    if (pending.length === 0) return { applied: [], skipped: before };

    const newlyApplied: MigrationRecord[] = [];
    const skipped: MigrationRecord[] = [...before];

    if (!this.perItemTransaction) {
      await this.client.transaction(async (transaction) => {
        await this.acquireMigrationLock(transaction);
        const applied = await this.getAppliedMigrations(transaction);
        skipped.push(...applied.filter((r) => !hasVersion(before, r.version)));
        for (const migration of this.computePending(applied)) {
          await this.executeMigration(transaction, migration);
          newlyApplied.push(await this.recordMigration(transaction, migration));
        }
      }, this.buildTransactionOptions());

      return { applied: newlyApplied, skipped };
    }

    for (const migration of pending) {
      const outcome = await this.client.transaction(async (transaction) => {
        await this.acquireMigrationLock(transaction);
        const applied = await this.getAppliedMigrations(transaction);
        const existing = applied.find((r) => r.version === migration.version);
        if (existing) return { record: existing, skipped: true } as const;
        await this.executeMigration(transaction, migration);
        const record = await this.recordMigration(transaction, migration);
        return { record, skipped: false } as const;
      }, this.buildTransactionOptions());

      if (outcome.skipped) skipped.push(outcome.record);
      else newlyApplied.push(outcome.record);
    }

    return { applied: newlyApplied, skipped };
  }

  /**
   * Alias of {@link migrate}.
   */
  public run(): Promise<MigrationResult> {
    return this.migrate();
  }

  /**
   * Reverts the most recently applied migration.
   *
   * With a `steps` argument, reverts up to that many migrations (newest
   * first) and returns the reverted records in rollback order.
   */
  public rollback(): Promise<MigrationRecord | null>;
  public rollback(steps: number): Promise<readonly MigrationRecord[]>;
  public async rollback(
    steps?: number,
  ): Promise<MigrationRecord | null | readonly MigrationRecord[]> {
    if (steps === undefined) {
      const [record] = await this.rollbackSteps(1);
      return record ?? null;
    }
    if (!Number.isInteger(steps) || steps <= 0) {
      throw new TypeError("Rollback steps must be a positive integer.");
    }
    return this.rollbackSteps(steps);
  }

  /**
   * Reverts every applied migration, newest first.
   */
  public rollbackAll(): Promise<readonly MigrationRecord[]> {
    return this.rollbackSteps(Number.POSITIVE_INFINITY);
  }

  /**
   * Creates the tracking table if it does not exist.
   */
  public async ensureMigrationTable(): Promise<void> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const { bigint, varchar255, timestamp } = this.dialect.types;
    const ddl =
      `CREATE TABLE IF NOT EXISTS ${q(this.tableName)} (` +
      `${q("version")} ${bigint} PRIMARY KEY, ` +
      `${q("name")} ${varchar255} NOT NULL, ` +
      `${q("applied_at")} ${timestamp} NOT NULL DEFAULT ${this.dialect.currentTimestamp})`;
    try {
      await this.client.executeRawUnsafe(ddl);
    } catch (error) {
      throw this.migrationError("Failed to initialize the migration table.", {
        cause: error,
        metadata: { tableName: this.tableName },
      });
    }
  }

  /**
   * Returns the applied migrations ordered by version.
   *
   * Pass the transaction context to read inside a running transaction
   * (for example after acquiring the advisory lock).
   */
  public async getAppliedMigrations(
    transaction?: DatabaseTransactionContext,
  ): Promise<readonly MigrationRecord[]> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const sql =
      `SELECT ${q("version")}, ${q("name")}, ${q("applied_at")} ` +
      `FROM ${q(this.tableName)} ORDER BY ${q("version")} ASC`;
    try {
      const rows = await this.executor(transaction).query<MigrationRow>(sql);
      return rows.map((row) => ({
        version: Number(row.version),
        name: row.name,
        appliedAt: new Date(row.applied_at),
      }));
    } catch (error) {
      throw this.migrationError("Failed to read migration history.", {
        cause: error,
        metadata: { tableName: this.tableName },
      });
    }
  }

  /**
   * Alias of {@link getAppliedMigrations}.
   */
  public getHistory(): Promise<readonly MigrationRecord[]> {
    return this.getAppliedMigrations();
  }

  private async rollbackSteps(
    limit: number,
  ): Promise<readonly MigrationRecord[]> {
    await this.ensureMigrationTable();
    const rolledBack: MigrationRecord[] = [];

    if (!this.perItemTransaction) {
      await this.client.transaction(async (transaction) => {
        await this.acquireMigrationLock(transaction);
        const applied = [...(await this.getAppliedMigrations(transaction))];
        while (applied.length > 0 && rolledBack.length < limit) {
          const record = applied.pop()!;
          await this.revertRecord(transaction, record);
          rolledBack.push(record);
        }
      }, this.buildTransactionOptions());
      return rolledBack;
    }

    while (rolledBack.length < limit) {
      const record = await this.client.transaction(async (transaction) => {
        await this.acquireMigrationLock(transaction);
        const applied = await this.getAppliedMigrations(transaction);
        const latest = applied[applied.length - 1];
        if (!latest) return null;
        await this.revertRecord(transaction, latest);
        return latest;
      }, this.buildTransactionOptions());
      if (!record) break;
      rolledBack.push(record);
    }

    return rolledBack;
  }

  private async revertRecord(
    transaction: DatabaseTransactionContext,
    record: MigrationRecord,
  ): Promise<void> {
    const migration = this.migrations.find((m) => m.version === record.version);
    if (!migration) {
      throw this.migrationError(
        `Migration "${record.name}" is recorded as applied but is not registered.`,
        { metadata: { version: record.version } },
      );
    }
    if (!migration.down) {
      throw this.migrationError(
        `Migration "${migration.name}" does not define a rollback operation.`,
        { metadata: { version: migration.version } },
      );
    }
    try {
      await migration.down(transaction);
    } catch (error) {
      throw this.migrationError(
        `Rollback of migration "${migration.name}" failed.`,
        {
          cause: error,
          metadata: { version: migration.version, name: migration.name },
        },
      );
    }
    await this.deleteMigrationRecord(transaction, migration.version);
  }

  private computePending(
    applied: readonly MigrationRecord[],
  ): readonly Migration[] {
    const versions = new Set(applied.map((record) => record.version));
    return this.migrations.filter((m) => !versions.has(m.version));
  }

  private buildTransactionOptions(): TransactionOptions {
    return { ...this.transactionOptions };
  }

  private executor(transaction?: DatabaseTransactionContext): RawExecutor {
    if (transaction) {
      return {
        query: <TRow>(sql: string, ...values: readonly unknown[]) =>
          transaction.$queryRawUnsafe(sql, ...values) as Promise<TRow[]>,
        execute: (sql: string, ...values: readonly unknown[]) =>
          transaction.$executeRawUnsafe(sql, ...values),
      };
    }
    return {
      query: <TRow>(sql: string, ...values: readonly unknown[]) =>
        this.client.queryRawUnsafe<TRow[]>(sql, values),
      execute: (sql: string, ...values: readonly unknown[]) =>
        this.client.executeRawUnsafe(sql, values),
    };
  }

  private async executeMigration(
    transaction: DatabaseTransactionContext,
    migration: Migration,
  ): Promise<void> {
    try {
      await migration.up(transaction);
    } catch (error) {
      throw this.migrationError(`Migration "${migration.name}" failed.`, {
        cause: error,
        metadata: { version: migration.version, name: migration.name },
      });
    }
  }

  private async recordMigration(
    transaction: DatabaseTransactionContext,
    migration: Migration,
  ): Promise<MigrationRecord> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const p = (index: number) => this.dialect.placeholder(index);
    const sql =
      `INSERT INTO ${q(this.tableName)} (${q("version")}, ${q("name")}) ` +
      `VALUES (${p(1)}, ${p(2)})`;
    try {
      await this.executor(transaction).execute(
        sql,
        BigInt(migration.version),
        migration.name,
      );
      return {
        version: migration.version,
        name: migration.name,
        appliedAt: new Date(),
      };
    } catch (error) {
      throw this.migrationError(
        `Failed to record migration "${migration.name}".`,
        { cause: error, metadata: { version: migration.version } },
      );
    }
  }

  private async deleteMigrationRecord(
    transaction: DatabaseTransactionContext,
    version: number,
  ): Promise<void> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const sql =
      `DELETE FROM ${q(this.tableName)} ` +
      `WHERE ${q("version")} = ${this.dialect.placeholder(1)}`;
    try {
      await this.executor(transaction).execute(sql, BigInt(version));
    } catch (error) {
      throw this.migrationError(
        `Failed to remove migration record for version ${version}.`,
        { cause: error, metadata: { version } },
      );
    }
  }

  private async acquireMigrationLock(
    transaction: DatabaseTransactionContext,
  ): Promise<void> {
    try {
      await this.executor(transaction).execute(
        this.dialect.advisoryTransactionLock(),
        hashLockKey(this.lockKey),
      );
    } catch (error) {
      throw this.migrationError(
        "Failed to acquire the database migration lock.",
        { cause: error, metadata: { lockKey: this.lockKey } },
      );
    }
  }

  private migrationError(
    message: string,
    options: Pick<DatabaseErrorOptions, "cause" | "metadata"> = {},
  ): DatabaseError {
    if (isDatabaseErrorLike(options.cause) && !options.metadata) {
      return options.cause;
    }
    return new DatabaseError(message, {
      ...options,
      operation: DatabaseOperation.MIGRATION,
    });
  }
}

function hasVersion(records: readonly MigrationRecord[], version: number) {
  return records.some((record) => record.version === version);
}

/**
 * Creates a migration runner.
 */
export function createMigrationRunner(
  client: DatabaseClient,
  migrations: readonly Migration[],
  options?: MigrationRunnerOptions,
): MigrationRunner {
  return new MigrationRunner(client, migrations, options);
}
