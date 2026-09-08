/**
 * @zudojs/cache — Memory Adapter Tests
 *
 * Tests for MemoryCacheAdapter: get/set/delete/has/clear, TTL expiration,
 * batch operations, keys listing, and eviction behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { MemoryCacheAdapter, createMemoryCacheAdapter } from "../src/memory.js";

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
