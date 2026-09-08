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
import { getSqlDialect, type SqlDialect, type SqlDialectName } from "../migration/migration.dialect.js";
import {
  hashLockKey,
  validateIdentifier,
  validateLockKey,
} from "../migration/migration.helpers.js";
import type { RunnerTransactionOptions } from "../migration/migration.types.js";

/**
 * Defines a database seed operation.
 */
export interface Seed {
  /**
   * Unique seed name.
   */
  readonly name: string;

  /**
   * Seed execution order. Seeds with equal order run in declaration order.
   */
  readonly order?: number;

  /**
   * Executes the seed.
   */
  readonly run: (database: DatabaseTransactionContext) => Promise<void>;

  /**
   * Optional cleanup operation.
   */
  readonly rollback?: (database: DatabaseTransactionContext) => Promise<void>;
}

/**
 * Persisted seed execution record.
 */
export interface SeedRecord {
  readonly name: string;
  readonly appliedAt: Date;

  /**
   * Execution sequence number. Rollbacks walk this in descending order so
   * seeds applied together in one batch are reverted in reverse execution
   * order rather than alphabetically.
   */
  readonly sequence: number;
}

/**
 * Result returned by the seed runner.
 */
export interface SeedResult {
  readonly applied: readonly SeedRecord[];
  readonly skipped: readonly SeedRecord[];
}

/**
 * Seed runner status.
 */
export interface SeedStatus {
  readonly pending: readonly Seed[];
  readonly applied: readonly SeedRecord[];
}

/**
 * Seed runner configuration (PostgreSQL only).
 */
export interface SeedRunnerOptions {
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
   * Options forwarded to every transaction the runner opens.
   */
  readonly transaction?: RunnerTransactionOptions;

  /**
   * When `true` (default) each seed runs in its own transaction; when
   * `false` a whole batch runs in one all-or-nothing transaction. Applied
   * history is always re-read under the advisory lock.
   */
  readonly perItemTransaction?: boolean;
}

/**
 * Default seed tracking table.
 */
export const DEFAULT_SEED_TABLE = "_seeds";

/**
 * Default seed advisory lock.
 */
export const DEFAULT_SEED_LOCK = "database:seeds";

interface RawExecutor {
  query<TRow>(sql: string, ...values: readonly unknown[]): Promise<TRow[]>;
  execute(sql: string, ...values: readonly unknown[]): Promise<number>;
}

interface SeedRow {
  readonly name: string;
  readonly applied_at: Date | string;
  readonly sequence: number | bigint | string;
}

/**
 * Runs and tracks database seeds.
 *
 * Every entry point re-reads the applied history *inside* the advisory
 * lock before deciding what to execute, so two runners started together
 * never apply or revert the same seed twice.
 */
export class SeedRunner {
  private readonly client: DatabaseClient;
  private readonly seeds: readonly Seed[];
  private readonly tableName: string;
  private readonly lockKey: string;
  private readonly dialect: SqlDialect;
  private readonly transactionOptions: RunnerTransactionOptions;
  private readonly perItemTransaction: boolean;

  constructor(
    client: DatabaseClient,
    seeds: readonly Seed[],
    options: SeedRunnerOptions = {},
  ) {
    if (!client) throw new TypeError("A database client is required.");
    this.client = client;
    this.seeds = normalizeSeeds(seeds);
    this.tableName = options.tableName ?? DEFAULT_SEED_TABLE;
    this.lockKey = options.lockKey ?? DEFAULT_SEED_LOCK;
    this.dialect = getSqlDialect(options.dialect);
    this.transactionOptions = { ...options.transaction };
    this.perItemTransaction = options.perItemTransaction ?? true;

    validateIdentifier(this.tableName, "seed table name");
    validateLockKey(this.lockKey, "seed lock key");
  }

  /**
   * Returns the seed runner status.
   */
  public async status(): Promise<SeedStatus> {
    await this.ensureSeedTable();
    const applied = await this.getAppliedSeeds();
    return { pending: this.computePending(applied), applied };
  }

  /**
   * Executes every pending seed in order.
   */
  public async run(): Promise<SeedResult> {
    await this.ensureSeedTable();
    const before = await this.getAppliedSeeds();
    const pending = this.computePending(before);
    if (pending.length === 0) return { applied: [], skipped: before };

    const newlyApplied: SeedRecord[] = [];
    const skipped: SeedRecord[] = [...before];

    if (!this.perItemTransaction) {
      await this.client.transaction(async (transaction) => {
        await this.acquireSeedLock(transaction);
        const applied = await this.getAppliedSeeds(transaction);
        skipped.push(...applied.filter((r) => !hasName(before, r.name)));
        for (const seed of this.computePending(applied)) {
          await this.executeSeed(transaction, seed);
          newlyApplied.push(await this.recordSeed(transaction, seed));
        }
      }, this.buildTransactionOptions());
      return { applied: newlyApplied, skipped };
    }

    for (const seed of pending) {
      const outcome = await this.client.transaction(async (transaction) => {
        await this.acquireSeedLock(transaction);
        const applied = await this.getAppliedSeeds(transaction);
        const existing = applied.find((r) => r.name === seed.name);
        if (existing) return { record: existing, skipped: true } as const;
        await this.executeSeed(transaction, seed);
        const record = await this.recordSeed(transaction, seed);
        return { record, skipped: false } as const;
      }, this.buildTransactionOptions());
      if (outcome.skipped) skipped.push(outcome.record);
      else newlyApplied.push(outcome.record);
    }

    return { applied: newlyApplied, skipped };
  }

  /**
   * Executes one named seed. Returns the existing record when already
   * applied.
   */
  public async runOne(name: string): Promise<SeedRecord> {
    validateSeedName(name);
    await this.ensureSeedTable();
    const seed = this.seeds.find((candidate) => candidate.name === name);
    if (!seed) {
      throw this.seedError(`Seed "${name}" is not registered.`, {
        metadata: { name },
      });
    }

    return this.client.transaction(async (transaction) => {
      await this.acquireSeedLock(transaction);
      const current = await this.getAppliedSeeds(transaction);
      const alreadyApplied = current.find((record) => record.name === name);
      if (alreadyApplied) return alreadyApplied;
      await this.executeSeed(transaction, seed);
      return this.recordSeed(transaction, seed);
    }, this.buildTransactionOptions());
  }

  /**
   * Rolls back the most recently applied seed.
   */
  public async rollback(): Promise<SeedRecord | null> {
    const [record] = await this.rollbackSteps(1);
    return record ?? null;
  }

  /**
   * Rolls back every applied seed in reverse execution order.
   */
  public rollbackAll(): Promise<readonly SeedRecord[]> {
    return this.rollbackSteps(Number.POSITIVE_INFINITY);
  }

  /**
   * Creates the seed tracking table if it does not exist, adding the
   * `sequence` column to tables created by earlier versions.
   */
  public async ensureSeedTable(): Promise<void> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const { varchar255, timestamp } = this.dialect.types;
    const ddl =
      `CREATE TABLE IF NOT EXISTS ${q(this.tableName)} (` +
      `${q("name")} ${varchar255} PRIMARY KEY, ` +
      `${q("applied_at")} ${timestamp} NOT NULL DEFAULT ${this.dialect.currentTimestamp}, ` +
      `${q("sequence")} BIGSERIAL NOT NULL)`;
    const upgrade =
      `ALTER TABLE ${q(this.tableName)} ` +
      `ADD COLUMN IF NOT EXISTS ${q("sequence")} BIGSERIAL NOT NULL`;
    try {
      await this.client.executeRawUnsafe(ddl);
      await this.client.executeRawUnsafe(upgrade);
    } catch (error) {
      throw this.seedError("Failed to initialize the seed tracking table.", {
        cause: error,
        metadata: { tableName: this.tableName },
      });
    }
  }

  /**
   * Returns all applied seeds ordered by execution sequence.
   */
  public async getAppliedSeeds(
    transaction?: DatabaseTransactionContext,
  ): Promise<readonly SeedRecord[]> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const sql =
      `SELECT ${q("name")}, ${q("applied_at")}, ${q("sequence")} ` +
      `FROM ${q(this.tableName)} ORDER BY ${q("sequence")} ASC`;
    try {
      const rows = await this.executor(transaction).query<SeedRow>(sql);
      return rows.map((row) => ({
        name: row.name,
        appliedAt: new Date(row.applied_at),
        sequence: Number(row.sequence),
      }));
    } catch (error) {
      throw this.seedError("Failed to read seed execution history.", {
        cause: error,
        metadata: { tableName: this.tableName },
      });
    }
  }

  /**
   * Alias of {@link getAppliedSeeds}.
   */
  public getHistory(): Promise<readonly SeedRecord[]> {
    return this.getAppliedSeeds();
  }

  private async rollbackSteps(limit: number): Promise<readonly SeedRecord[]> {
    await this.ensureSeedTable();
    const rolledBack: SeedRecord[] = [];

    if (!this.perItemTransaction) {
      await this.client.transaction(async (transaction) => {
        await this.acquireSeedLock(transaction);
        const applied = [...(await this.getAppliedSeeds(transaction))];
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
        await this.acquireSeedLock(transaction);
        const applied = await this.getAppliedSeeds(transaction);
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
    record: SeedRecord,
  ): Promise<void> {
    const seed = this.seeds.find((candidate) => candidate.name === record.name);
    if (!seed) {
      throw this.seedError(
        `Seed "${record.name}" is recorded as applied but is not registered.`,
        { metadata: { name: record.name } },
      );
    }
    if (!seed.rollback) {
      throw this.seedError(
        `Seed "${seed.name}" does not define a rollback operation.`,
        { metadata: { name: seed.name } },
      );
    }
    try {
      await seed.rollback(transaction);
    } catch (error) {
      throw this.seedError(`Rollback of seed "${seed.name}" failed.`, {
        cause: error,
        metadata: { name: seed.name },
      });
    }
    await this.deleteSeedRecord(transaction, seed.name);
  }

  private computePending(applied: readonly SeedRecord[]): readonly Seed[] {
    const names = new Set(applied.map((record) => record.name));
    return this.seeds.filter((seed) => !names.has(seed.name));
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

  private async executeSeed(
    transaction: DatabaseTransactionContext,
    seed: Seed,
  ): Promise<void> {
    try {
      await seed.run(transaction);
    } catch (error) {
      throw this.seedError(`Seed "${seed.name}" failed.`, {
        cause: error,
        metadata: { name: seed.name, order: seed.order ?? 0 },
      });
    }
  }

  private async recordSeed(
    transaction: DatabaseTransactionContext,
    seed: Seed,
  ): Promise<SeedRecord> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const sql =
      `INSERT INTO ${q(this.tableName)} (${q("name")}) ` +
      `VALUES (${this.dialect.placeholder(1)}) ` +
      `RETURNING ${q("name")}, ${q("applied_at")}, ${q("sequence")}`;
    try {
      const rows = await this.executor(transaction).query<SeedRow>(sql, seed.name);
      const row = rows[0];
      return {
        name: seed.name,
        appliedAt: row ? new Date(row.applied_at) : new Date(),
        sequence: row ? Number(row.sequence) : 0,
      };
    } catch (error) {
      throw this.seedError(`Failed to record seed "${seed.name}".`, {
        cause: error,
        metadata: { name: seed.name },
      });
    }
  }

  private async deleteSeedRecord(
    transaction: DatabaseTransactionContext,
    name: string,
  ): Promise<void> {
    const q = (id: string) => this.dialect.quoteIdentifier(id);
    const sql =
      `DELETE FROM ${q(this.tableName)} ` +
      `WHERE ${q("name")} = ${this.dialect.placeholder(1)}`;
    try {
      await this.executor(transaction).execute(sql, name);
    } catch (error) {
      throw this.seedError(`Failed to remove seed record "${name}".`, {
        cause: error,
        metadata: { name },
      });
    }
  }

  private async acquireSeedLock(
    transaction: DatabaseTransactionContext,
  ): Promise<void> {
    try {
      await this.executor(transaction).execute(
        this.dialect.advisoryTransactionLock(),
        hashLockKey(this.lockKey),
      );
    } catch (error) {
      throw this.seedError("Failed to acquire the database seed lock.", {
        cause: error,
        metadata: { lockKey: this.lockKey },
      });
    }
  }

  private seedError(
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

function hasName(records: readonly SeedRecord[], name: string): boolean {
  return records.some((record) => record.name === name);
}

/**
 * Creates a seed runner.
 */
export function createSeedRunner(
  client: DatabaseClient,
  seeds: readonly Seed[],
  options?: SeedRunnerOptions,
): SeedRunner {
  return new SeedRunner(client, seeds, options);
}

/**
 * Validates and sorts seed definitions (stable sort on `order`).
 */
export function normalizeSeeds(seeds: readonly Seed[]): readonly Seed[] {
  if (!Array.isArray(seeds)) {
    throw new TypeError("Seeds must be an array.");
  }

  const normalized = seeds
    .map((seed) => {
      validateSeed(seed);
      return Object.freeze({ ...seed });
    })
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

  const names = new Set<string>();
  for (const seed of normalized) {
    if (names.has(seed.name)) {
      throw new TypeError(`Duplicate seed name: "${seed.name}".`);
    }
    names.add(seed.name);
  }

  return Object.freeze(normalized);
}

/**
 * Validates one seed definition.
 */
export function validateSeed(seed: Seed): void {
  if (!seed || typeof seed !== "object") {
    throw new TypeError("A seed definition is required.");
  }
  validateSeedName(seed.name);
  if (seed.order !== undefined && !Number.isInteger(seed.order)) {
    throw new TypeError(`Seed "${seed.name}" has an invalid order.`);
  }
  if (typeof seed.run !== "function") {
    throw new TypeError(`Seed "${seed.name}" requires a run function.`);
  }
  if (seed.rollback !== undefined && typeof seed.rollback !== "function") {
    throw new TypeError(`Seed "${seed.name}" has an invalid rollback function.`);
  }
}

function validateSeedName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("Seed name is required.");
  }
  if (name.length > 255) {
    throw new TypeError("Seed name cannot exceed 255 characters.");
  }
}
