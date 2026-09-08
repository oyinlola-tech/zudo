import { describe, it, expect } from "vitest";
import {
  MemoryDatabaseCache,
  createDatabaseCache,
  createCacheKey,
  serializeCachePart,
  invalidateByPrefix,
  getOrSet,
} from "../src/index.js";

describe("MemoryDatabaseCache", () => {
  it("stores and retrieves a value", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("returns undefined for missing keys", () => {
    const cache = new MemoryDatabaseCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("tracks hits and misses", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("a", "1");
    cache.get("a");
    cache.get("b");
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it("has() returns true for existing keys", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("x", "1");
    expect(cache.has("x")).toBe(true);
    expect(cache.has("y")).toBe(false);
  });

  it("delete() returns true when removing an existing key", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("x", "1");
    expect(cache.delete("x")).toBe(true);
    expect(cache.delete("x")).toBe(false);
  });

  it("clear() empties the cache", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("expires entries after TTL", async () => {
    const cache = new MemoryDatabaseCache<string>({ ttlMs: 10 });
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("k")).toBeUndefined();
  });

  it("rejects empty keys", () => {
    const cache = new MemoryDatabaseCache<string>();
    expect(() => cache.set("", "v")).toThrow();
  });
});

describe("createDatabaseCache", () => {
  it("creates a MemoryDatabaseCache", () => {
    const cache = createDatabaseCache<string>();
    expect(cache).toBeInstanceOf(MemoryDatabaseCache);
  });

  it("applies default TTL", async () => {
    const cache = createDatabaseCache<string>({ ttlMs: 10 });
    cache.set("k", "v");
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("k")).toBeUndefined();
  });
});

describe("createCacheKey", () => {
  it("joins parts with a separator", () => {
    const k = createCacheKey("users", "find", 123);
    expect(k).toBe("users:find:123");
  });

  it("handles object parts via serializeCachePart", () => {
    const k = createCacheKey("users", { id: 1 });
    expect(k).toContain("users");
    expect(k).toContain('"id":1');
  });

  it("distinguishes nested arguments", () => {
    const a = createCacheKey("users", { where: { id: 1 } });
    const b = createCacheKey("users", { where: { id: 2 } });
    expect(a).not.toBe(b);
    expect(a).toContain('"id":1');
    expect(createCacheKey("users", [{ id: 1 }, { id: 2 }])).toContain('"id":2');
  });

  it("escapes separators inside parts so boundaries cannot collide", () => {
    expect(createCacheKey("ns", "a:b", "c")).not.toBe(createCacheKey("ns", "a", "b:c"));
  });

  it("is order-independent for object keys at every level", () => {
    expect(createCacheKey("n", { a: { x: 1, y: 2 }, b: 1 })).toBe(
      createCacheKey("n", { b: 1, a: { y: 2, x: 1 } }),
    );
  });
});

describe("serializeCachePart", () => {
  it("serializes primitives", () => {
    expect(serializeCachePart(1)).toBe("1");
    expect(serializeCachePart("x")).toBe("x");
    expect(serializeCachePart(true)).toBe("true");
    expect(serializeCachePart(null)).toBe("null");
  });

  it("serializes objects as JSON", () => {
    expect(serializeCachePart({ a: 1 })).toBe('{"a":1}');
  });

  it("serializes arrays as JSON", () => {
    expect(serializeCachePart([1, 2, 3])).toBe("[1,2,3]");
  });

  it("handles bigint, Date, undefined, Set and Map explicitly", () => {
    expect(serializeCachePart({ n: 10n })).toBe('{"n":10n}');
    expect(serializeCachePart({ d: new Date("2026-01-01T00:00:00.000Z") })).toBe(
      '{"d":"2026-01-01T00:00:00.000Z"}',
    );
    expect(serializeCachePart({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(serializeCachePart(new Set([2, 1]))).toBe("Set[1,2]");
    expect(serializeCachePart(new Map([["k", 1]]))).toBe('Map{"k"=>1}');
  });

  it("throws for functions and circular structures", () => {
    expect(() => serializeCachePart({ f: () => 1 })).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeCachePart(circular)).toThrow();
  });
});

describe("LRU eviction", () => {
  it("evicts the least recently used entry when maxEntries is exceeded", () => {
    const cache = new MemoryDatabaseCache<number>({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    expect(cache.getStats().evictions).toBe(1);
  });

  it("prunes expired entries in the background", async () => {
    const cache = new MemoryDatabaseCache<number>({ ttlMs: 5, pruneIntervalMs: 5 });
    cache.set("a", 1);
    await new Promise((r) => setTimeout(r, 25));
    expect(cache.keys()).toHaveLength(0);
    cache.dispose();
  });
});

describe("getOrSet", () => {
  it("coalesces concurrent loaders for the same key", async () => {
    const cache = new MemoryDatabaseCache<number>();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 7;
    };
    const results = await Promise.all([
      getOrSet(cache, "k", loader),
      getOrSet(cache, "k", loader),
      getOrSet(cache, "k", loader),
    ]);
    expect(results).toEqual([7, 7, 7]);
    expect(loads).toBe(1);
    expect(cache.get("k")).toBe(7);
  });

  it("does not cache a failed load and allows a retry", async () => {
    const cache = new MemoryDatabaseCache<number>();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      if (calls === 1) throw new Error("fail");
      return 1;
    };
    await expect(getOrSet(cache, "k", loader)).rejects.toThrow("fail");
    expect(await getOrSet(cache, "k", loader)).toBe(1);
  });
});

describe("invalidateByPrefix", () => {
  it("removes all entries matching a prefix", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("users:1", "alice");
    cache.set("users:2", "bob");
    cache.set("posts:1", "hello");
    invalidateByPrefix(cache, "users:");
    expect(cache.has("users:1")).toBe(false);
    expect(cache.has("users:2")).toBe(false);
    expect(cache.has("posts:1")).toBe(true);
  });

  it("is separator-aware", () => {
    const cache = new MemoryDatabaseCache<string>();
    cache.set("user", "root");
    cache.set("user:1", "alice");
    cache.set("users:1", "bob");
    expect(invalidateByPrefix(cache, "user")).toBe(2);
    expect(cache.has("users:1")).toBe(true);
  });
});
