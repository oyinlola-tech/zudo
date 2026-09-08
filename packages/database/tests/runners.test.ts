import { describe, it, expect } from "vitest";
import { DatabaseError } from "@zudojs/errors";

import {
  DatabaseClient,
  MigrationRunner,
  SeedRunner,
  UnsupportedDialectError,
  noopDatabaseLogger,
  type Migration,
  type Seed,
} from "../src/index.js";
import { createStubPrisma, type RecordedQuery } from "./helpers/stubPrisma.js";

interface MigrationRow {
  version: bigint;
  name: string;
  applied_at: Date;
}

interface SeedRow {
  name: string;
  applied_at: Date;
  sequence: bigint;
}

/**
 * Tiny in-memory model of the tracking tables so the runners can be driven
 * end to end through a stub Prisma client.
 */
function createMigrationBackend(initial: MigrationRow[] = []) {
  const rows = [...initial];
  const prisma = createStubPrisma({
    respond: (sql, values) => {
      if (/^SELECT "version"/.test(sql)) {
        return [...rows].sort((a, b) => Number(a.version - b.version));
      }
      if (/^INSERT INTO/.test(sql)) {
        rows.push({
          version: values[0] as bigint,
          name: values[1] as string,
          applied_at: new Date(),
        });
        return 1;
      }
      if (/^DELETE FROM/.test(sql)) {
        const index = rows.findIndex((r) => r.version === (values[0] as bigint));
        if (index >= 0) rows.splice(index, 1);
        return index >= 0 ? 1 : 0;
      }
      return undefined;
    },
  });
  const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
  return { prisma, client, rows };
}

function createSeedBackend(initial: SeedRow[] = []) {
  const rows = [...initial];
  let sequence = rows.reduce((max, r) => Math.max(max, Number(r.sequence)), 0);
  const prisma = createStubPrisma({
    respond: (sql, values) => {
      if (/^SELECT "name"/.test(sql)) {
        return [...rows].sort((a, b) => Number(a.sequence - b.sequence));
      }
      if (/^INSERT INTO/.test(sql)) {
        sequence += 1;
        const row: SeedRow = {
          name: values[0] as string,
          applied_at: new Date("2026-01-01T00:00:00Z"),
          sequence: BigInt(sequence),
        };
        rows.push(row);
        return [row];
      }
      if (/^DELETE FROM/.test(sql)) {
        const index = rows.findIndex((r) => r.name === values[0]);
        if (index >= 0) rows.splice(index, 1);
        return index >= 0 ? 1 : 0;
      }
      return undefined;
    },
  });
  const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
  return { prisma, client, rows };
}

function identifierPositions(query: RecordedQuery): boolean {
  // A bind parameter must never appear where an identifier belongs.
  return /(TABLE IF NOT EXISTS|FROM|INTO|UPDATE)\s+\$\d/.test(query.sql);
}

describe("MigrationRunner", () => {
  const migrations: Migration[] = [
    { version: 1, name: "one", up: async () => {}, down: async () => {} },
    { version: 20260908120000, name: "timestamp", up: async () => {}, down: async () => {} },
  ];

  it("creates the tracking table with a quoted identifier and BIGINT version", async () => {
    const { prisma, client } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations, { tableName: "schema_history" });
    await runner.ensureMigrationTable();
    const ddl = prisma.queries.find((q) => q.sql.startsWith("CREATE TABLE"));
    expect(ddl?.sql).toContain('CREATE TABLE IF NOT EXISTS "schema_history"');
    expect(ddl?.sql).toContain('"version" BIGINT PRIMARY KEY');
    expect(ddl?.values).toEqual([]);
    expect(prisma.queries.some(identifierPositions)).toBe(false);
  });

  it("applies pending migrations, one transaction each, under the advisory lock", async () => {
    const { prisma, client, rows } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations);
    const result = await runner.migrate();
    expect(result.applied.map((r) => r.version)).toEqual([1, 20260908120000]);
    expect(rows.map((r) => r.version)).toEqual([1n, 20260908120000n]);
    expect(prisma.calls.filter((c) => c === "$transaction")).toHaveLength(2);
    const locks = prisma.queries.filter((q) => q.sql.includes("pg_advisory_xact_lock"));
    expect(locks).toHaveLength(2);
    expect(typeof locks[0]?.values[0]).toBe("bigint");
    expect(prisma.queries.some(identifierPositions)).toBe(false);
    // History is re-read inside every transaction after the lock.
    const inTx = prisma.queries.filter((q) => q.inTransaction && q.sql.startsWith("SELECT \"version\""));
    expect(inTx).toHaveLength(2);
  });

  it("skips a migration another runner applied while waiting on the lock", async () => {
    const { client, rows } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations);
    // Simulate a concurrent runner: version 1 appears after the pre-lock read.
    const original = client.transaction.bind(client);
    let injected = false;
    client.transaction = (async (callback, options) => {
      if (!injected) {
        injected = true;
        rows.push({ version: 1n, name: "one", applied_at: new Date() });
      }
      return original(callback, options);
    }) as typeof client.transaction;

    const result = await runner.migrate();
    expect(result.applied.map((r) => r.version)).toEqual([20260908120000]);
    expect(result.skipped.map((r) => r.version)).toContain(1);
    expect(rows.filter((r) => r.version === 1n)).toHaveLength(1);
  });

  it("forwards transaction options and supports one all-or-nothing batch", async () => {
    const { prisma, client } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations, {
      perItemTransaction: false,
      transaction: { timeoutMs: 120_000, maxWaitMs: 5_000 },
    });
    await runner.migrate();
    expect(prisma.calls.filter((c) => c === "$transaction")).toHaveLength(1);
    expect(prisma.transactionOptions[0]).toEqual({ timeout: 120_000, maxWait: 5_000 });
  });

  it("rolls back newest first and reports status", async () => {
    const { client, rows } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations);
    await runner.migrate();
    const reverted = await runner.rollback();
    expect(reverted?.version).toBe(20260908120000);
    expect(rows.map((r) => r.version)).toEqual([1n]);
    const status = await runner.status();
    expect(status.currentVersion).toBe(1);
    expect(status.latestVersion).toBe(20260908120000);
    expect(status.pending.map((m) => m.version)).toEqual([20260908120000]);
  });

  it("rejects versions above Number.MAX_SAFE_INTEGER", () => {
    const { client } = createMigrationBackend();
    expect(
      () =>
        new MigrationRunner(client, [
          { version: 2 ** 53, name: "too-big", up: async () => {} },
        ]),
    ).toThrow(TypeError);
  });

  it("rejects empty lock keys and unsupported dialects", () => {
    const { client } = createMigrationBackend();
    expect(() => new MigrationRunner(client, [], { lockKey: "  " })).toThrow(TypeError);
    expect(() => new MigrationRunner(client, [], { dialect: "mysql" })).toThrow(
      UnsupportedDialectError,
    );
  });

  it("wraps migration failures as DatabaseError with the cause", async () => {
    const { client } = createMigrationBackend();
    const boom = new Error("boom");
    const runner = new MigrationRunner(client, [
      {
        version: 1,
        name: "fails",
        up: async () => {
          throw boom;
        },
      },
    ]);
    await expect(runner.migrate()).rejects.toMatchObject({
      message: 'Migration "fails" failed.',
      cause: boom,
    });
  });
});

describe("SeedRunner", () => {
  const seeds: Seed[] = [
    { name: "roles", order: 0, run: async () => {}, rollback: async () => {} },
    { name: "admin", order: 1, run: async () => {}, rollback: async () => {} },
  ];

  it("creates the tracking table with a sequence column and no identifier binds", async () => {
    const { prisma, client } = createSeedBackend();
    const runner = new SeedRunner(client, seeds);
    await runner.ensureSeedTable();
    const ddl = prisma.queries.find((q) => q.sql.startsWith("CREATE TABLE"));
    expect(ddl?.sql).toContain('CREATE TABLE IF NOT EXISTS "_seeds"');
    expect(ddl?.sql).toContain('"sequence" BIGSERIAL');
    expect(ddl?.values).toEqual([]);
    expect(prisma.queries.some(identifierPositions)).toBe(false);
  });

  it("rolls back in reverse execution order even when applied_at is identical", async () => {
    const { client } = createSeedBackend();
    const order: string[] = [];
    const tracked: Seed[] = seeds.map((seed) => ({
      ...seed,
      rollback: async () => {
        order.push(seed.name);
      },
    }));
    const runner = new SeedRunner(client, tracked, { perItemTransaction: false });
    const result = await runner.run();
    expect(result.applied.map((r) => r.name)).toEqual(["roles", "admin"]);
    expect(result.applied.map((r) => r.sequence)).toEqual([1, 2]);

    const first = await runner.rollback();
    expect(first?.name).toBe("admin");
    const rest = await runner.rollbackAll();
    expect(rest.map((r) => r.name)).toEqual(["roles"]);
    expect(order).toEqual(["admin", "roles"]);
  });

  it("runOne is idempotent and reads history under the lock", async () => {
    const { prisma, client } = createSeedBackend();
    const runner = new SeedRunner(client, seeds);
    const first = await runner.runOne("roles");
    const second = await runner.runOne("roles");
    expect(second).toEqual(first);
    const historyReads = prisma.queries.filter(
      (q) => q.inTransaction && q.sql.startsWith('SELECT "name"'),
    );
    expect(historyReads.length).toBeGreaterThanOrEqual(2);
  });

  it("throws for unregistered seeds", async () => {
    const { client } = createSeedBackend();
    const runner = new SeedRunner(client, seeds);
    await expect(runner.runOne("missing")).rejects.toBeInstanceOf(DatabaseError);
  });
});
