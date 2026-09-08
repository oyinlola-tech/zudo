import { describe, it, expect } from "vitest";
import { DatabaseError, DatabaseOperation, ErrorCode, isDatabaseError } from "@zudojs/errors";

import {
  DatabaseClient,
  DatabaseAbortError,
  createDatabaseClient,
  buildPrismaTransactionOptions,
  normalizeDatabaseError,
  isRetryableTransactionError,
  isConflictError,
  isNotFoundError,
  getDatabaseErrorKind,
  getDatabaseErrorCode,
  noopDatabaseLogger,
} from "../src/index.js";
import { createStubPrisma, prismaError } from "./helpers/stubPrisma.js";

function client(prisma = createStubPrisma()) {
  return new DatabaseClient({ prisma, logger: noopDatabaseLogger });
}

describe("DatabaseClient construction", () => {
  it("throws a clear DatabaseError when neither prisma nor adapter is given", () => {
    expect(() => createDatabaseClient({ logger: noopDatabaseLogger })).toThrow(
      DatabaseError,
    );
    try {
      createDatabaseClient({ logger: noopDatabaseLogger });
    } catch (error) {
      expect(isDatabaseError(error)).toBe(true);
      expect((error as DatabaseError).message).toMatch(/adapter/);
      expect((error as DatabaseError).operation).toBe(DatabaseOperation.CONNECT);
    }
  });

  it("uses an injected prisma client", () => {
    const prisma = createStubPrisma();
    expect(client(prisma).getPrisma()).toBe(prisma);
  });
});

describe("DatabaseClient lifecycle", () => {
  it("shares one in-flight connect between concurrent callers", async () => {
    const prisma = createStubPrisma({ connectDelayMs: 20 });
    const db = client(prisma);
    const first = db.connect();
    const second = db.connect();
    expect(db.getStatus()).toBe("connecting");
    await Promise.all([first, second]);
    expect(prisma.connectCount).toBe(1);
    expect(db.getStatus()).toBe("connected");
  });

  it("ensureConnected awaits an in-flight connect before running queries", async () => {
    const prisma = createStubPrisma({ connectDelayMs: 20 });
    const db = client(prisma);
    void db.connect();
    await db.queryRawUnsafe("SELECT 1");
    expect(prisma.calls.indexOf("$connect")).toBe(0);
    expect(prisma.connectCount).toBe(1);
  });

  it("disconnect during connect waits and ends disconnected", async () => {
    const prisma = createStubPrisma({ connectDelayMs: 20 });
    const db = client(prisma);
    const connecting = db.connect();
    const disconnecting = db.disconnect();
    await Promise.all([connecting, disconnecting]);
    expect(db.getStatus()).toBe("disconnected");
    expect(prisma.calls).toEqual(["$connect", "$disconnect"]);
  });

  it("maps connect failures to a fixed connection error", async () => {
    const prisma = createStubPrisma({
      connectError: prismaError("P1001", "Can't reach database server at `db.internal:5432`"),
    });
    const db = client(prisma);
    await expect(db.connect()).rejects.toMatchObject({
      code: ErrorCode.DATABASE_CONNECTION,
      databaseCode: "P1001",
      statusCode: 503,
    });
    await expect(db.connect()).rejects.not.toThrow(/db\.internal/);
    expect(db.getStatus()).toBe("error");
  });

  it("rejects NaN and non-positive connection timeouts as 'no timeout'", async () => {
    const prisma = createStubPrisma({ connectDelayMs: 5 });
    const db = new DatabaseClient({
      prisma,
      logger: noopDatabaseLogger,
      connectionTimeoutMs: Number.NaN,
    });
    await expect(db.connect()).resolves.toBeUndefined();
  });

  it("times out connect when connectionTimeoutMs elapses", async () => {
    const prisma = createStubPrisma({ connectDelayMs: 50 });
    const db = new DatabaseClient({
      prisma,
      logger: noopDatabaseLogger,
      connectionTimeoutMs: 5,
    });
    await expect(db.connect()).rejects.toThrow(/timed out/);
  });

  it("healthCheck reports the real lifecycle status", async () => {
    const prisma = createStubPrisma();
    const db = client(prisma);
    expect((await db.healthCheck()).status).toBe("disconnected");
    await db.connect();
    expect((await db.healthCheck()).status).toBe("connected");
    await db.disconnect();
    expect((await db.healthCheck()).status).toBe("disconnected");
  });
});

describe("DatabaseClient raw operations", () => {
  it("passes positional parameters to $queryRawUnsafe", async () => {
    const prisma = createStubPrisma({ respond: () => [{ ok: 1 }] });
    const db = client(prisma);
    const rows = await db.queryRawUnsafe<{ ok: number }[]>("SELECT $1", [42]);
    expect(rows).toEqual([{ ok: 1 }]);
    expect(prisma.queries[0]).toMatchObject({ sql: "SELECT $1", values: [42] });
  });

  it("rejects an already-aborted signal before calling Prisma", async () => {
    const prisma = createStubPrisma();
    const db = client(prisma);
    const controller = new AbortController();
    controller.abort();
    await expect(
      db.queryRawUnsafe("SELECT 1", [], { signal: controller.signal }),
    ).rejects.toBeInstanceOf(DatabaseAbortError);
    expect(prisma.queries).toHaveLength(0);
  });

  it("rejects when the signal aborts while the query is running", async () => {
    const prisma = createStubPrisma({
      respond: () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
    });
    const db = client(prisma);
    const controller = new AbortController();
    const pending = db.queryRawUnsafe("SELECT 1", [], { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toMatchObject({ code: "ERR_ABORTED", statusCode: 499 });
  });

  it("applies timeoutMs to raw queries", async () => {
    const prisma = createStubPrisma({
      respond: () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
    });
    const db = client(prisma);
    await expect(
      db.queryRawUnsafe("SELECT 1", [], { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: ErrorCode.DATABASE_TIMEOUT });
  });

  it("maps Prisma errors thrown by raw queries", async () => {
    const prisma = createStubPrisma({
      respond: () => {
        throw prismaError("P2002", "Unique constraint failed", { target: ["email"] });
      },
    });
    const db = client(prisma);
    await expect(db.executeRawUnsafe("INSERT")).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
      statusCode: 409,
      databaseCode: "P2002",
      operation: DatabaseOperation.QUERY,
    });
  });
});

describe("DatabaseClient transactions", () => {
  it("forwards timeout, maxWait and isolation level as plain values", async () => {
    const prisma = createStubPrisma();
    const db = client(prisma);
    await db.transaction(async () => 1, {
      timeoutMs: 30_000,
      maxWaitMs: 2_000,
      isolationLevel: "Serializable",
    });
    expect(prisma.transactionOptions[0]).toEqual({
      timeout: 30_000,
      maxWait: 2_000,
      isolationLevel: "Serializable",
    });
  });

  it("fails loudly on unsupported isolation levels", () => {
    expect(() =>
      buildPrismaTransactionOptions({
        isolationLevel: "Snapshot" as unknown as "Serializable",
      }),
    ).toThrow(TypeError);
  });

  it("throws TypeError for a non-function callback", async () => {
    const db = client();
    await expect(
      db.transaction(undefined as unknown as () => Promise<void>),
    ).rejects.toThrow(TypeError);
  });

  it("wraps transaction failures with the transaction operation", async () => {
    const db = client();
    await expect(
      db.transaction(async () => {
        throw prismaError("P2034", "write conflict");
      }),
    ).rejects.toMatchObject({
      operation: DatabaseOperation.TRANSACTION,
      databaseCode: "P2034",
    });
  });
});

describe("normalizeDatabaseError", () => {
  it("maps P2025 to not-found (404)", () => {
    const error = normalizeDatabaseError(prismaError("P2025"));
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(isNotFoundError(error)).toBe(true);
    expect(getDatabaseErrorKind(error)).toBe("not-found");
  });

  it("maps P2003 to a constraint conflict", () => {
    const error = normalizeDatabaseError(prismaError("P2003"));
    expect(isConflictError(error)).toBe(true);
    expect(error.statusCode).toBe(409);
  });

  it("keeps Prisma target metadata but not the raw message for P1xxx", () => {
    const error = normalizeDatabaseError(
      prismaError("P1001", "Can't reach database server at `db.internal:5432`"),
    );
    expect(error.message).not.toMatch(/db\.internal/);
    expect(error.databaseCode).toBe("P1001");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("returns an existing DatabaseError untouched when nothing is added", () => {
    const original = new DatabaseError("x", { operation: DatabaseOperation.QUERY });
    expect(normalizeDatabaseError(original)).toBe(original);
  });

  it("attaches an operation to an unknown-operation DatabaseError", () => {
    const original = new DatabaseError("x");
    const enriched = normalizeDatabaseError(original, {
      operation: DatabaseOperation.MIGRATION,
    });
    expect(enriched.operation).toBe(DatabaseOperation.MIGRATION);
    expect(enriched.cause).toBe(original);
  });

  it("wraps plain errors with the fallback operation", () => {
    const error = normalizeDatabaseError(new Error("boom"), {
      operation: DatabaseOperation.INSERT,
    });
    expect(error.message).toBe("boom");
    expect(error.operation).toBe(DatabaseOperation.INSERT);
  });
});

describe("isRetryableTransactionError", () => {
  it("recognises P2034 directly and when wrapped", () => {
    const raw = prismaError("P2034");
    expect(isRetryableTransactionError(raw)).toBe(true);
    expect(isRetryableTransactionError(normalizeDatabaseError(raw))).toBe(true);
    expect(getDatabaseErrorCode(normalizeDatabaseError(raw))).toBe("P2034");
  });

  it("recognises PostgreSQL 40001 codes", () => {
    const error = Object.assign(new Error("serialization"), { code: "40001" });
    expect(isRetryableTransactionError(error)).toBe(true);
  });

  it("does not retry unique violations", () => {
    expect(isRetryableTransactionError(prismaError("P2002"))).toBe(false);
  });
});
