/**
 * @zudojs/cache — Memory Adapter Tests
 *
 * Tests for MemoryCacheAdapter: get/set/delete/has/clear, TTL expiration,
 * batch operations, keys listing, and eviction behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  MemoryCacheAdapter,
  createMemoryCacheAdapter,
  estimateValueBytes,
} from "../src/memory.js";

// ─── Setup ─────────────────────────────────────────────────────────────────

let adapter: MemoryCacheAdapter;

beforeEach(() => {
  adapter = createMemoryCacheAdapter({ maxEntries: 100, defaultTtl: 60_000 });
});

// ─── Basic CRUD ────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — get/set", () => {
  it("returns a miss for an empty key", async () => {
    const result = await adapter.get("missing");
    expect(result.hit).toBe(false);
    expect(result.value).toBeNull();
  });

  it("stores and retrieves a string value", async () => {
    await adapter.set("greeting", "hello");
    const result = await adapter.get<string>("greeting");
    expect(result.hit).toBe(true);
    expect(result.value).toBe("hello");
  });

  it("stores and retrieves an object value", async () => {
    const data = { name: "Alice", age: 30 };
    await adapter.set("user:1", data);
    const result = await adapter.get<typeof data>("user:1");
    expect(result.hit).toBe(true);
    expect(result.value).toEqual(data);
  });

  it("stores and retrieves null", async () => {
    await adapter.set("nullable", null);
    const result = await adapter.get("nullable");
    expect(result.hit).toBe(true);
    expect(result.value).toBeNull();
  });

  it("overwrites existing values", async () => {
    await adapter.set("key", "old");
    await adapter.set("key", "new");
    const result = await adapter.get<string>("key");
    expect(result.value).toBe("new");
  });
});

describe("MemoryCacheAdapter — set result", () => {
  it("returns success with key and expiresAt", async () => {
    const result = await adapter.set("test", "value", { ttl: 5000 });
    expect(result.success).toBe(true);
    expect(result.key).toBe("test");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("returns default expiresAt when no TTL specified", async () => {
    const result = await adapter.set("test", "value");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });
});

// ─── Delete / Has ──────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — delete", () => {
  it("deletes an existing key", async () => {
    await adapter.set("key", "value");
    const result = await adapter.delete("key");
    expect(result.deleted).toBe(true);
    expect(result.key).toBe("key");
    expect((await adapter.get("key")).hit).toBe(false);
  });

  it("returns deleted=false for missing key", async () => {
    const result = await adapter.delete("missing");
    expect(result.deleted).toBe(false);
  });
});

describe("MemoryCacheAdapter — has", () => {
  it("returns true for existing key", async () => {
    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBe(true);
  });

  it("returns false for missing key", async () => {
    expect(await adapter.has("missing")).toBe(false);
  });
});

// ─── TTL Expiration ────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — TTL", () => {
  it("expires entries after TTL", async () => {
    await adapter.set("ephemeral", "value", { ttl: 1 });
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 5));
    const result = await adapter.get("ephemeral");
    expect(result.hit).toBe(false);
  });

  it("does not expire entries with null TTL", async () => {
    await adapter.set("permanent", "value", { ttl: null });
    await new Promise((r) => setTimeout(r, 10));
    const result = await adapter.get("permanent");
    expect(result.hit).toBe(true);
  });

  it("has() also checks expiry", async () => {
    await adapter.set("expiring", "value", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await adapter.has("expiring")).toBe(false);
  });

  it("ttl() returns remaining TTL", async () => {
    await adapter.set("key", "value", { ttl: 10_000 });
    const remaining = await adapter.ttl("key");
    expect(remaining).toBeGreaterThan(9_000);
    expect(remaining).toBeLessThanOrEqual(10_000);
  });

  it("ttl() returns undefined for missing key", async () => {
    expect(await adapter.ttl("missing")).toBeUndefined();
  });

  // Regression: ttl() distinguishes "no expiry" (null) from missing
  // (undefined), and deletes expired entries when encountered.
  it("ttl() returns null for entries that never expire", async () => {
    await adapter.set("forever", "value", { ttl: null });
    expect(await adapter.ttl("forever")).toBeNull();
  });

  it("ttl() deletes expired entries and returns undefined", async () => {
    await adapter.set("stale", "value", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await adapter.ttl("stale")).toBeUndefined();
    expect((await adapter.keys()).includes("stale")).toBe(false);
  });

  it("expire() treats expired entries as missing", async () => {
    await adapter.set("stale", "value", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await adapter.expire("stale", 10_000)).toBe(false);
  });

  it("expire(key, null) removes the expiry", async () => {
    await adapter.set("k", "v", { ttl: 10_000 });
    expect(await adapter.expire("k", null)).toBe(true);
    expect(await adapter.ttl("k")).toBeNull();
  });

  it("ttl() returns remaining TTL for entry with default TTL", async () => {
    await adapter.set("forever", "value");
    const ttl = await adapter.ttl("forever");
    expect(ttl).toBeGreaterThan(0);
  });

  it("expire() extends an existing entry's TTL", async () => {
    await adapter.set("key", "value", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    // Expired
    expect((await adapter.get("key")).hit).toBe(false);
    // Re-set and extend
    await adapter.set("key", "value", { ttl: 10_000 });
    const extended = await adapter.expire("key", 30_000);
    expect(extended).toBe(true);
    const remaining = await adapter.ttl("key");
    expect(remaining).toBeGreaterThan(20_000);
  });

  it("expire() returns false for missing key", async () => {
    expect(await adapter.expire("missing", 5000)).toBe(false);
  });
});

// ─── Clear ─────────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — clear", () => {
  it("clears all entries", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    const result = await adapter.clear();
    expect(result.cleared).toBe(2);
    expect((await adapter.get("a")).hit).toBe(false);
    expect((await adapter.get("b")).hit).toBe(false);
  });

  it("clears by pattern", async () => {
    await adapter.set("user:1", "alice");
    await adapter.set("user:2", "bob");
    await adapter.set("post:1", "hello");
    const result = await adapter.clear({ pattern: "user:*" });
    expect(result.cleared).toBe(2);
    expect((await adapter.get("user:1")).hit).toBe(false);
    expect((await adapter.get("post:1")).hit).toBe(true);
  });

  it("returns cleared=0 for empty cache", async () => {
    const result = await adapter.clear();
    expect(result.cleared).toBe(0);
  });
});

// ─── Keys ──────────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — keys", () => {
  it("returns all keys", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await adapter.set("c", 3);
    const keys = await adapter.keys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
  });

  it("filters keys by pattern", async () => {
    await adapter.set("user:1", "a");
    await adapter.set("user:2", "b");
    await adapter.set("post:1", "c");
    const keys = await adapter.keys({ pattern: "user:*" });
    expect(keys).toHaveLength(2);
    expect(keys).toContain("user:1");
    expect(keys).toContain("user:2");
  });

  it("limits key count", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await adapter.set("c", 3);
    const keys = await adapter.keys({ limit: 2 });
    expect(keys).toHaveLength(2);
  });
});

// ─── Batch Operations ──────────────────────────────────────────────────────

describe("MemoryCacheAdapter — getMany", () => {
  it("returns results for multiple keys", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    const results = await adapter.getMany<number>(["a", "b", "missing"]);
    expect(results.size).toBe(3);
    expect(results.get("a")!.hit).toBe(true);
    expect(results.get("a")!.value).toBe(1);
    expect(results.get("b")!.hit).toBe(true);
    expect(results.get("missing")!.hit).toBe(false);
  });
});

describe("MemoryCacheAdapter — setMany", () => {
  it("sets multiple entries", async () => {
    const entries = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const results = await adapter.setMany(entries, { ttl: 5000 });
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
    expect((await adapter.get("a")).hit).toBe(true);
    expect((await adapter.get("b")).hit).toBe(true);
  });
});

describe("MemoryCacheAdapter — deleteMany", () => {
  it("deletes multiple keys", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await adapter.set("c", 3);
    const result = await adapter.deleteMany(["a", "c", "missing"]);
    expect(result.deleted).toBe(2);
    expect(result.keys).toContain("a");
    expect(result.keys).toContain("c");
    expect(result.keys).not.toContain("missing");
  });
});

// ─── Eviction ──────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — eviction", () => {
  it("evicts oldest entry when max size reached", async () => {
    const small = createMemoryCacheAdapter({ maxEntries: 3 });
    await small.set("a", 1);
    await small.set("b", 2);
    await small.set("c", 3);
    await small.set("d", 4); // should evict "a"

    expect((await small.get("a")).hit).toBe(false);
    expect((await small.get("b")).hit).toBe(true);
    expect((await small.get("d")).hit).toBe(true);
  });
});

// ─── Tags ──────────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — tags", () => {
  it("stores entries with tags", async () => {
    await adapter.set("key", "value", { tags: ["user:1", "profile"] });
    // Tags are stored but the memory adapter doesn't filter by tags
    // They're available in the entry metadata
    const result = await adapter.get("key");
    expect(result.hit).toBe(true);
  });
});

// ─── Factory ───────────────────────────────────────────────────────────────

describe("createMemoryCacheAdapter", () => {
  it("creates a memory adapter", () => {
    const a = createMemoryCacheAdapter();
    expect(a).toBeInstanceOf(MemoryCacheAdapter);
    expect(a.name).toBe("memory");
  });

  it("respects options", async () => {
    const a = createMemoryCacheAdapter({ maxEntries: 2 });
    await a.set("a", 1);
    await a.set("b", 2);
    await a.set("c", 3); // evicts "a"
    expect((await a.get("a")).hit).toBe(false);
  });
});

// ─── Regression: keys() excludes expired entries ───────────────────────────

describe("MemoryCacheAdapter — keys expiry", () => {
  it("keys() filters out (and deletes) expired entries", async () => {
    await adapter.set("live", "v", { ttl: 60_000 });
    await adapter.set("dead", "v", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const keys = await adapter.keys();
    expect(keys).toContain("live");
    expect(keys).not.toContain("dead");
  });
});

// ─── Regression: eviction behavior ─────────────────────────────────────────

describe("MemoryCacheAdapter — eviction regressions", () => {
  it("overwriting an existing key at capacity does not evict", async () => {
    const small = createMemoryCacheAdapter({ maxEntries: 2 });
    await small.set("a", 1);
    await small.set("b", 2);
    await small.set("a", 10); // overwrite — must not evict anything
    expect((await small.get("a")).value).toBe(10);
    expect((await small.get("b")).hit).toBe(true);
  });

  it("purges expired entries before evicting live ones", async () => {
    const small = createMemoryCacheAdapter({ maxEntries: 2 });
    await small.set("expired", 1, { ttl: 1 });
    await small.set("live", 2, { ttl: 60_000 });
    await new Promise((r) => setTimeout(r, 5));
    await small.set("new", 3, { ttl: 60_000 }); // evicts "expired", not "live"
    expect((await small.get("live")).hit).toBe(true);
    expect((await small.get("new")).hit).toBe(true);
  });
});

// ─── Regression: overwrite: false at the adapter level ─────────────────────

describe("MemoryCacheAdapter — overwrite: false", () => {
  it("skips existing keys and reports skipped", async () => {
    await adapter.set("k", "old");
    const result = await adapter.set("k", "new", { overwrite: false });
    expect(result.skipped).toBe(true);
    expect(result.success).toBe(false);
    expect((await adapter.get("k")).value).toBe("old");
  });

  it("overwrites expired entries even with overwrite: false", async () => {
    await adapter.set("k", "old", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const result = await adapter.set("k", "new", { overwrite: false });
    expect(result.success).toBe(true);
    expect((await adapter.get("k")).value).toBe("new");
  });
});

// ─── Regression: TTL validation ────────────────────────────────────────────

describe("MemoryCacheAdapter — TTL validation", () => {
  it("rejects zero, negative, and oversized TTLs", async () => {
    await expect(adapter.set("k", "v", { ttl: 0 })).rejects.toThrow();
    await expect(adapter.set("k", "v", { ttl: -1 })).rejects.toThrow();
    await expect(
      adapter.set("k", "v", { ttl: 25 * 60 * 60 * 1000 }),
    ).rejects.toThrow();
    await expect(adapter.expire("k", 0)).rejects.toThrow();
  });
});

// ─── Regression: get() returns the full entry ──────────────────────────────

describe("MemoryCacheAdapter — entry metadata", () => {
  // Regression (CACHE-08): createdAt/tags/metadata were stored on every set
  // and could never be read back — CacheGetResult.entry was never populated
  // by anything in the package.
  it("populates entry with tags, metadata and timestamps on a hit", async () => {
    await adapter.set("k", "v", {
      ttl: 60_000,
      tags: ["users", "profile"],
      metadata: { source: "db", etag: "abc" },
    });
    const result = await adapter.get<string>("k");
    expect(result.hit).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry!.key).toBe("k");
    expect(result.entry!.value).toBe("v");
    expect(result.entry!.tags).toEqual(["users", "profile"]);
    expect(result.entry!.metadata).toEqual({ source: "db", etag: "abc" });
    expect(result.entry!.createdAt).toBeInstanceOf(Date);
    expect(result.entry!.expiresAt).toBeInstanceOf(Date);
  });

  it("reports a null expiresAt for entries that never expire", async () => {
    await adapter.set("k", "v", { ttl: null });
    const result = await adapter.get("k");
    expect(result.entry!.expiresAt).toBeNull();
  });

  it("omits entry on a miss", async () => {
    const result = await adapter.get("nope");
    expect(result.entry).toBeUndefined();
  });
});

// ─── Regression: LRU eviction ──────────────────────────────────────────────

describe("MemoryCacheAdapter — LRU eviction", () => {
  // Regression (CACHE-23): eviction was FIFO by insertion order and get()
  // never refreshed recency, so the hottest key was evicted as soon as it
  // was the oldest write.
  it("keeps a recently read key and evicts the truly cold one", async () => {
    const small = createMemoryCacheAdapter({ maxEntries: 3 });
    await small.set("hot", 1);
    await small.set("cold", 2);
    await small.set("warm", 3);

    // Read "hot" so it is the most recently used despite being oldest.
    expect((await small.get("hot")).hit).toBe(true);

    await small.set("new", 4);

    expect((await small.get("hot")).hit).toBe(true);
    expect((await small.get("cold")).hit).toBe(false);
    expect((await small.get("new")).hit).toBe(true);
  });
});

// ─── Regression: memory budget ─────────────────────────────────────────────

describe("MemoryCacheAdapter — memory budget", () => {
  // Regression (CACHE-17): DEFAULT_MAX_MEMORY_BYTES was an exported,
  // documented knob that nothing read, so 10_000 x 1 MB entries were happily
  // retained under a "50 MB budget".
  it("evicts to stay within maxBytes", async () => {
    const tiny = createMemoryCacheAdapter({
      maxEntries: 1_000,
      maxBytes: 4_000,
    });
    const payload = "x".repeat(1_000); // ~2 KB as UTF-16
    for (let i = 0; i < 10; i++) await tiny.set(`k${i}`, payload);

    expect(tiny.estimatedBytes).toBeLessThanOrEqual(4_000);
    expect(await tiny.size()).toBeLessThan(10);
    // The most recent write always survives.
    expect((await tiny.get("k9")).hit).toBe(true);
  });

  it("releases budget on delete and clear", async () => {
    const tiny = createMemoryCacheAdapter({ maxBytes: 1_000_000 });
    await tiny.set("a", "x".repeat(100));
    expect(tiny.estimatedBytes).toBeGreaterThan(0);
    await tiny.delete("a");
    expect(tiny.estimatedBytes).toBe(0);

    await tiny.set("b", "y".repeat(100));
    await tiny.clear();
    expect(tiny.estimatedBytes).toBe(0);
  });

  it("does not double-count an overwritten key", async () => {
    const tiny = createMemoryCacheAdapter({ maxBytes: 1_000_000 });
    await tiny.set("a", "x".repeat(100));
    const first = tiny.estimatedBytes;
    await tiny.set("a", "x".repeat(100));
    expect(tiny.estimatedBytes).toBe(first);
  });

  it("estimates larger values as larger", () => {
    expect(estimateValueBytes("x".repeat(1_000))).toBeGreaterThan(
      estimateValueBytes("x"),
    );
    expect(estimateValueBytes({ a: 1, b: 2, c: 3 })).toBeGreaterThan(
      estimateValueBytes({}),
    );
  });

  it("terminates on cyclic values", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(estimateValueBytes(cyclic)).toBeGreaterThan(0);
  });
});

// ─── Regression: exact-deadline expiry ─────────────────────────────────────

describe("MemoryCacheAdapter — exact deadline", () => {
  // Regression (CACHE-21): isExpired used a strict `>`, so an entry was
  // still live *at* its deadline and ttl() could report 0 for a key it also
  // reported as present.
  it("is a miss at the deadline, not one millisecond after", async () => {
    await adapter.set("k", "v", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 2));
    expect(await adapter.has("k")).toBe(false);
    expect((await adapter.get("k")).hit).toBe(false);
    expect(await adapter.ttl("k")).toBeUndefined();
  });

  it("never reports ttl 0 for a present key", async () => {
    await adapter.set("k", "v", { ttl: 20 });
    for (let i = 0; i < 40; i++) {
      const remaining = await adapter.ttl("k");
      if (remaining === undefined) break;
      expect(remaining).not.toBe(0);
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(await adapter.has("k")).toBe(false);
  });
});

// ─── size() ────────────────────────────────────────────────────────────────

describe("MemoryCacheAdapter — size", () => {
  it("reports the number of live entries", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    expect(await adapter.size()).toBe(2);
  });

  it("excludes expired entries", async () => {
    await adapter.set("live", 1, { ttl: 60_000 });
    await adapter.set("dead", 1, { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await adapter.size()).toBe(1);
  });
});

// ─── Regression: segment-bounded glob patterns ─────────────────────────────

describe("MemoryCacheAdapter — pattern scoping", () => {
  // Regression (CACHE-01/02): `*` used to cross the separator, so a pattern
  // written for one scope reached into every nested one.
  it("does not let * cross the key separator", async () => {
    await adapter.set("zudojs:plain", 1);
    await adapter.set("zudojs:tenant-a:secret", 2);
    const result = await adapter.clear({ pattern: "zudojs:*" });
    expect(result.cleared).toBe(1);
    expect((await adapter.get("zudojs:tenant-a:secret")).hit).toBe(true);
  });

  it("spans namespaces with an explicit ** segment", async () => {
    await adapter.set("zudojs:plain", 1);
    await adapter.set("zudojs:tenant-a:secret", 2);
    const result = await adapter.clear({ pattern: "zudojs:**" });
    expect(result.cleared).toBe(2);
  });

  it("rejects an over-long pattern instead of scanning with it", async () => {
    await expect(
      adapter.clear({ pattern: "*".repeat(1_000) }),
    ).rejects.toThrow();
  });
});
