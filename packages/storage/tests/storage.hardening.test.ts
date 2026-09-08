/**
 * @zudojs/storage — Hardening regression tests.
 *
 * Each test pins a defect found in audit round 7. They assert on the SQL text
 * produced and on paths actually touched, rather than on the absence of a
 * throw, because every one of these defects previously failed silently.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { BaseRepository } from "../src/repository/index.js";
import { ConnectionPool } from "../src/database/index.js";
import { LocalObjectStorage } from "../src/objectStorage/index.js";
import { InMemoryLockManager } from "../src/locking/index.js";
import { StorageLifecycleManager } from "../src/lifecycle/index.js";
import { HealthChecker } from "../src/health/index.js";
import type {
  Connection,
  Database,
  ExecuteResult,
  Query,
  QueryResult,
  StorageLifecycle,
} from "../src/types/storage.type.js";

/** Records every query a repository issues. */
class RecordingDatabase implements Database {
  readonly queries: Query[] = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async query<T = Record<string, unknown>>(
    query: Query,
  ): Promise<QueryResult<T>> {
    this.queries.push(query);
    return { rows: [{}] as T[], rowCount: 1, fields: [] };
  }

  async execute(query: Query): Promise<ExecuteResult> {
    this.queries.push(query);
    return { rowCount: 1 };
  }

  async transaction<T>(cb: (tx: never) => Promise<T>): Promise<T> {
    return cb(undefined as never);
  }

  async healthCheck() {
    return { healthy: true, latencyMs: 1, status: "ok" };
  }

  getPoolStats() {
    return { total: 1, idle: 1, active: 0, waiting: 0 };
  }

  get lastText(): string {
    return this.queries[this.queries.length - 1]?.text ?? "";
  }
}

/* ─── STO-01 / STO-02 / STO-03: SQL injection ─────────────────────────────── */

describe("BaseRepository SQL identifier safety", () => {
  let db: RecordingDatabase;
  let repo: BaseRepository<Record<string, unknown>, string>;

  beforeEach(() => {
    db = new RecordingDatabase();
    repo = new BaseRepository(db, { tableName: "users" });
  });

  it("rejects injected column names in create()", async () => {
    const body = JSON.parse(
      '{"email":"a@b.c","x) VALUES (99, (SELECT password FROM admins)) --":"z"}',
    ) as Record<string, unknown>;

    await expect(repo.create(body)).rejects.toThrow(/Invalid column name/);
    expect(db.queries).toHaveLength(0);
  });

  it("rejects injected column names in update()", async () => {
    const changes = JSON.parse('{"role = \'admin\', name":"x"}') as Record<
      string,
      unknown
    >;

    await expect(repo.update("1", changes)).rejects.toThrow(
      /Invalid column name/,
    );
    expect(db.lastText).not.toContain("role = 'admin'");
  });

  it("rejects an injected orderBy in findAll()", async () => {
    await expect(
      repo.findAll({ orderBy: "1; DROP TABLE users --" }),
    ).rejects.toThrow(/Invalid sort column/);
  });

  it("rejects a non-integer limit even when typed as number", async () => {
    await expect(
      repo.findAll({ limit: "10; DELETE FROM users --" as unknown as number }),
    ).rejects.toThrow(/Invalid limit/);
  });

  it("binds limit and offset as parameters", async () => {
    await repo.findAll({ limit: 10, offset: 20, orderBy: "name" });
    expect(db.lastText).toBe(
      "SELECT * FROM users ORDER BY name ASC LIMIT $1 OFFSET $2",
    );
    expect(db.queries[0]?.parameters).toEqual([10, 20]);
  });

  it("rejects injected column names in count()", async () => {
    const where = JSON.parse('{"1=1 OR \'\'x":"y"}') as Record<string, string>;
    await expect(repo.count(where)).rejects.toThrow(/Invalid column name/);
  });

  it("rejects an injected table name at construction", () => {
    expect(
      () => new BaseRepository(db, { tableName: "users; DROP TABLE x" }),
    ).toThrow(/Invalid table name/);
  });

  it("enforces the column allowlist when one is configured", async () => {
    const scoped = new BaseRepository<Record<string, unknown>, string>(db, {
      tableName: "users",
      columns: ["id", "email"],
    });

    await expect(scoped.create({ email: "a@b.c" })).resolves.toBeDefined();
    await expect(scoped.create({ is_admin: true })).rejects.toThrow(
      /is not allowed/,
    );
  });

  it("still builds correct SQL for valid input", async () => {
    await repo.create({ email: "a@b.c", name: "A" });
    expect(db.lastText).toBe(
      "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *",
    );
    expect(db.queries[0]?.parameters).toEqual(["a@b.c", "A"]);
  });
});

/* ─── STO-04 / STO-05 / STO-08 / STO-09 / STO-15: object storage ──────────── */

describe("LocalObjectStorage containment", () => {
  let root: string;
  let base: string;
  let storage: LocalObjectStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "zudo-storage-"));
    base = join(root, "store");
    await mkdir(base);
    await mkdir(join(root, "store-secrets"));
    await writeFile(join(root, "store-secrets", "creds.txt"), "SUPER SECRET");
    storage = new LocalObjectStorage(base);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("blocks reads through a sibling directory sharing the base prefix", async () => {
    await expect(storage.get("../store-secrets/creds.txt")).rejects.toThrow(
      /Path traversal detected/,
    );
  });

  it("blocks writes through a sibling directory sharing the base prefix", async () => {
    await expect(
      storage.put("../store-secrets/pwned.txt", new TextEncoder().encode("x")),
    ).rejects.toThrow(/Path traversal detected/);

    await expect(
      readFile(join(root, "store-secrets", "pwned.txt")),
    ).rejects.toThrow();
  });

  it("blocks plain parent traversal and absolute keys", async () => {
    await expect(storage.get("../../etc/passwd")).rejects.toThrow(
      /Path traversal detected/,
    );
    await expect(storage.get("/etc/passwd")).rejects.toThrow(
      /Path traversal detected/,
    );
  });

  it("anchors a relative base path so containment is cwd-independent", async () => {
    const relative = new LocalObjectStorage("./some-relative-store");
    await expect(relative.get("../escape.txt")).rejects.toThrow(
      /Path traversal detected/,
    );
  });

  it("stores and reads back an object within the base", async () => {
    await storage.put("nested/a.txt", new TextEncoder().encode("hello"));
    const got = await storage.get("nested/a.txt");
    expect(got).not.toBeNull();
    expect(Buffer.from(await got!.arrayBuffer()).toString()).toBe("hello");
  });

  it("returns only the object's own bytes from arrayBuffer()", async () => {
    await storage.put("a.txt", new TextEncoder().encode("hello"));
    const got = await storage.get("a.txt");
    expect((await got!.arrayBuffer()).byteLength).toBe(5);
  });

  it("enforces a byte budget on buffered payloads", async () => {
    const small = new LocalObjectStorage(base, { maxObjectBytes: 4 });
    await expect(
      small.put("big.txt", new TextEncoder().encode("too long")),
    ).rejects.toThrow(/exceeds the maximum size/);
  });

  it("enforces a byte budget on streamed payloads", async () => {
    const small = new LocalObjectStorage(base, { maxObjectBytes: 4 });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("aaa"));
        controller.enqueue(new TextEncoder().encode("bbb"));
        controller.close();
      },
    });

    await expect(small.put("big.txt", stream)).rejects.toThrow(
      /exceeds the maximum size/,
    );
  });

  it("leaves no partial object behind when a write is rejected", async () => {
    const small = new LocalObjectStorage(base, { maxObjectBytes: 4 });
    await expect(
      small.put("partial.txt", new TextEncoder().encode("too long")),
    ).rejects.toThrow();
    expect(await storage.exists("partial.txt")).toBe(false);
  });

  it("advances through pages using the continuation token", async () => {
    for (const name of ["a", "b", "c", "d"]) {
      await storage.put(`${name}.txt`, new TextEncoder().encode(name));
    }

    const first = await storage.list(undefined, { maxKeys: 2 });
    expect(first.objects.map((o) => o.key)).toEqual(["a.txt", "b.txt"]);
    expect(first.isTruncated).toBe(true);
    expect(first.continuationToken).toBe("b.txt");

    const second = await storage.list(undefined, {
      maxKeys: 2,
      continuationToken: first.continuationToken,
    });
    expect(second.objects.map((o) => o.key)).toEqual(["c.txt", "d.txt"]);
    expect(second.isTruncated).toBe(false);
  });

  it("fills a page to maxKeys even when directories are present", async () => {
    await storage.put("dir/one.txt", new TextEncoder().encode("1"));
    await storage.put("dir/two.txt", new TextEncoder().encode("2"));

    const page = await storage.list(undefined, { maxKeys: 2 });
    expect(page.objects).toHaveLength(2);
  });

  it("treats deleting a missing key as a no-op", async () => {
    await expect(storage.delete("never-written.txt")).resolves.toBeUndefined();
  });
});

/* ─── STO-06 / STO-07 / STO-12: connection pool ───────────────────────────── */

describe("ConnectionPool bounds and ownership", () => {
  const makeFactory =
    (counter: { made: number }) => async (): Promise<Connection> => {
      counter.made++;
      await new Promise((resolve) => setTimeout(resolve, 2));
      return {
        id: `c${counter.made}`,
        state: "connected",
        query: async () => ({ rows: [], rowCount: 0, fields: [] }),
        execute: async () => ({ rowCount: 0 }),
        ping: async () => true,
        close: async () => {},
      };
    };

  it("never exceeds max under concurrent acquires", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), {
      min: 0,
      max: 3,
      acquireTimeout: 60,
    });

    const acquires = Array.from({ length: 20 }, () => pool.acquire());
    const settled = await Promise.allSettled(acquires);

    expect(counter.made).toBeLessThanOrEqual(3);
    expect(pool.getStats().total).toBeLessThanOrEqual(3);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("hands a released connection to a waiting acquirer", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), { min: 0, max: 1 });

    const first = await pool.acquire();
    const queued = pool.acquire();
    expect(pool.getStats().waiting).toBe(1);

    await pool.release(first);
    await expect(queued).resolves.toBe(first);
  });

  it("ignores a double release instead of issuing one connection twice", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), { min: 0, max: 5 });

    const conn = await pool.acquire();
    await pool.release(conn);
    await pool.release(conn);

    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(a).not.toBe(b);
    expect(pool.getStats().idle).toBe(0);
  });

  it("ignores a connection it never issued", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), { min: 0, max: 5 });
    const foreign = await makeFactory({ made: 99 })();

    await pool.release(foreign);
    expect(pool.getStats().idle).toBe(0);
  });

  it("initializes only once", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), { min: 2, max: 5 });

    await pool.initialize();
    await pool.initialize();
    expect(counter.made).toBe(2);
  });

  it("does not grow the pool during a health check", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), { min: 0, max: 5 });

    const health = await pool.healthCheck();
    expect(health.healthy).toBe(true);
    expect(pool.getStats().total).toBe(0);
  });

  it("times out a waiter instead of hanging", async () => {
    const counter = { made: 0 };
    const pool = new ConnectionPool(makeFactory(counter), {
      min: 0,
      max: 1,
      acquireTimeout: 40,
    });

    await pool.acquire();
    await expect(pool.acquire()).rejects.toThrow(/Acquire timeout/);
    expect(pool.getStats().waiting).toBe(0);
  });
});

/* ─── STO-10 / STO-11: locking ────────────────────────────────────────────── */

describe("InMemoryLockManager handoff and fencing", () => {
  it("wakes a waiter on release rather than polling to the deadline", async () => {
    const locks = new InMemoryLockManager();
    const held = await locks.acquire("r", { timeout: 2000, ttl: 5000 });

    const started = Date.now();
    const queued = locks.acquire("r", {
      timeout: 2000,
      ttl: 5000,
      retryInterval: 1000,
    });

    setTimeout(() => void held.release(), 20);
    await queued;

    expect(Date.now() - started).toBeLessThan(500);
  });

  it("issues a strictly increasing fence per acquisition", async () => {
    const locks = new InMemoryLockManager();
    const first = await locks.acquire("r", { timeout: 100, ttl: 5000 });
    const firstFence = first.fence;
    await first.release();

    const second = await locks.acquire("r", { timeout: 100, ttl: 5000 });
    expect(second.fence).toBeGreaterThan(firstFence);
  });

  it("reports a lock lost once its TTL has expired", async () => {
    const locks = new InMemoryLockManager();
    const lock = await locks.acquire("r", { timeout: 100, ttl: 10 });
    expect(lock.isHeld()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(lock.isHeld()).toBe(false);
    await expect(lock.extend(1000)).rejects.toThrow(/no longer held/);
  });

  it("does not release a lock another holder now owns", async () => {
    const locks = new InMemoryLockManager();
    const stale = await locks.acquire("r", { timeout: 100, ttl: 10 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const fresh = await locks.acquire("r", { timeout: 100, ttl: 5000 });
    await stale.release();

    expect(await locks.isLocked("r")).toBe(true);
    expect(fresh.isHeld()).toBe(true);
  });
});

/* ─── STO-13 / STO-14: lifecycle and health ───────────────────────────────── */

describe("Lifecycle and health reporting", () => {
  const component = (
    overrides: Partial<StorageLifecycle> = {},
  ): StorageLifecycle => ({
    initialize: async () => {},
    start: async () => {},
    healthCheck: async () => ({ healthy: true, latencyMs: 1, status: "ok" }),
    drain: async () => {},
    shutdown: async () => {},
    getPhase: () => "ready",
    ...overrides,
  });

  it("restores the phase when initialization fails", async () => {
    const manager = new StorageLifecycleManager();
    await manager.register(
      component({
        initialize: async () => {
          throw new Error("boom");
        },
      }),
    );

    await expect(manager.initialize()).rejects.toThrow("boom");
    expect(manager.getPhase()).toBe("uninitialized");
  });

  it("drains every component even when one fails, then reports the failures", async () => {
    const drained: string[] = [];
    const manager = new StorageLifecycleManager();

    await manager.register(
      component({
        drain: async () => {
          throw new Error("first failed");
        },
      }),
    );
    await manager.register(
      component({
        drain: async () => {
          drained.push("second");
        },
      }),
    );

    await expect(manager.drain()).rejects.toThrow(/failed to drain/);
    expect(drained).toEqual(["second"]);
    expect(manager.getPhase()).toBe("drained");
  });

  it("initializes a component registered after the manager is ready", async () => {
    const manager = new StorageLifecycleManager();
    await manager.initialize();

    let initialized = false;
    await manager.register(
      component({
        initialize: async () => {
          initialized = true;
        },
      }),
    );

    expect(initialized).toBe(true);
  });

  it("reports unhealthy when no components are registered", async () => {
    const manager = new StorageLifecycleManager();
    expect((await manager.healthCheck()).healthy).toBe(false);

    const checker = new HealthChecker();
    expect((await checker.checkAll()).healthy).toBe(false);
  });

  it("reports healthy once a healthy component is registered", async () => {
    const checker = new HealthChecker();
    checker.register("db", component());
    expect((await checker.checkAll()).healthy).toBe(true);
  });
});
