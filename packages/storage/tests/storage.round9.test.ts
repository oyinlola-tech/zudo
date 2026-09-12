/**
 * @zudojs/storage — Round 9 regression tests.
 *
 * Each test pins a capability that was declared on a public type but never
 * implemented, or a boundary the README claimed but nothing checked. They
 * assert on observable behaviour — a connection actually closed, an attribute
 * actually read back from disk — because every defect here previously
 * presented as a silently ignored option.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ConnectionPool } from "../src/database/index.js";
import { LocalObjectStorage, SIDECAR_DIR } from "../src/objectStorage/index.js";
import { collectStream } from "../src/objectStorage/localObjectStorage.write.js";
import { BaseRepository } from "../src/repository/index.js";
import { JsonSerializer } from "../src/serialization/index.js";
import type { Connection, Database } from "../src/types/storage.type.js";

/** A connection that records whether it was closed. */
function makeConnection(id: string, closed: string[]): Connection {
  return {
    id,
    state: "connected",
    query: async () => ({ rows: [], rowCount: 0, fields: [] }),
    execute: async () => ({ rowCount: 0 }),
    ping: async () => true,
    close: async () => {
      closed.push(id);
    },
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ─── R9-STO-01: connectionTimeout was accepted and never enforced ───────── */

describe("ConnectionPool.connectionTimeout", () => {
  it("rejects acquire when the factory never produces a connection", async () => {
    const pool = new ConnectionPool(
      () => new Promise<Connection>(() => undefined),
      { min: 0, max: 2, connectionTimeout: 25, acquireTimeout: 1_000 },
    );

    await expect(pool.acquire()).rejects.toThrow(
      /did not produce a connection within 25ms/,
    );
  });

  it("closes a connection the factory delivers after the timeout won", async () => {
    const closed: string[] = [];
    const pool = new ConnectionPool(
      async () => {
        await sleep(40);
        return makeConnection("late", closed);
      },
      { min: 0, max: 2, connectionTimeout: 10, acquireTimeout: 1_000 },
    );

    await expect(pool.acquire()).rejects.toThrow(/Connection timeout/);
    await sleep(60);

    // Nothing holds the late connection, so leaving it open would leak it.
    expect(closed).toEqual(["late"]);
  });

  it("leaves the factory unbounded when connectionTimeout is 0", async () => {
    const closed: string[] = [];
    const pool = new ConnectionPool(
      async () => {
        await sleep(20);
        return makeConnection("slow", closed);
      },
      { min: 0, max: 2, connectionTimeout: 0 },
    );

    const conn = await pool.acquire();
    expect(conn.id).toBe("slow");
    await pool.release(conn);
    await pool.drain();
  });
});

/* ─── R9-STO-02: idleTimeout was accepted and never enforced ─────────────── */

describe("ConnectionPool.idleTimeout", () => {
  it("retires a connection that sat idle past the timeout", async () => {
    const closed: string[] = [];
    let made = 0;
    const pool = new ConnectionPool(
      async () => makeConnection(`c${++made}`, closed),
      { min: 0, max: 2, idleTimeout: 20, connectionTimeout: 0 },
    );

    const first = await pool.acquire();
    await pool.release(first);
    await sleep(35);

    const second = await pool.acquire();

    expect(closed).toContain(first.id);
    expect(second.id).not.toBe(first.id);
    await pool.release(second);
    await pool.drain();
  });

  it("reuses a connection that is still within the idle window", async () => {
    const closed: string[] = [];
    let made = 0;
    const pool = new ConnectionPool(
      async () => makeConnection(`c${++made}`, closed),
      { min: 0, max: 2, idleTimeout: 5_000, connectionTimeout: 0 },
    );

    const first = await pool.acquire();
    await pool.release(first);
    const second = await pool.acquire();

    expect(second.id).toBe(first.id);
    expect(closed).toEqual([]);
    await pool.release(second);
    await pool.drain();
  });
});

/* ─── R9-STO-03: maxLifetime was accepted and never enforced ─────────────── */

describe("ConnectionPool.maxLifetime", () => {
  it("retires a connection that outlived maxLifetime on release", async () => {
    const closed: string[] = [];
    let made = 0;
    const pool = new ConnectionPool(
      async () => makeConnection(`c${++made}`, closed),
      { min: 0, max: 2, maxLifetime: 20, idleTimeout: 0, connectionTimeout: 0 },
    );

    const first = await pool.acquire();
    await sleep(35);
    await pool.release(first);

    expect(closed).toContain(first.id);
    expect(pool.getStats().idle).toBe(0);
    await pool.drain();
  });

  it("keeps connections indefinitely when maxLifetime is 0", async () => {
    const closed: string[] = [];
    let made = 0;
    const pool = new ConnectionPool(
      async () => makeConnection(`c${++made}`, closed),
      { min: 0, max: 2, maxLifetime: 0, idleTimeout: 0, connectionTimeout: 0 },
    );

    const first = await pool.acquire();
    await sleep(25);
    await pool.release(first);

    expect(closed).toEqual([]);
    expect(pool.getStats().idle).toBe(1);
    await pool.drain();
  });
});

/* ─── R9-STO-04: a failed initialize() reported itself as done ───────────── */

describe("ConnectionPool.initialize", () => {
  it("allows a retry after the factory failed", async () => {
    const closed: string[] = [];
    let attempt = 0;
    const pool = new ConnectionPool(
      async () => {
        attempt++;
        if (attempt === 1) throw new Error("database unreachable");
        return makeConnection(`c${attempt}`, closed);
      },
      { min: 1, max: 2, connectionTimeout: 0 },
    );

    await expect(pool.initialize()).rejects.toThrow("database unreachable");

    // Previously the pool stayed flagged as initialized and this resolved
    // immediately with an empty pool.
    await pool.initialize();
    expect(pool.getStats().idle).toBe(1);
    await pool.drain();
  });
});

/* ─── R9-STO-04b: drain() gave callers no way to bound the wait ──────────── */

describe("ConnectionPool.drain timeout", () => {
  it("honours a caller-supplied drain bound instead of the 30s default", async () => {
    const closed: string[] = [];
    const pool = new ConnectionPool(
      async () => makeConnection("held", closed),
      { min: 0, max: 2, connectionTimeout: 0 },
    );

    // Acquired and never released: draining must not block on it forever.
    await pool.acquire();

    const started = Date.now();
    await pool.drain(30);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(closed).toContain("held");
  });
});

/* ─── R9-STO-05: put() echoed attributes it never stored ─────────────────── */

describe("LocalObjectStorage object attributes", () => {
  let dir: string;
  let storage: LocalObjectStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "storage-r9-"));
    storage = new LocalObjectStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads back the content type, cache control and metadata that put stored", async () => {
    await storage.put("docs/report.pdf", new TextEncoder().encode("pdf"), {
      contentType: "application/pdf",
      cacheControl: "public, max-age=3600",
      metadata: { owner: "acme" },
    });

    // A fresh instance proves the attributes came off disk, not from a
    // field the same object was still holding.
    const reopened = new LocalObjectStorage(dir);

    const meta = await reopened.metadata("docs/report.pdf");
    expect(meta?.contentType).toBe("application/pdf");
    expect(meta?.cacheControl).toBe("public, max-age=3600");
    expect(meta?.metadata).toEqual({ owner: "acme" });

    const object = await reopened.get("docs/report.pdf");
    expect(object?.metadata.contentType).toBe("application/pdf");
    expect(object?.metadata.metadata).toEqual({ owner: "acme" });
  });

  it("returns a content hash as the etag and changes it when the bytes change", async () => {
    const first = await storage.put("a.txt", new TextEncoder().encode("one"));
    const second = await storage.put("a.txt", new TextEncoder().encode("two"));

    expect(first.etag).toMatch(/^[0-9a-f]{64}$/);
    expect(second.etag).not.toBe(first.etag);
    expect((await storage.metadata("a.txt"))?.etag).toBe(second.etag);
  });

  it("surfaces attributes in listings", async () => {
    await storage.put("x.json", new TextEncoder().encode("{}"), {
      contentType: "application/json",
    });

    const page = await storage.list();
    expect(page.objects).toHaveLength(1);
    expect(page.objects[0]?.contentType).toBe("application/json");
  });

  it("does not list the reserved metadata directory as an object", async () => {
    await storage.put("only.txt", new TextEncoder().encode("x"), {
      contentType: "text/plain",
    });

    const page = await storage.list();
    expect(page.objects.map((object) => object.key)).toEqual(["only.txt"]);

    // The sidecar really is on disk; it is filtered, not absent.
    expect(await readdir(join(dir, SIDECAR_DIR))).toContain("only.txt.json");
  });

  it("discards attributes when the object is deleted", async () => {
    await storage.put("gone.txt", new TextEncoder().encode("x"), {
      contentType: "text/plain",
    });
    await storage.delete("gone.txt");
    await storage.put("gone.txt", new TextEncoder().encode("y"));

    // A stale sidecar would re-attach the old content type to a new object.
    expect((await storage.metadata("gone.txt"))?.contentType).toBeUndefined();
  });

  it("refuses a key that addresses the reserved metadata directory", async () => {
    await expect(
      storage.put(
        `${SIDECAR_DIR}/victim.txt.json`,
        new TextEncoder().encode("{}"),
      ),
    ).rejects.toThrow(/reserved metadata directory/);

    await expect(storage.get(`${SIDECAR_DIR}/victim.txt.json`)).rejects.toThrow(
      /reserved metadata directory/,
    );
  });
});

/* ─── R9-STO-06: symlink escape, claimed by the README, never tested ─────── */

describe("LocalObjectStorage symlink containment", () => {
  it("refuses a read redirected out of the base by a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "storage-r9-link-"));
    const base = join(root, "store");
    const outside = join(root, "outside");
    await mkdir(base, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.txt"), "credentials");

    // An attacker who can plant a link inside the store must not be able to
    // read through it.
    await symlink(join(outside, "secret.txt"), join(base, "link.txt"));

    const storage = new LocalObjectStorage(base);
    await expect(storage.get("link.txt")).rejects.toThrow(
      /Path traversal detected/,
    );
    await expect(
      storage.put("link.txt", new TextEncoder().encode("overwritten")),
    ).rejects.toThrow(/Path traversal detected/);

    await rm(root, { recursive: true, force: true });
  });
});

/* ─── R9-STO-07: JsonSerializer silently produced JSON for any format ───── */

describe("JsonSerializer format handling", () => {
  it("round-trips when the format is omitted or json", () => {
    const serializer = new JsonSerializer();
    const bytes = serializer.serialize({ when: new Date(0) }, "json");
    expect(serializer.deserialize<{ when: Date }>(bytes).when).toBeInstanceOf(
      Date,
    );
  });

  it("refuses a format it does not implement instead of returning JSON", () => {
    const serializer = new JsonSerializer();

    expect(() => serializer.serialize({ a: 1 }, "msgpack")).toThrow(
      /supports "json" only/,
    );
    expect(() =>
      serializer.deserialize(new Uint8Array([123, 125]), "binary"),
    ).toThrow(/supports "json" only/);
  });
});

/* ─── STORAGE-R9-01: a base directory behind a symlink refused every key ── */

describe("STORAGE-R9-01", () => {
  it("accepts keys when the store's base directory is itself a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "zudo-r9-symbase-"));
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "link"));

    // macOS's tmpdir (/var → /private/var), mounted volumes and deploy
    // slots all reach the store through a link; the README's own quick
    // start constructs the store exactly this way.
    const storage = new LocalObjectStorage(join(root, "link"));
    await storage.put("a.txt", new TextEncoder().encode("hello"));

    expect(await storage.exists("a.txt")).toBe(true);
    const object = await storage.get("a.txt");
    expect(new TextDecoder().decode(await object!.arrayBuffer())).toBe("hello");
    expect((await readdir(join(root, "real"))).sort()).toEqual(
      [".zudo-object-meta", "a.txt"].sort(),
    );

    await rm(root, { recursive: true, force: true });
  });

  it("still refuses a symlink inside a symlinked base that points outside", async () => {
    const root = await mkdtemp(join(tmpdir(), "zudo-r9-symbase-"));
    await mkdir(join(root, "real"));
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside", "secret.txt"), "secret");
    await symlink(join(root, "real"), join(root, "link"));
    await symlink(
      join(root, "outside", "secret.txt"),
      join(root, "real", "escape.txt"),
    );

    const storage = new LocalObjectStorage(join(root, "link"));
    await expect(storage.get("escape.txt")).rejects.toThrow(
      /Path traversal detected/,
    );

    await rm(root, { recursive: true, force: true });
  });
});

/* ─── STORAGE-R9-02: release() retired a connection and stranded waiters ── */

describe("STORAGE-R9-02", () => {
  it("hands a parked waiter a fresh connection when the released one is retired", async () => {
    const closed: string[] = [];
    let created = 0;
    const pool = new ConnectionPool(
      async () => makeConnection(`c${++created}`, closed),
      { min: 0, max: 1, maxLifetime: 30, acquireTimeout: 400 },
    );

    const first = await pool.acquire();
    await sleep(45); // outlive maxLifetime while held

    const waiting = pool.acquire();
    await sleep(5);
    expect(pool.getStats().waiting).toBe(1);

    const started = Date.now();
    await pool.release(first);
    const second = await waiting;

    expect(closed).toEqual(["c1"]);
    expect(second.id).toBe("c2");
    expect(Date.now() - started).toBeLessThan(200);
    expect(pool.getStats()).toEqual({
      total: 1,
      idle: 0,
      active: 1,
      waiting: 0,
    });

    await pool.release(second);
    await pool.drain(10);
  });

  it("rejects the waiter with the factory error instead of letting it time out", async () => {
    const closed: string[] = [];
    let created = 0;
    const pool = new ConnectionPool(
      async () => {
        created++;
        if (created > 1) throw new Error("database unreachable");
        return makeConnection("c1", closed);
      },
      { min: 0, max: 1, maxLifetime: 30, acquireTimeout: 400 },
    );

    const first = await pool.acquire();
    await sleep(45);
    const waiting = pool.acquire();
    await sleep(5);

    await pool.release(first);
    await expect(waiting).rejects.toThrow(/database unreachable/);
    expect(pool.getStats().total).toBe(0);

    await pool.drain(10);
  });
});

/* ─── STORAGE-R9-03: update() resolved undefined for a missing row ─────── */

describe("STORAGE-R9-03", () => {
  interface User extends Record<string, unknown> {
    id: string;
    email: string;
  }

  function databaseReturning(rows: readonly User[]): Database {
    return {
      query: async () => ({ rows, rowCount: rows.length, fields: [] }),
    } as unknown as Database;
  }

  it("throws NotFoundError when the update matches no row", async () => {
    const users = new BaseRepository<User, string>(databaseReturning([]), {
      tableName: "users",
    });

    await expect(users.update("missing", { email: "x@y.z" })).rejects.toMatchObject({
      name: "NotFoundError",
      code: "STORAGE_ENTITY_NOT_FOUND",
    });
  });

  it("returns the updated row when one is returned", async () => {
    const row: User = { id: "u1", email: "new@y.z" };
    const users = new BaseRepository<User, string>(databaseReturning([row]), {
      tableName: "users",
    });

    expect(await users.update("u1", { email: "new@y.z" })).toEqual(row);
  });
});

/* ─── STORAGE-R9-04: exists()/metadata() reported directories as objects ── */

describe("STORAGE-R9-04", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "zudo-r9-dir-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("does not report the directory created for a nested key as an object", async () => {
    const storage = new LocalObjectStorage(root);
    await storage.put("a/b.txt", new TextEncoder().encode("x"));

    expect(await storage.exists("a/b.txt")).toBe(true);
    expect(await storage.exists("a")).toBe(false);
    expect(await storage.metadata("a")).toBeNull();
    expect(await storage.get("a")).toBeNull();
  });
});

/* ─── STORAGE-R9-05: an oversized stream was abandoned, not cancelled ───── */

describe("STORAGE-R9-05", () => {
  it("cancels the source stream when the byte budget is exceeded", async () => {
    let cancelReason: unknown;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });

    await expect(collectStream(stream, 15)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_TOO_LARGE",
    });
    expect(cancelReason).toMatchObject({ code: "STORAGE_OBJECT_TOO_LARGE" });
    expect(stream.locked).toBe(false);
  });
});
