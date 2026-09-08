import { describe, it, expect } from "vitest";
import { DatabaseError, DatabaseOperation, isDatabaseError } from "@zudojs/errors";

import {
  Database,
  DatabaseClient,
  DatabaseConnectionManager,
  TransactionManager,
  createUnitOfWork,
  getDatabase,
  getTransactionContextFromError,
  isTransactionCommitted,
  isTransactionFailed,
  noopDatabaseLogger,
  resetDatabase,
  withTransactionRetry,
  type DatabaseConnectionEvent,
} from "../src/index.js";
import { createStubPrisma, prismaError, type QueryResponder } from "./helpers/stubPrisma.js";

function setup(respond?: QueryResponder) {
  const prisma = createStubPrisma({ respond });
  const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
  return { prisma, client };
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("DatabaseConnectionManager", () => {
  it("wraps an existing client instead of creating a second state machine", async () => {
    const { client } = setup();
    const manager = new DatabaseConnectionManager({ client });
    expect(manager.getClient()).toBe(client);
    await manager.connect();
    expect(client.getStatus()).toBe("connected");
  });

  it("skips overlapping scheduled health checks", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { client } = setup(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(30);
      inFlight -= 1;
      return [{ result: 1 }];
    });
    const manager = new DatabaseConnectionManager({
      client,
      healthCheckIntervalMs: 5,
      healthCheckTimeoutMs: 1_000,
      reconnect: false,
    });
    await manager.connect();
    await tick(40);
    manager.stopHealthChecks();
    await manager.runScheduledHealthCheck();
    expect(maxInFlight).toBe(1);
    await manager.destroy();
  });

  it("times out a hung health check and reconnects with backoff", async () => {
    let failing = true;
    const { prisma, client } = setup(() => {
      if (failing) throw prismaError("P1001", "down");
      return [{ result: 1 }];
    });
    const events: DatabaseConnectionEvent[] = [];
    const manager = new DatabaseConnectionManager({
      client,
      healthCheckTimeoutMs: 50,
      reconnect: { failureThreshold: 1, maxAttempts: 3, baseDelayMs: 1 },
    });
    manager.on((event) => events.push(event));
    await manager.connect();
    const connectsBefore = prisma.connectCount;

    await manager.runScheduledHealthCheck();
    expect(events).toContain("error");
    expect(events).toContain("reconnecting");
    expect(prisma.connectCount).toBeGreaterThan(connectsBefore);
    expect(manager.getLastHealth()?.healthy).toBe(false);

    failing = false;
    await manager.runScheduledHealthCheck();
    expect(manager.getLastHealth()?.healthy).toBe(true);
    await manager.destroy();
  });

  it("validates interval configuration", () => {
    const { client } = setup();
    expect(
      () => new DatabaseConnectionManager({ client, healthCheckIntervalMs: 0 }),
    ).toThrow(TypeError);
  });
});

describe("Database facade", () => {
  it("wraps an existing client and guards the singleton against ignored options", async () => {
    await resetDatabase();
    const { client } = setup();
    const database = getDatabase(client);
    expect(database).toBeInstanceOf(Database);
    expect(database.getClient()).toBe(client);
    expect(getDatabase()).toBe(database);
    expect(getDatabase(client)).toBe(database);
    expect(() => getDatabase({ logger: noopDatabaseLogger })).toThrow(TypeError);
    await resetDatabase();
    expect(getDatabase(client)).not.toBe(database);
    await resetDatabase();
  });

  it("clears the singleton even when destroy fails", async () => {
    await resetDatabase();
    const prisma = createStubPrisma({ disconnectError: new Error("cannot close") });
    const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
    const database = getDatabase(client);
    await database.connect();
    await expect(resetDatabase()).rejects.toBeInstanceOf(DatabaseError);
    const { client: fresh } = setup();
    expect(getDatabase(fresh)).not.toBe(database);
    await resetDatabase();
  });
});

describe("TransactionManager", () => {
  it("returns a committed context from run()", async () => {
    const { client } = setup();
    const manager = new TransactionManager(client);
    const outcome = await manager.run(async (_tx, context) => {
      expect(context.status).toBe("active");
      return 42;
    }, { transactionId: "tx-1", metadata: { userId: "u1" } });
    expect(outcome.result).toBe(42);
    expect(outcome.context.transactionId).toBe("tx-1");
    expect(isTransactionCommitted(outcome.context)).toBe(true);
  });

  it("enriches failures with the transaction context and metadata", async () => {
    const { client } = setup();
    const manager = new TransactionManager(client);
    try {
      await manager.execute(
        async () => {
          throw prismaError("P2002");
        },
        { transactionId: "tx-123", metadata: { userId: "u1" } },
      );
      throw new Error("expected rejection");
    } catch (error) {
      expect(isDatabaseError(error)).toBe(true);
      const failed = error as DatabaseError;
      expect(failed.metadata.transactionId).toBe("tx-123");
      expect(failed.metadata.transactionStatus).toBe("failed");
      expect(failed.metadata.userId).toBe("u1");
      expect(failed.databaseCode).toBe("P2002");
      expect(failed.operation).toBe(DatabaseOperation.TRANSACTION);
      const context = getTransactionContextFromError(error);
      expect(context && isTransactionFailed(context)).toBe(true);
    }
  });

  it("rejects non-function callbacks with TypeError", async () => {
    const { client } = setup();
    await expect(
      new TransactionManager(client).execute(null as unknown as () => Promise<void>),
    ).rejects.toThrow(TypeError);
    await expect(
      createUnitOfWork(client).execute(null as unknown as () => Promise<void>),
    ).rejects.toThrow(TypeError);
  });
});

describe("withTransactionRetry", () => {
  it("retries serialization failures by default", async () => {
    const { client } = setup();
    let attempts = 0;
    const result = await withTransactionRetry(
      client,
      async () => {
        attempts += 1;
        if (attempts < 3) throw prismaError("P2034");
        return "done";
      },
      { retryDelayMs: 0 },
    );
    expect(result).toBe("done");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    const { client } = setup();
    let attempts = 0;
    await expect(
      withTransactionRetry(
        client,
        async () => {
          attempts += 1;
          throw prismaError("P2002");
        },
        { retries: 3, retryDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ databaseCode: "P2002" });
    expect(attempts).toBe(1);
  });

  it("honours a custom predicate and the retries cap", async () => {
    const { client } = setup();
    let attempts = 0;
    await expect(
      withTransactionRetry(
        client,
        async () => {
          attempts += 1;
          throw new Error("flaky");
        },
        { retries: 2, retryDelayMs: 0, shouldRetry: () => true },
      ),
    ).rejects.toThrow("flaky");
    expect(attempts).toBe(3);
  });
});

describe("DatabaseUnitOfWork", () => {
  it("normalises callback failures with the transaction operation", async () => {
    const { client } = setup();
    await expect(
      createUnitOfWork(client).execute(async () => {
        throw prismaError("P2025");
      }),
    ).rejects.toMatchObject({
      operation: DatabaseOperation.TRANSACTION,
      databaseCode: "P2025",
      statusCode: 404,
    });
  });
});
