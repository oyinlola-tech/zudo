/**
 * @zudojs/storage — Round 12 regression tests.
 *
 * One describe block per academy finding.
 */

import { describe, it, expect } from "vitest";
import { ErrorCode, NotFoundError, StorageError, isBaseError } from "@zudojs/errors";

import { BaseRepository, mapRepositoryError } from "../src/repository/index.js";
import type { Database, Query } from "../src/types/index.js";

function failingDatabase(error: unknown): Database {
  const fail = async (_query: Query): Promise<never> => {
    throw error;
  };
  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    query: fail,
    execute: fail,
    transaction: async () => {
      throw error;
    },
    healthCheck: async () => ({ healthy: true, latencyMs: 0, status: "ok" }),
    getPoolStats: () => ({ total: 0, idle: 0, active: 0, waiting: 0 }),
  };
}

function pgError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

interface Task extends Record<string, unknown> {
  readonly id: string;
  readonly ownerId: string;
}

/* ─── #82: raw PostgreSQL errors passed straight through BaseRepository ──── */

describe("#82 BaseRepository maps driver errors to StorageError", () => {
  const fkViolation = pgError(
    "23503",
    'insert or update on table "tasks" violates foreign key constraint "tasks_owner_fkey"',
    { constraint: "tasks_owner_fkey", table: "tasks", detail: "Key (owner_id)=(x) is not present" },
  );

  it("turns a foreign key violation into an exposable 409 without the constraint name", async () => {
    const repo = new BaseRepository<Task, string>(failingDatabase(fkViolation), {
      tableName: "tasks",
    });

    const error = await repo.create({ id: "t1", ownerId: "x" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorageError);
    const storage = error as StorageError;
    expect(storage.statusCode).toBe(409);
    expect(storage.code).toBe(ErrorCode.CONFLICT);
    expect(storage.expose).toBe(true);
    expect(storage.message).not.toContain("tasks_owner_fkey");
    expect(storage.message).not.toContain("owner_id");
    expect(storage.cause).toBe(fkViolation);
    expect(storage.metadata).toMatchObject({
      table: "tasks",
      operation: "create",
      constraint: "tasks_owner_fkey",
      databaseCode: "23503",
    });
  });

  it.each([
    ["23505", 409, ErrorCode.CONFLICT, true],
    ["23514", 409, ErrorCode.CONFLICT, true],
    ["23502", 400, ErrorCode.INVALID_INPUT, true],
    ["22001", 400, ErrorCode.INVALID_INPUT, true],
    ["22P02", 400, ErrorCode.INVALID_INPUT, true],
    ["40001", 409, ErrorCode.CONFLICT, false],
    ["40P01", 409, ErrorCode.CONFLICT, false],
    ["08006", 503, ErrorCode.STORAGE, false],
    ["57014", 503, ErrorCode.TIMEOUT, false],
    ["XX000", 500, ErrorCode.STORAGE, false],
  ])("maps SQLSTATE %s to %i", async (code, status, errorCode, expose) => {
    const repo = new BaseRepository<Task, string>(
      failingDatabase(pgError(code, `driver says: secret host db-1.internal ${code}`)),
      { tableName: "tasks" },
    );
    const error = (await repo.findById("t1").catch((e: unknown) => e)) as StorageError;
    expect(error).toBeInstanceOf(StorageError);
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(errorCode);
    expect(error.expose).toBe(expose);
    expect(error.message).not.toContain("db-1.internal");
    expect(error.metadata).toMatchObject({ databaseCode: code, operation: "findById" });
  });

  it("marks serialization failures and deadlocks retryable", async () => {
    const repo = new BaseRepository<Task, string>(
      failingDatabase(pgError("40001", "could not serialize access")),
      { tableName: "tasks" },
    );
    const error = (await repo.count().catch((e: unknown) => e)) as StorageError;
    expect(error.metadata).toMatchObject({ retryable: true });
  });

  it("passes framework errors through and wraps unknown failures", async () => {
    const notFound = new NotFoundError("gone");
    const passthrough = new BaseRepository<Task, string>(failingDatabase(notFound), {
      tableName: "tasks",
    });
    await expect(passthrough.findById("t1")).rejects.toBe(notFound);

    const plain = new Error("socket hang up");
    const wrapped = new BaseRepository<Task, string>(failingDatabase(plain), {
      tableName: "tasks",
    });
    const error = (await wrapped.delete("t1").catch((e: unknown) => e)) as StorageError;
    expect(isBaseError(error)).toBe(true);
    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
    expect(error.cause).toBe(plain);
    expect(error.metadata).toMatchObject({ operation: "delete", table: "tasks" });
  });

  it("is exported for adapters and custom repositories", () => {
    const mapped = mapRepositoryError(pgError("23505", "dup"), {
      table: "tasks",
      operation: "create",
    });
    expect(mapped.statusCode).toBe(409);
    expect(mapRepositoryError(mapped, { table: "tasks", operation: "create" })).toBe(mapped);
  });
});
