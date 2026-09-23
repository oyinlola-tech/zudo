/**
 * @zudojs/storage — batch 5 regression tests: undefined write values,
 * separate column allow-lists, reverse drain order and contention statuses.
 */

import { describe, expect, it } from "vitest";

import { BaseRepository } from "../src/repository/index.js";
import { ConnectionPool } from "../src/database/index.js";
import { InMemoryLockManager } from "../src/locking/index.js";
import { StorageLifecycleManager } from "../src/lifecycle/index.js";
import type {
  Connection,
  Database,
  Query,
  StorageLifecycle,
} from "../src/types/storage.type.js";

function recordingDatabase(): Database & { readonly queries: Query[] } {
  const queries: Query[] = [];
  return {
    queries,
    query: async (query: Query) => {
      queries.push(query);
      return { rows: [{ id: "u1" }], rowCount: 1, fields: [] };
    },
    execute: async (query: Query) => {
      queries.push(query);
      return { rowCount: 1 };
    },
  } as unknown as Database & { readonly queries: Query[] };
}

type User = Record<string, unknown>;

describe("BaseRepository treats undefined as not provided", () => {
  it("update omits undefined fields and writes explicit null", async () => {
    const db = recordingDatabase();
    const repo = new BaseRepository<User>(db, { tableName: "users" });

    const dto: User = { name: "Ada", bio: undefined, nickname: null };
    expect(Object.hasOwn(dto, "bio")).toBe(true);
    await repo.update("u1", dto);

    expect(db.queries[0]).toEqual({
      text: "UPDATE users SET name = $1, nickname = $2 WHERE id = $3 RETURNING *",
      parameters: ["Ada", null, "u1"],
    });
  });

  it("update with only undefined fields changes nothing and returns the row", async () => {
    const db = recordingDatabase();
    const repo = new BaseRepository<User>(db, { tableName: "users" });

    await expect(repo.update("u1", { bio: undefined })).resolves.toEqual({ id: "u1" });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]!.text).toMatch(/^SELECT \* FROM users WHERE id = \$1$/);
  });

  it("create omits undefined fields so column defaults apply", async () => {
    const db = recordingDatabase();
    const repo = new BaseRepository<User>(db, { tableName: "users" });

    await repo.create({ id: "u1", email: "a@b.c", role: undefined, bio: null });

    expect(db.queries[0]).toEqual({
      text: "INSERT INTO users (id, email, bio) VALUES ($1, $2, $3) RETURNING *",
      parameters: ["u1", "a@b.c", null],
    });
    await expect(repo.create({ role: undefined })).rejects.toThrow(/no properties/);
  });
});

describe("BaseRepository separate column allow-lists", () => {
  it("governs writes, filters and sorting independently", async () => {
    const db = recordingDatabase();
    const repo = new BaseRepository<User>(db, {
      tableName: "users",
      writableColumns: ["name"],
      filterableColumns: ["status"],
      sortableColumns: ["createdAt"],
    });

    await expect(repo.update("u1", { name: "x" })).resolves.toBeDefined();
    await expect(repo.update("u1", { status: "x" })).rejects.toThrow(/not allowed/);
    await expect(repo.count({ status: "active" })).resolves.toBe(0);
    await expect(repo.count({ name: "x" })).rejects.toThrow(/not allowed/);
    await expect(repo.findAll({ orderBy: "createdAt" })).resolves.toBeDefined();
    await expect(repo.findAll({ orderBy: "name" })).rejects.toThrow(/not allowed/);
  });

  it("falls back to columns for any list that is not supplied", async () => {
    const db = recordingDatabase();
    const repo = new BaseRepository<User>(db, {
      tableName: "users",
      columns: ["name", "status"],
      sortableColumns: ["createdAt"],
    });

    await expect(repo.update("u1", { status: "x" })).resolves.toBeDefined();
    await expect(repo.count({ name: "x" })).resolves.toBe(0);
    await expect(repo.update("u1", { secret: "x" })).rejects.toThrow(/not allowed/);
    await expect(repo.findAll({ orderBy: "name" })).rejects.toThrow(/not allowed/);
  });
});

describe("StorageLifecycleManager teardown order", () => {
  function component(name: string, log: string[]): StorageLifecycle {
    return {
      initialize: async () => undefined,
      start: async () => undefined,
      drain: async () => {
        log.push(`drain:${name}`);
      },
      shutdown: async () => {
        log.push(`shutdown:${name}`);
      },
      healthCheck: async () => ({ healthy: true, latencyMs: 0, status: "ready" }),
      getPhase: () => "ready",
    };
  }

  it("drains and shuts down in reverse registration order", async () => {
    const log: string[] = [];
    const manager = new StorageLifecycleManager();
    for (const name of ["pool", "repository", "cache"]) {
      await manager.register(component(name, log));
    }

    await manager.drain();
    await manager.shutdown();

    expect(log).toEqual([
      "drain:cache",
      "drain:repository",
      "drain:pool",
      "shutdown:cache",
      "shutdown:repository",
      "shutdown:pool",
    ]);
  });
});

describe("contention timeouts are not 504", () => {
  it("a lock acquire timeout is a 409 conflict", async () => {
    const locks = new InMemoryLockManager();
    await locks.acquire("orders:1", { ttl: 10_000 });

    await expect(
      locks.acquire("orders:1", { ttl: 10_000, timeout: 20, retryInterval: 5 }),
    ).rejects.toMatchObject({ code: "STORAGE_LOCK_ACQUIRE_TIMEOUT", statusCode: 409 });
  });

  it("a pool acquire timeout is a 503", async () => {
    const connection = {
      query: async () => ({ rows: [], rowCount: 0, fields: [] }),
      execute: async () => ({ rowCount: 0 }),
      ping: async () => true,
      close: async () => undefined,
    } as unknown as Connection;
    const pool = new ConnectionPool(async () => connection, {
      min: 0,
      max: 1,
      acquireTimeout: 20,
    });
    await pool.acquire();

    await expect(pool.acquire()).rejects.toMatchObject({
      code: "STORAGE_CONNECTION_ACQUIRE_TIMEOUT",
      statusCode: 503,
    });
  });
});
