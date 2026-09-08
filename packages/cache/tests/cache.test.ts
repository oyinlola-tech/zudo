/**
 * @zudojs/cache — CacheService Tests
 *
 * Integration tests for CacheService: getOrSet, tags, patterns,
 * locking, stats, and health checks.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { MemoryCacheAdapter, createMemoryCacheAdapter } from "../src/memory.js";
import { CacheService, createCacheService } from "../src/cache.js";

let adapter: MemoryCacheAdapter;
let service: CacheService;

beforeEach(() => {
  adapter = createMemoryCacheAdapter();
  service = createCacheService({
    adapter,
    config: { enabled: true, defaultTtl: 60_000, collectStats: true },
  });
});

// ─── Basic CRUD ────────────────────────────────────────────────────────────

describe("CacheService — get/set", () => {
  it("stores and retrieves values", async () => {
    await service.set("greeting", "hello");
    const result = await service.get<string>("greeting");
    expect(result.hit).toBe(true);
    expect(result.value).toBe("hello");
  });

  it("returns miss for missing keys", async () => {
    const result = await service.get("missing");
    expect(result.hit).toBe(false);
  });
});

describe("CacheService — delete", () => {
  it("deletes an existing key", async () => {
    await service.set("key", "value");
    const result = await service.delete("key");
    expect(result.deleted).toBe(true);
  });
});

describe("CacheService — has", () => {
  it("returns true for existing key", async () => {
    await service.set("key", "value");
    expect(await service.has("key")).toBe(true);
  });

  it("returns false for missing key", async () => {
    expect(await service.has("missing")).toBe(false);
  });
});

describe("CacheService — clear", () => {
  it("clears all entries", async () => {
    await service.set("a", 1);
    await service.set("b", 2);
    const result = await service.clear();
    expect(result.cleared).toBe(2);
  });

  // Regression: clear({ namespace }) must only clear that namespace,
  // not wipe the whole cache.
  it("clear({ namespace }) only clears the given namespace", async () => {
    await service.set("s1", "a", { namespace: "sessions" });
    await service.set("s2", "b", { namespace: "sessions" });
    await service.set("u1", "c", { namespace: "users" });
    await service.set("plain", "d");

    const result = await service.clear({ namespace: "sessions" });
    expect(result.cleared).toBe(2);
    expect(await service.has("s1", { namespace: "sessions" })).toBe(false);
    expect(await service.has("u1", { namespace: "users" })).toBe(true);
    expect(await service.has("plain")).toBe(true);
  });

  it("clear({ pattern }) qualifies the pattern with the prefix", async () => {
    await service.set("user.1", "a");
    await service.set("post.1", "b");
    const result = await service.clear({ pattern: "user.*" });
    expect(result.cleared).toBe(1);
    expect(await service.has("user.1")).toBe(false);
    expect(await service.has("post.1")).toBe(true);
  });
});

// ─── getOrSet ──────────────────────────────────────────────────────────────

describe("CacheService — getOrSet", () => {
  it("computes and caches on miss", async () => {
    const fn = vi.fn().mockResolvedValue("computed");
    const result = await service.getOrSet("key", fn);
    expect(result.value).toBe("computed");
    expect(result.cached).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on hit", async () => {
    await service.set("key", "cached");
    const fn = vi.fn().mockResolvedValue("fresh");
    const result = await service.getOrSet("key", fn);
    expect(result.value).toBe("cached");
    expect(result.cached).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("forceRefresh re-computes", async () => {
    await service.set("key", "old");
    const fn = vi.fn().mockResolvedValue("new");
    const result = await service.getOrSet("key", fn, { forceRefresh: true });
    expect(result.value).toBe("new");
    expect(result.cached).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── Tags ──────────────────────────────────────────────────────────────────

describe("CacheService — tags", () => {
  it("invalidates entries by tag", async () => {
    await service.set("user.1", "alice", { tags: ["user"] });
    await service.set("user.2", "bob", { tags: ["user"] });
    await service.set("post.1", "hello", { tags: ["post"] });

    await service.invalidateByTag(["user"]);
    expect((await service.get("user.1")).hit).toBe(false);
    expect((await service.get("user.2")).hit).toBe(false);
    expect((await service.get("post.1")).hit).toBe(true);
  });

  // Regression: invalidateByTag counts actual deletions, de-duplicates
  // keys shared across tags, and tolerates dead keys.
  it("counts actual deletions once per key across tags", async () => {
    await service.set("shared", "v", { tags: ["a", "b"] });
    const result = await service.invalidateByTag(["a", "b"]);
    expect(result.cleared).toBe(1);
  });

  it("tolerates dead (expired/evicted) keys in tag mappings", async () => {
    await service.set("gone", "v", { tags: ["t"] });
    await adapter.delete("zudojs:gone"); // simulate expiry/eviction
    const result = await service.invalidateByTag(["t"]);
    expect(result.cleared).toBe(0);
  });

  // Regression: delete removes the key's tag mappings so the tag store
  // does not leak.
  it("delete removes tag mappings for the key", async () => {
    await service.set("tagged", "v", { tags: ["t"] });
    await service.delete("tagged");
    await service.set("tagged2", "v2");
    // Re-invalidating the tag must not delete unrelated entries and
    // reports zero (mapping was cleaned up on delete).
    const result = await service.invalidateByTag(["t"]);
    expect(result.cleared).toBe(0);
  });

  // Regression: clear() flushes the tag store.
  it("clear flushes the tag store", async () => {
    await service.set("tagged", "v", { tags: ["t"] });
    await service.clear();
    await service.set("tagged", "fresh");
    const result = await service.invalidateByTag(["t"]);
    expect(result.cleared).toBe(0);
    expect((await service.get("tagged")).hit).toBe(true);
  });
});

// ─── Patterns ──────────────────────────────────────────────────────────────

describe("CacheService — patterns", () => {
  // Regression: the service qualifies the pattern with the builder's
  // prefix, so a service-level pattern matches keys the service wrote.
  it("invalidates entries by pattern", async () => {
    await service.set("user.1", "alice");
    await service.set("user.2", "bob");
    await service.set("post.1", "hello");

    const result = await service.invalidateByPattern("user.*");
    expect(result.cleared).toBe(2);
    expect((await service.get("user.1")).hit).toBe(false);
    expect((await service.get("user.2")).hit).toBe(false);
    expect((await service.get("post.1")).hit).toBe(true);
  });

  it("qualifies the pattern with a configured namespace", async () => {
    const ns = createCacheService({
      adapter,
      config: { namespace: "tenant1" },
    });
    await ns.set("user.1", "a");
    await service.set("user.1", "outside");
    const result = await ns.invalidateByPattern("user.*");
    expect(result.cleared).toBe(1);
    expect((await ns.get("user.1")).hit).toBe(false);
    expect((await service.get("user.1")).hit).toBe(true);
  });
});

// ─── Locking ───────────────────────────────────────────────────────────────

describe("CacheService — locking", () => {
  it("withLock executes function while holding lock", async () => {
    let executed = false;
    await service.withLock("resource", async () => {
      executed = true;
    });
    expect(executed).toBe(true);
  });

  it("withLock releases lock after execution", async () => {
    await service.withLock("resource", async () => {});
    // Should be able to acquire the lock again
    await service.withLock("resource", async () => {});
  });

  it("withLock releases lock on error", async () => {
    await expect(
      service.withLock("resource", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Lock should be released
    await service.withLock("resource", async () => {});
  });
});

// ─── Stats ─────────────────────────────────────────────────────────────────

describe("CacheService — stats", () => {
  it("returns cache statistics", async () => {
    await service.set("key", "value");
    await service.get("key"); // hit
    await service.get("missing"); // miss

    const stats = service.getStats();
    expect(stats).not.toBeNull();
    expect(stats!.hits).toBe(1);
    expect(stats!.misses).toBe(1);
    expect(stats!.sets).toBe(1);
  });

  it("returns null when stats disabled", async () => {
    const noStats = createCacheService({
      adapter,
      config: { collectStats: false },
    });
    expect(noStats.getStats()).toBeNull();
  });
});

// ─── Health Check ──────────────────────────────────────────────────────────

describe("CacheService — health check", () => {
  it("reports healthy for working adapter", async () => {
    const health = await service.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.adapter).toBe("memory");
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.checkedAt).toBeInstanceOf(Date);
  });
});

// ─── Disabled ──────────────────────────────────────────────────────────────

describe("CacheService — disabled", () => {
  it("returns miss for get when disabled", async () => {
    const disabled = createCacheService({
      adapter,
      config: { enabled: false },
    });
    const result = await disabled.get("key");
    expect(result.hit).toBe(false);
  });

  it("returns success=false for set when disabled", async () => {
    const disabled = createCacheService({
      adapter,
      config: { enabled: false },
    });
    const result = await disabled.set("key", "value");
    expect(result.success).toBe(false);
  });

  it("returns deleted=false for delete when disabled", async () => {
    const disabled = createCacheService({
      adapter,
      config: { enabled: false },
    });
    const result = await disabled.delete("key");
    expect(result.deleted).toBe(false);
  });
});

// ─── Lifecycle ─────────────────────────────────────────────────────────────

describe("CacheService — lifecycle", () => {
  it("connect and disconnect resolve", async () => {
    await expect(service.connect()).resolves.not.toThrow();
    await expect(service.disconnect()).resolves.not.toThrow();
  });
});

// ─── Factory ───────────────────────────────────────────────────────────────

describe("createCacheService", () => {
  it("creates a CacheService", () => {
    expect(createCacheService({ adapter })).toBeInstanceOf(CacheService);
  });
});

// ─── Regression: getOrSet stampede protection ──────────────────────────────

describe("CacheService — getOrSet stampede protection", () => {
  it("shares one fn() call across concurrent misses", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return "computed";
    };
    const results = await Promise.all([
      service.getOrSet("stampede", fn),
      service.getOrSet("stampede", fn),
      service.getOrSet("stampede", fn),
    ]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.value === "computed")).toBe(true);
  });

  it("clears the in-flight entry after completion", async () => {
    await service.getOrSet("k", async () => "v1");
    await service.delete("k");
    const second = await service.getOrSet("k", async () => "v2");
    expect(second.value).toBe("v2");
  });
});

// ─── Regression: withLock honors retryAttempts ─────────────────────────────

describe("CacheService — withLock retryAttempts", () => {
  it("honors retryAttempts: 0 (no retries)", async () => {
    let attempts = 0;
    const blocker = service.withLock(
      "contended",
      async () => {
        await new Promise((r) => setTimeout(r, 150));
      },
      { retryAttempts: 5 },
    );
    // Give the blocker time to take the lock
    await new Promise((r) => setTimeout(r, 10));
    const start = Date.now();
    await expect(
      service.withLock("contended", async () => {}, { retryAttempts: 0 }),
    ).rejects.toThrow();
    // With 0 retries there is no retry delay: fails fast, well under the
    // default 3 retries x 100ms.
    expect(Date.now() - start).toBeLessThan(100);
    await blocker;
    void attempts;
  });

  it("retries per the retryAttempts option and eventually succeeds", async () => {
    const blocker = service.withLock("res", async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    await new Promise((r) => setTimeout(r, 10));
    let ran = false;
    await service.withLock(
      "res",
      async () => {
        ran = true;
      },
      { retryAttempts: 5 },
    );
    expect(ran).toBe(true);
    await blocker;
  });
});

// ─── Regression: serializer wiring ─────────────────────────────────────────

describe("CacheService — serializer", () => {
  it("stores structural copies when a serializer is configured", async () => {
    const { JsonCacheSerializer } = await import("../src/serializer.js");
    const svc = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { serializer: new JsonCacheSerializer() },
    });
    const original = { count: 1, nested: { list: [1, 2] } };
    await svc.set("obj", original);
    original.count = 999;
    original.nested.list.push(3);
    const result = await svc.get<typeof original>("obj");
    expect(result.hit).toBe(true);
    expect(result.value).toEqual({ count: 1, nested: { list: [1, 2] } });
    // Each get returns an independent copy
    const again = await svc.get<typeof original>("obj");
    expect(again.value).not.toBe(result.value);
  });

  it("keeps reference semantics without a serializer", async () => {
    const original = { count: 1 };
    await service.set("ref", original);
    const result = await service.get<typeof original>("ref");
    expect(result.value).toBe(original);
  });
});

// ─── Regression: failSilently ──────────────────────────────────────────────

describe("CacheService — failSilently", () => {
  const failingAdapter = () => {
    const a = createMemoryCacheAdapter();
    a.get = async () => {
      throw new Error("adapter down");
    };
    a.set = async () => {
      throw new Error("adapter down");
    };
    a.delete = async () => {
      throw new Error("adapter down");
    };
    a.has = async () => {
      throw new Error("adapter down");
    };
    return a;
  };

  it("get returns a miss on adapter errors", async () => {
    const svc = createCacheService({
      adapter: failingAdapter(),
      config: { failSilently: true },
    });
    const result = await svc.get("k");
    expect(result.hit).toBe(false);
    expect(result.value).toBeNull();
  });

  it("has returns false on adapter errors", async () => {
    const svc = createCacheService({
      adapter: failingAdapter(),
      config: { failSilently: true },
    });
    expect(await svc.has("k")).toBe(false);
  });

  it("set and delete return no-op results on adapter errors", async () => {
    const svc = createCacheService({
      adapter: failingAdapter(),
      config: { failSilently: true },
    });
    const setResult = await svc.set("k", "v");
    expect(setResult.success).toBe(false);
    const delResult = await svc.delete("k");
    expect(delResult.deleted).toBe(false);
  });

  it("still throws when failSilently is not enabled", async () => {
    const svc = createCacheService({ adapter: failingAdapter() });
    await expect(svc.get("k")).rejects.toThrow();
  });
});

// ─── Regression: overwrite: false ──────────────────────────────────────────

describe("CacheService — overwrite: false", () => {
  it("skips the set when the key already exists", async () => {
    await service.set("existing", "original");
    const result = await service.set("existing", "new", { overwrite: false });
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect((await service.get("existing")).value).toBe("original");
  });

  it("sets normally when the key does not exist", async () => {
    const result = await service.set("fresh", "value", { overwrite: false });
    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });
});

// ─── Regression: ttl / expire exposed on the service ───────────────────────

describe("CacheService — ttl/expire", () => {
  it("ttl() reports remaining TTL, null for no expiry, undefined for missing", async () => {
    await service.set("timed", "v", { ttl: 10_000 });
    await service.set("forever", "v", { ttl: null });
    const remaining = await service.ttl("timed");
    expect(remaining).toBeGreaterThan(0);
    expect(await service.ttl("forever")).toBeNull();
    expect(await service.ttl("missing")).toBeUndefined();
  });

  it("expire() updates the TTL of an existing key", async () => {
    await service.set("k", "v", { ttl: 5_000 });
    expect(await service.expire("k", 60_000)).toBe(true);
    const remaining = await service.ttl("k");
    expect(remaining).toBeGreaterThan(30_000);
  });
});

// ─── Regression: TTL validation ────────────────────────────────────────────

describe("CacheService — TTL validation", () => {
  it("rejects zero and negative TTLs", async () => {
    await expect(service.set("k", "v", { ttl: 0 })).rejects.toThrow();
    await expect(service.set("k", "v", { ttl: -5 })).rejects.toThrow();
  });

  it("rejects TTLs above MAX_TTL_MS", async () => {
    const { MAX_TTL_MS } = await import("../src/constants.js");
    await expect(
      service.set("k", "v", { ttl: MAX_TTL_MS + 1 }),
    ).rejects.toThrow();
  });

  it("accepts null TTL (never expires)", async () => {
    const result = await service.set("k", "v", { ttl: null });
    expect(result.success).toBe(true);
    expect(result.expiresAt).toBeNull();
  });
});

// ─── Regression: CacheOperation is runtime-exported ────────────────────────

describe("index exports", () => {
  it("exports CacheOperation as a runtime value", async () => {
    const mod = await import("../src/index.js");
    expect(mod.CacheOperation).toBeDefined();
    expect(mod.CacheOperation.GET).toBe("get");
  });
});
