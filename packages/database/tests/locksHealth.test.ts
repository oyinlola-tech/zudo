import { describe, it, expect } from "vitest";
import { DatabaseError, ErrorCode } from "@zudojs/errors";

import {
  DatabaseClient,
  DatabaseLockManager,
  DatabaseUnhealthyError,
  acquireAdvisoryLock,
  assertDatabaseHealth,
  checkDatabaseHealth,
  checkDatabaseReadiness,
  fnv1a64,
  getHealthCheckCause,
  hashLockKey,
  lockRow,
  normalizeAdvisoryKey,
  normalizeAdvisoryKeyPair,
  noopDatabaseLogger,
  type DatabaseTransactionContext,
} from "../src/index.js";
import { createStubPrisma, prismaError, type QueryResponder } from "./helpers/stubPrisma.js";

function setup(respond?: QueryResponder) {
  const prisma = createStubPrisma({ respond });
  const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
  return { prisma, client };
}

describe("advisory keys", () => {
  it("uses the FNV-1a 64 offset basis and matches reference vectors", () => {
    // Reference FNV-1a 64 values.
    expect(fnv1a64("")).toBe(0xcbf29ce484222325n);
    expect(fnv1a64("a")).toBe(0xaf63dc4c8601ec8cn);
    expect(fnv1a64("foobar")).toBe(0x85944171f73967e8n);
  });

  it("normalizes to a signed 64-bit bigint shared with the runners", () => {
    expect(normalizeAdvisoryKey("database:migrations")).toBe(
      hashLockKey("database:migrations"),
    );
    expect(normalizeAdvisoryKey("x")).toBe(BigInt.asIntN(64, fnv1a64("x")));
  });

  it("produces int32 pairs for the namespaced form", () => {
    const [ns, key] = normalizeAdvisoryKeyPair("orders", "order:1");
    expect(Number.isInteger(ns)).toBe(true);
    expect(ns).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(ns).toBeLessThan(2 ** 31);
    expect(key).not.toBe(ns);
  });
});

describe("lockRow / withRowLock", () => {
  it("returns acquired:true when the row was locked", async () => {
    const { prisma, client } = setup(() => [{ "?column?": 1 }]);
    await client.transaction(async (tx) => {
      const result = await lockRow(tx, "orders", 7, { mode: "for-no-key-update" });
      expect(result).toEqual({ acquired: true, lockKey: "orders:7", mode: "for-no-key-update" });
    });
    const query = prisma.queries.find((q) => q.sql.includes("FOR NO KEY UPDATE"));
    expect(query?.kind).toBe("query");
    expect(query?.values).toEqual([7]);
  });

  it("throws not-found when the row does not exist", async () => {
    const { client } = setup(() => []);
    const manager = new DatabaseLockManager(client);
    await expect(
      manager.withRowLock("orders", 7, async () => "unreachable"),
    ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND, statusCode: 404 });
  });

  it("reports acquired:false with skipLocked and withRowLock refuses to run", async () => {
    const { client } = setup(() => []);
    let ran = false;
    await client.transaction(async (tx) => {
      const result = await lockRow(tx, "orders", 7, { skipLocked: true });
      expect(result.acquired).toBe(false);
    });
    const manager = new DatabaseLockManager(client);
    await expect(
      manager.withRowLock("orders", 7, async () => {
        ran = true;
      }, { skipLocked: true }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    expect(ran).toBe(false);
  });

  it("applies lock_timeout and forwards transaction options", async () => {
    const { prisma, client } = setup(() => [{ acquired: true }]);
    const manager = new DatabaseLockManager(client);
    await manager.withAdvisoryLock("jobs", async () => "ok", {
      timeoutMs: 250,
      transaction: { timeoutMs: 10_000 },
    });
    expect(prisma.queries[0]?.sql).toBe("SET LOCAL lock_timeout = 250");
    expect(prisma.queries[1]?.sql).toBe("SELECT pg_advisory_xact_lock($1) AS acquired");
    expect(prisma.transactionOptions[0]).toEqual({ timeout: 10_000 });
  });

  it("uses the two-int form when a namespace is given", async () => {
    const { prisma, client } = setup(() => [{ acquired: true }]);
    await client.transaction(async (tx) => {
      await acquireAdvisoryLock(tx, "order:1", { namespace: "orders" });
    });
    expect(prisma.queries[0]?.sql).toBe("SELECT pg_advisory_xact_lock($1, $2) AS acquired");
    expect(prisma.queries[0]?.values).toHaveLength(2);
  });

  it("noWait throws a conflict when the lock is held", async () => {
    const { client } = setup(() => [{ acquired: false }]);
    await expect(
      client.transaction(async (tx) =>
        acquireAdvisoryLock(tx as DatabaseTransactionContext, "jobs", { noWait: true }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it("rejects invalid identifiers before touching the database", async () => {
    const { prisma, client } = setup();
    const manager = new DatabaseLockManager(client);
    await expect(
      manager.withRowLock('orders"; DROP TABLE x;--', 1, async () => 1),
    ).rejects.toThrow(TypeError);
    expect(prisma.queries).toHaveLength(0);
  });
});

describe("health checks", () => {
  it("reports healthy with latency", async () => {
    const { client } = setup(() => [{ result: 1 }]);
    const health = await checkDatabaseHealth(client);
    expect(health.healthy).toBe(true);
    expect(health.status).toBe("healthy");
    expect(await checkDatabaseReadiness(client)).toMatchObject({ ready: true });
  });

  it("times out and surfaces a timeout error", async () => {
    const { client } = setup(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
    );
    const health = await checkDatabaseHealth(client, { timeoutMs: 5 });
    expect(health.healthy).toBe(false);
    expect(health.error?.code).toBe(ErrorCode.DATABASE_TIMEOUT);
  });

  it("keeps the real cause and maps Prisma codes without leaking hosts", async () => {
    const raw = prismaError("P1001", "Can't reach database server at `db.internal:5432`");
    const { client } = setup(() => {
      throw raw;
    });
    const health = await checkDatabaseHealth(client);
    expect(health.healthy).toBe(false);
    expect(health.error?.databaseCode).toBe("P1001");
    expect(health.error?.message).not.toMatch(/db\.internal/);
    expect(JSON.stringify(health)).not.toMatch(/db\.internal/);
    const cause = getHealthCheckCause(health) as DatabaseError;
    expect(cause.cause).toBe(raw);

    await expect(assertDatabaseHealth(client)).rejects.toBeInstanceOf(DatabaseUnhealthyError);
    try {
      await assertDatabaseHealth(client);
    } catch (error) {
      expect(((error as DatabaseUnhealthyError).cause as DatabaseError).cause).toBe(raw);
      expect((error as DatabaseUnhealthyError).health.status).toBe("unhealthy");
    }
  });
});
