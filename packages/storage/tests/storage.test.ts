/**
 * @zudojs/storage — Tests
 *
 * Comprehensive tests for all storage modules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ConnectionPool } from "../src/database/index.js";
import { BaseRepository } from "../src/repository/index.js";
import { LocalObjectStorage } from "../src/objectStorage/index.js";
import { JsonSerializer } from "../src/serialization/index.js";
import { InMemoryLockManager } from "../src/locking/index.js";
import { StorageLifecycleManager } from "../src/lifecycle/index.js";
import { HealthChecker } from "../src/health/index.js";
import type {
  Connection,
  Database,
  Query,
  QueryResult,
  ExecuteResult,
  Transaction,
  TransactionOptions,
  StorageHealth,
  PoolStats,
  StorageLifecycle,
} from "../src/types/storage.type.js";

/* ─── Mock Database ───────────────────────────────────────────────────────── */

class MockConnection implements Connection {
  readonly id: string;
  state: "idle" | "connected" = "connected";

  constructor(id?: string) {
    this.id = id ?? `conn-${Math.random().toString(36).slice(2, 8)}`;
  }

  async query<T = Record<string, unknown>>(
    query: Query,
  ): Promise<QueryResult<T>> {
    return { rows: [] as T[], rowCount: 0, fields: [], durationMs: 1 };
  }

  async execute(_query: Query): Promise<ExecuteResult> {
    return { rowCount: 0, durationMs: 1 };
  }

  async ping(): Promise<boolean> {
    return this.state === "connected";
  }

  async close(): Promise<void> {
    this.state = "idle";
  }
}

class MockDatabase implements Database {
  connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query<T = Record<string, unknown>>(
    _query: Query,
  ): Promise<QueryResult<T>> {
    return { rows: [] as T[], rowCount: 0, fields: [], durationMs: 1 };
  }

  async execute(_query: Query): Promise<ExecuteResult> {
    return { rowCount: 0, durationMs: 1 };
  }

  async transaction<T>(
    callback: (tx: Transaction) => Promise<T>,
    _options?: TransactionOptions,
  ): Promise<T> {
    const tx: Transaction = {
      id: `tx-${Math.random().toString(36).slice(2, 8)}`,
      state: "active",
      query: async () => ({ rows: [], rowCount: 0, fields: [], durationMs: 1 }),
      execute: async () => ({ rowCount: 0, durationMs: 1 }),
      savepoint: async () => {},
      rollbackToSavepoint: async () => {},
    };
    return callback(tx);
  }

  async healthCheck(): Promise<StorageHealth> {
    return { healthy: true, latencyMs: 1, status: "ok" };
  }

  getPoolStats(): PoolStats {
    return { total: 1, idle: 1, active: 0, waiting: 0 };
  }
}

/* ─── Connection Pool ─────────────────────────────────────────────────────── */

describe("ConnectionPool", () => {
  it("creates connections via factory", async () => {
    const pool = new ConnectionPool(async () => new MockConnection(), {
      min: 2,
      max: 5,
    });
    await pool.initialize();
    const stats = pool.getStats();
    expect(stats.total).toBe(2);
    expect(stats.idle).toBe(2);
    await pool.drain();
  });

  it("acquires and releases connections", async () => {
    const pool = new ConnectionPool(async () => new MockConnection(), {
      min: 1,
      max: 3,
    });
    await pool.initialize();

    const conn = await pool.acquire();
    expect(pool.getStats().active).toBe(1);

    await pool.release(conn);
    expect(pool.getStats().idle).toBe(1);
    await pool.drain();
  });

  it("use() automatically releases connection", async () => {
    const pool = new ConnectionPool(async () => new MockConnection(), {
      min: 1,
      max: 3,
    });
    await pool.initialize();

    await pool.use(async (conn) => {
      expect(conn).toBeDefined();
      expect(pool.getStats().active).toBe(1);
    });

    expect(pool.getStats().active).toBe(0);
    await pool.drain();
  });

  it("rejects acquire when pool is closed", async () => {
    const pool = new ConnectionPool(async () => new MockConnection(), {
      min: 1,
      max: 3,
    });
    await pool.initialize();
    await pool.drain();

    await expect(pool.acquire()).rejects.toThrow("Pool is closed");
  });

  it("healthCheck returns healthy when connections exist", async () => {
    const pool = new ConnectionPool(async () => new MockConnection(), {
      min: 1,
      max: 3,
    });
    await pool.initialize();

    const health = await pool.healthCheck();
    expect(health.healthy).toBe(true);
    await pool.drain();
  });
});

/* ─── Base Repository ─────────────────────────────────────────────────────── */

describe("BaseRepository", () => {
  let db: MockDatabase;
  let repo: BaseRepository<{ id: string; name: string }, string>;

  beforeEach(() => {
    db = new MockDatabase();
    repo = new BaseRepository(db, { tableName: "users" });
  });

  it("constructs with table name", () => {
    expect(repo).toBeDefined();
  });

  it("constructs with custom primary key", () => {
    const customRepo = new BaseRepository(db, {
      tableName: "users",
      primaryKey: "user_id",
    });
    expect(customRepo).toBeDefined();
  });
});

/* ─── Local Object Storage ────────────────────────────────────────────────── */

describe("LocalObjectStorage", () => {
  let tmpDir: string;
  let storage: LocalObjectStorage;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "storage-test-"));
    storage = new LocalObjectStorage(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("puts and gets an object", async () => {
    const data = new TextEncoder().encode("hello world");
    const meta = await storage.put("test.txt", data, {
      contentType: "text/plain",
    });

    expect(meta.key).toBe("test.txt");
    expect(meta.contentType).toBe("text/plain");
    expect(meta.size).toBe(11);

    const retrieved = await storage.get("test.txt");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.metadata.key).toBe("test.txt");

    const content = await retrieved!.arrayBuffer();
    expect(new TextDecoder().decode(content)).toBe("hello world");
  });

  it("returns null for non-existent objects", async () => {
    const result = await storage.get("nonexistent.txt");
    expect(result).toBeNull();
  });

  it("checks object existence", async () => {
    expect(await storage.exists("test.txt")).toBe(false);
    await storage.put("test.txt", new Uint8Array([1, 2, 3]));
    expect(await storage.exists("test.txt")).toBe(true);
  });

  it("deletes objects", async () => {
    await storage.put("test.txt", new Uint8Array([1, 2, 3]));
    expect(await storage.exists("test.txt")).toBe(true);

    await storage.delete("test.txt");
    expect(await storage.exists("test.txt")).toBe(false);
  });

  it("gets object metadata", async () => {
    await storage.put("test.txt", new Uint8Array([1, 2, 3]));
    const meta = await storage.metadata("test.txt");
    expect(meta).not.toBeNull();
    expect(meta!.key).toBe("test.txt");
    expect(meta!.size).toBe(3);
  });

  it("lists objects", async () => {
    await storage.put("a.txt", new Uint8Array([1]));
    await storage.put("b.txt", new Uint8Array([2]));
    await storage.put("c.txt", new Uint8Array([3]));

    const result = await storage.list();
    expect(result.objects).toHaveLength(3);
  });

  it("prevents path traversal", async () => {
    await expect(
      storage.put("../../../etc/passwd", new Uint8Array([1])),
    ).rejects.toThrow("Path traversal detected");
  });
});

/* ─── JSON Serializer ─────────────────────────────────────────────────────── */

describe("JsonSerializer", () => {
  let serializer: JsonSerializer;

  beforeEach(() => {
    serializer = new JsonSerializer();
  });

  it("serializes and deserializes plain objects", () => {
    const data = { name: "test", count: 42 };
    const bytes = serializer.serialize(data);
    const result = serializer.deserialize<typeof data>(bytes);
    expect(result).toEqual(data);
  });

  it("handles BigInt", () => {
    const data = { balance: 1000000000000000000n };
    const bytes = serializer.serialize(data);
    const result = serializer.deserialize<typeof data>(bytes);
    expect(result.balance).toBe(1000000000000000000n);
    expect(typeof result.balance).toBe("bigint");
  });

  it("handles Date", () => {
    const data = { createdAt: new Date("2025-01-01T00:00:00Z") };
    const bytes = serializer.serialize(data);
    const result = serializer.deserialize<typeof data>(bytes);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("handles Uint8Array", () => {
    const data = { bytes: new Uint8Array([1, 2, 3]) };
    const bytes = serializer.serialize(data);
    const result = serializer.deserialize<typeof data>(bytes);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.bytes)).toEqual([1, 2, 3]);
  });

  it("handles nested structures", () => {
    const data = {
      user: { name: "test", tags: ["a", "b"] },
      scores: [1, 2, 3],
      meta: { created: new Date("2025-01-01") },
    };
    const bytes = serializer.serialize(data);
    const result = serializer.deserialize<typeof data>(bytes);
    expect(result.user.name).toBe("test");
    expect(result.scores).toEqual([1, 2, 3]);
    expect(result.meta.created).toBeInstanceOf(Date);
  });
});

/* ─── In-Memory Lock Manager ──────────────────────────────────────────────── */

describe("InMemoryLockManager", () => {
  let lockManager: InMemoryLockManager;

  beforeEach(() => {
    lockManager = new InMemoryLockManager();
  });

  afterEach(() => {
    lockManager.clear();
  });

  it("acquires and releases a lock", async () => {
    const lock = await lockManager.acquire("resource-1", {
      timeout: 1000,
      ttl: 5000,
    });

    expect(lock.lockId).toBeDefined();
    expect(lock.resource).toBe("resource-1");
    expect(await lockManager.isLocked("resource-1")).toBe(true);

    await lock.release();
    expect(await lockManager.isLocked("resource-1")).toBe(false);
  });

  it("tryAcquire returns null when locked", async () => {
    await lockManager.acquire("resource-1", { timeout: 1000, ttl: 5000 });
    const second = await lockManager.tryAcquire("resource-1", 5000);
    expect(second).toBeNull();
  });

  it("tryAcquire succeeds when not locked", async () => {
    const lock = await lockManager.tryAcquire("resource-1", 5000);
    expect(lock).not.toBeNull();
    await lock!.release();
  });

  it("extends lock TTL", async () => {
    const lock = await lockManager.acquire("resource-1", {
      timeout: 1000,
      ttl: 1000,
    });

    const ttl = 10000;
    await lock.extend(ttl);
    // After extend, expiresAt should be in the future (now + ttl)
    expect(lock.expiresAt.getTime()).toBeGreaterThan(Date.now() + ttl - 1000);
    await lock.release();
  });

  it("fails to acquire when timeout exceeded", async () => {
    await lockManager.acquire("resource-1", { timeout: 1000, ttl: 5000 });

    await expect(
      lockManager.acquire("resource-1", {
        timeout: 200,
        ttl: 5000,
        retryInterval: 50,
      }),
    ).rejects.toThrow("Failed to acquire lock");
  });

  it("isLocked returns false for unlocked resources", async () => {
    expect(await lockManager.isLocked("nonexistent")).toBe(false);
  });

  it("clear releases all locks", async () => {
    await lockManager.acquire("r1", { timeout: 1000, ttl: 5000 });
    await lockManager.acquire("r2", { timeout: 1000, ttl: 5000 });

    lockManager.clear();

    expect(await lockManager.isLocked("r1")).toBe(false);
    expect(await lockManager.isLocked("r2")).toBe(false);
  });
});

/* ─── Storage Lifecycle Manager ───────────────────────────────────────────── */

describe("StorageLifecycleManager", () => {
  it("manages lifecycle phases", async () => {
    const manager = new StorageLifecycleManager();
    expect(manager.getPhase()).toBe("uninitialized");

    await manager.initialize();
    expect(manager.getPhase()).toBe("ready");

    await manager.drain();
    expect(manager.getPhase()).toBe("drained");

    await manager.shutdown();
    expect(manager.getPhase()).toBe("shutdown");
  });

  it("registers and initializes components", async () => {
    const initOrder: string[] = [];

    const component1: StorageLifecycle = {
      initialize: async () => {
        initOrder.push("c1");
      },
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    const component2: StorageLifecycle = {
      initialize: async () => {
        initOrder.push("c2");
      },
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    const manager = new StorageLifecycleManager();
    manager.register(component1);
    manager.register(component2);

    await manager.initialize();
    expect(initOrder).toEqual(["c1", "c2"]);
  });

  it("healthCheck aggregates component health", async () => {
    const manager = new StorageLifecycleManager();

    const healthy: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    manager.register(healthy);
    await manager.initialize();

    const report = await manager.healthCheck();
    expect(report.healthy).toBe(true);
  });
});

/* ─── Health Checker ──────────────────────────────────────────────────────── */

describe("HealthChecker", () => {
  it("checks health of registered components", async () => {
    const checker = new HealthChecker();

    const healthy: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 2, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    checker.register("db", healthy);
    const report = await checker.checkAll();
    expect(report.healthy).toBe(true);
    expect(report.components).toHaveLength(1);
    expect(report.components[0]?.name).toBe("db");
  });

  it("handles unhealthy components", async () => {
    const checker = new HealthChecker();

    const unhealthy: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => ({
        healthy: false,
        latencyMs: 100,
        status: "error",
      }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    checker.register("cache", unhealthy);
    const report = await checker.checkAll();
    expect(report.healthy).toBe(false);
  });

  it("handles component errors gracefully", async () => {
    const checker = new HealthChecker();

    const broken: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => {
        throw new Error("Connection refused");
      },
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };

    checker.register("db", broken);
    const report = await checker.checkAll();
    expect(report.healthy).toBe(false);
    expect(report.components[0]?.health.status).toBe("error");
  });

  it("returns null for unknown component", async () => {
    const checker = new HealthChecker();
    const result = await checker.checkOne("unknown");
    expect(result).toBeNull();
  });

  it("lists registered components", () => {
    const checker = new HealthChecker();
    const component: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };
    checker.register("db", component);
    checker.register("cache", component);
    expect(checker.getRegisteredComponents()).toEqual(["db", "cache"]);
  });

  it("unregisters components", async () => {
    const checker = new HealthChecker();
    const component: StorageLifecycle = {
      initialize: async () => {},
      start: async () => {},
      healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
      drain: async () => {},
      shutdown: async () => {},
      getPhase: () => "ready",
    };
    checker.register("db", component);
    checker.unregister("db");
    expect(checker.getRegisteredComponents()).toHaveLength(0);
  });
});
