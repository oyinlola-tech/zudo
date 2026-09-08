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

// ─── Regression: namespace is a scope boundary, not a pattern ──────────────

describe("CacheService — namespace validation", () => {
  // Regression (CACHE-01, CRITICAL): buildPattern validated nothing, so
  // `clear({ namespace: req.params.tenantId })` with tenantId = "*" was a
  // full-cache-destruction primitive that reported a plausible count.
  it("refuses a wildcard namespace on clear()", async () => {
    await service.set("s1", "a", { namespace: "tenant-a" });
    await service.set("s2", "b", { namespace: "tenant-b" });

    await expect(service.clear({ namespace: "*" })).rejects.toThrow();

    expect(await service.has("s1", { namespace: "tenant-a" })).toBe(true);
    expect(await service.has("s2", { namespace: "tenant-b" })).toBe(true);
  });

  it("refuses a namespace containing the separator", async () => {
    await expect(service.clear({ namespace: "a:b" })).rejects.toThrow();
    await expect(
      service.invalidateByPattern("*", { namespace: "a:*" }),
    ).rejects.toThrow();
  });

  it("refuses a malformed pattern", async () => {
    await expect(service.clear({ pattern: "a:b" })).rejects.toThrow();
    await expect(service.invalidateByPattern("user (1)")).rejects.toThrow();
  });

  // Regression (CACHE-01, pattern side): on a service with no namespace,
  // invalidateByPattern("*") used to match — and delete — every namespaced
  // key the service ever wrote.
  it("does not let a pattern reach into a namespace it did not name", async () => {
    await service.set("plain", "a");
    await service.set("scoped", "b", { namespace: "tenant-a" });

    const result = await service.invalidateByPattern("*");
    expect(result.cleared).toBe(1);
    expect(await service.has("scoped", { namespace: "tenant-a" })).toBe(true);
  });

  it("spans namespaces only with an explicit ** pattern", async () => {
    await service.set("plain", "a");
    await service.set("scoped", "b", { namespace: "tenant-a" });
    const result = await service.invalidateByPattern("**");
    expect(result.cleared).toBe(2);
  });
});

// ─── Regression: cross-namespace tag isolation ─────────────────────────────

describe("CacheService — tag scoping", () => {
  // Regression (CACHE-03): tags lived in one flat global map, so tenant A's
  // invalidateByTag(["users"]) silently purged tenant B's entries and the
  // reported count included the foreign deletions.
  it("invalidateByTag never touches another namespace", async () => {
    const tenantA = createCacheService({
      adapter,
      config: { namespace: "tenant-a" },
    });
    const tenantB = createCacheService({
      adapter,
      config: { namespace: "tenant-b" },
    });

    await tenantA.set("u1", "a", { tags: ["users"] });
    await tenantB.set("u1", "b", { tags: ["users"] });

    const result = await tenantA.invalidateByTag(["users"]);

    expect(result.cleared).toBe(1);
    expect((await tenantA.get("u1")).hit).toBe(false);
    expect((await tenantB.get("u1")).hit).toBe(true);
  });

  it("honours a per-call tag namespace", async () => {
    await service.set("k1", "a", { namespace: "tenant-a", tags: ["users"] });
    await service.set("k2", "b", { namespace: "tenant-b", tags: ["users"] });

    const result = await service.invalidateByTag(["users"], {
      namespace: "tenant-a",
    });
    expect(result.cleared).toBe(1);
    expect(await service.has("k2", { namespace: "tenant-b" })).toBe(true);
  });

  it("rejects malformed tags", async () => {
    await expect(service.set("k", "v", { tags: [""] })).rejects.toThrow();
    await expect(service.invalidateByTag([""])).rejects.toThrow();
  });
});

// ─── Regression: locks are scoped and qualified ────────────────────────────

describe("CacheService — lock scoping", () => {
  // Regression (CACHE-15): withLock passed the raw key straight through, so
  // lock names were neither prefixed nor namespaced and two tenants using
  // the same name collided.
  it("does not contend across namespaces", async () => {
    let inner = "not-run";
    await service.withLock(
      "import",
      async () => {
        await service.withLock(
          "import",
          async () => {
            inner = "ran";
          },
          { namespace: "tenant-b", retryAttempts: 0 },
        );
      },
      { namespace: "tenant-a", retryAttempts: 0 },
    );
    expect(inner).toBe("ran");
  });

  it("still contends within one namespace", async () => {
    await expect(
      service.withLock(
        "import",
        async () =>
          service.withLock("import", async () => "inner", {
            retryAttempts: 0,
          }),
        { retryAttempts: 0 },
      ),
    ).rejects.toThrow(/Could not acquire lock/);
  });

  it("validates the lock name like a key", async () => {
    await expect(service.withLock("bad:name", async () => 1)).rejects.toThrow();
  });
});

// ─── Regression: enabled: false covers every entry point ───────────────────

describe("CacheService — disabled covers invalidation, locks and health", () => {
  const disabledService = () =>
    createCacheService({ adapter, config: { enabled: false } });

  // Regression (CACHE-12): the kill switch guarded only get/set/delete/has/
  // clear/ttl/expire/getOrSet, so a disabled cache still issued deletes and
  // contended locks against a store the operator had taken out of service.
  it("returns cleared: 0 from invalidateByTag without touching the adapter", async () => {
    await service.set("k", "v", { tags: ["t"] });
    const disabled = disabledService();
    expect(await disabled.invalidateByTag(["t"])).toEqual({ cleared: 0 });
    expect((await service.get("k")).hit).toBe(true);
  });

  it("returns cleared: 0 from invalidateByPattern without touching the adapter", async () => {
    await service.set("user.1", "v");
    const disabled = disabledService();
    expect(await disabled.invalidateByPattern("user.*")).toEqual({
      cleared: 0,
    });
    expect((await service.get("user.1")).hit).toBe(true);
  });

  it("throws rather than running a critical section unlocked", async () => {
    const disabled = disabledService();
    let ran = false;
    await expect(
      disabled.withLock("resource", async () => {
        ran = true;
      }),
    ).rejects.toMatchObject({ code: "CACHE_DISABLED" });
    expect(ran).toBe(false);
  });

  it("reports healthy with a disabled marker", async () => {
    const health = await disabledService().healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.disabled).toBe(true);
  });
});

// ─── Regression: failSilently covers every fallible method ─────────────────

describe("CacheService — failSilently coverage", () => {
  const brokenService = () => {
    const broken = createMemoryCacheAdapter();
    const down = async () => {
      throw new Error("adapter down");
    };
    broken.get = down as typeof broken.get;
    broken.set = down as typeof broken.set;
    broken.delete = down as typeof broken.delete;
    broken.has = down as typeof broken.has;
    broken.clear = down as typeof broken.clear;
    broken.ttl = down as typeof broken.ttl;
    broken.expire = down as typeof broken.expire;
    return createCacheService({
      adapter: broken,
      config: { failSilently: true },
    });
  };

  // Regression (CACHE-13): clear/ttl/expire/invalidate* had no try/catch at
  // all, so the first cache.clear() during an incident took the request down
  // even though the operator had switched the cache to non-load-bearing.
  it("degrades clear() to cleared: 0", async () => {
    const svc = brokenService();
    await expect(svc.clear()).resolves.toEqual({ cleared: 0 });
    await expect(svc.clear({ pattern: "user.*" })).resolves.toEqual({
      cleared: 0,
    });
  });

  it("degrades ttl() to undefined and expire() to false", async () => {
    const svc = brokenService();
    await expect(svc.ttl("k")).resolves.toBeUndefined();
    await expect(svc.expire("k", 1_000)).resolves.toBe(false);
  });

  it("degrades invalidateByTag/invalidateByPattern to cleared: 0", async () => {
    const svc = brokenService();
    await expect(svc.invalidateByTag(["t"])).resolves.toEqual({ cleared: 0 });
    await expect(svc.invalidateByPattern("user.*")).resolves.toEqual({
      cleared: 0,
    });
  });

  it("still throws on key and pattern validation errors", async () => {
    const svc = brokenService();
    await expect(svc.get("bad:key")).rejects.toThrow();
    await expect(svc.clear({ namespace: "*" })).rejects.toThrow();
  });
});

// ─── Regression: metadata round-trips ──────────────────────────────────────

describe("CacheService — entry metadata", () => {
  // Regression (CACHE-08): CacheService.set had no metadata parameter, and
  // getOrSet accepted one and silently dropped it; nothing could read the
  // entry back.
  it("round-trips metadata through set/get", async () => {
    await service.set("k", "v", { metadata: { source: "db" } });
    const result = await service.get<string>("k");
    expect(result.entry?.metadata).toEqual({ source: "db" });
    expect(result.entry?.tags).toEqual([]);
  });

  it("round-trips metadata supplied through getOrSet", async () => {
    await service.getOrSet("k", async () => "v", {
      metadata: { source: "compute" },
    });
    const result = await service.get("k");
    expect(result.entry?.metadata).toEqual({ source: "compute" });
  });

  it("carries the deserialized value on entry when a serializer is set", async () => {
    const { JsonCacheSerializer } = await import("../src/serializer.js");
    const svc = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { serializer: new JsonCacheSerializer() },
    });
    await svc.set("k", { n: 1 }, { metadata: { v: 2 } });
    const result = await svc.get<{ n: number }>("k");
    expect(result.value).toEqual({ n: 1 });
    expect(result.entry?.value).toEqual({ n: 1 });
    expect(result.entry?.metadata).toEqual({ v: 2 });
  });
});

// ─── Regression: events are reachable ──────────────────────────────────────

describe("CacheService — subscribe", () => {
  // Regression (CACHE-06): DefaultCacheStore emitted six event types and
  // offered subscribe(), but the field was typed CacheStore and private, so
  // every event was constructed on the hot path and dispatched to nobody.
  it("delivers hit, miss, set and delete events", async () => {
    const seen: string[] = [];
    const subscription = service.subscribe("*", (event) => {
      seen.push(event.type);
    });

    await service.set("k", "v");
    await service.get("k");
    await service.get("missing");
    await service.delete("k");

    expect(seen).toContain("cache.set");
    expect(seen).toContain("cache.hit");
    expect(seen).toContain("cache.miss");
    expect(seen).toContain("cache.delete");
    subscription.unsubscribe();
  });

  it("stops delivering after unsubscribe", async () => {
    let count = 0;
    const subscription = service.subscribe("cache.set", () => {
      count++;
    });
    await service.set("a", 1);
    subscription.unsubscribe();
    await service.set("b", 2);
    expect(count).toBe(1);
  });
});

// ─── Regression: middleware is reachable from the factory ──────────────────

describe("CacheService — middlewares", () => {
  // Regression (CACHE-07): createCacheStore accepted middlewares but
  // CacheService never forwarded any and CacheConfig had no field for them,
  // so the documented extension point was unreachable from the only
  // documented entry point.
  it("runs configured middlewares around adapter operations", async () => {
    const calls: string[] = [];
    const svc = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: {
        middlewares: [
          async (ctx, next) => {
            calls.push(String(ctx.operation));
            return next();
          },
        ],
      },
    });
    await svc.set("k", "v");
    const result = await svc.get<string>("k");
    expect(result.value).toBe("v");
    expect(calls).toEqual(["set", "get"]);
  });
});

// ─── Regression: metrics surfaces are reachable ────────────────────────────

describe("CacheService — metrics accessors", () => {
  // Regression (CACHE-11): latency samples, histograms and hot keys were
  // computed and retained on every operation for accessors no consumer of
  // createCacheService could reach.
  it("exposes latency stats, histogram, hot keys and reset", async () => {
    await service.set("k", "v");
    await service.get("k");
    await service.get("k");

    const latency = service.getLatencyStats("get" as never);
    expect(latency!.count).toBeGreaterThan(0);

    const histogram = service.getLatencyHistogram("get" as never);
    expect(histogram!.length).toBeGreaterThan(0);

    const hot = service.getHotKeys(5);
    expect(hot!.length).toBeGreaterThan(0);
    expect(hot![0]!.key).toContain("k");

    service.resetStats();
    expect(service.getStats()!.hits).toBe(0);
    expect(service.getHotKeys()).toEqual([]);
  });

  it("returns null when stats collection is disabled", () => {
    const svc = createCacheService({
      adapter,
      config: { collectStats: false },
    });
    expect(svc.getStats()).toBeNull();
    expect(svc.getHotKeys()).toBeNull();
    expect(svc.getLatencyStats("get" as never)).toBeNull();
  });
});

// ─── size() ────────────────────────────────────────────────────────────────

describe("CacheService — size", () => {
  it("reports the adapter's live entry count", async () => {
    await service.set("a", 1);
    await service.set("b", 2);
    expect(await service.size()).toBe(2);
  });

  it("returns undefined when disabled", async () => {
    const disabled = createCacheService({
      adapter,
      config: { enabled: false },
    });
    expect(await disabled.size()).toBeUndefined();
  });
});

// ─── Batch API ─────────────────────────────────────────────────────────────

describe("CacheService — batch", () => {
  // The exported CacheBatchOperation/CacheBatchResult types described a
  // batch API that did not exist (CACHE-26); this is it.
  it("applies get/set/delete in order and reports each result", async () => {
    const results = await service.batch([
      { type: "set", key: "a", value: 1 },
      { type: "get", key: "a" },
      { type: "delete", key: "a" },
      { type: "get", key: "a" },
    ]);

    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
    expect((results[1]!.result as { value: unknown }).value).toBe(1);
    expect((results[2]!.result as { deleted: boolean }).deleted).toBe(true);
    expect((results[3]!.result as { hit: boolean }).hit).toBe(false);
  });

  it("reports a failing operation without aborting the batch", async () => {
    const results = await service.batch([
      { type: "set", key: "bad:key", value: 1 },
      { type: "set", key: "good", value: 2 },
    ]);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toBeDefined();
    expect(results[1]!.success).toBe(true);
    expect((await service.get("good")).hit).toBe(true);
  });

  it("honours set options and a batch-level namespace", async () => {
    await service.batch(
      [{ type: "set", key: "k", value: "v", options: { tags: ["t"] } }],
      { namespace: "tenant-a" },
    );
    expect(await service.has("k", { namespace: "tenant-a" })).toBe(true);
    expect(await service.has("k")).toBe(false);
  });
});

// ─── Regression: getOrSet with forceRefresh alongside concurrent callers ───

describe("CacheService — getOrSet forceRefresh concurrency", () => {
  it("does not leave a stale in-flight entry behind", async () => {
    let calls = 0;
    const slow = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return `v${calls}`;
    };

    const [refreshed, normal] = await Promise.all([
      service.getOrSet("k", slow, { forceRefresh: true }),
      service.getOrSet("k", slow),
    ]);

    expect(refreshed.value).toBeDefined();
    expect(normal.value).toBeDefined();
    // Whatever interleaving occurred, the in-flight map must be empty and a
    // later call must serve the cached value rather than recompute.
    const after = await service.getOrSet("k", async () => "recomputed");
    expect(after.cached).toBe(true);
    expect(after.value).not.toBe("recomputed");
  });
});

// ─── disconnect() clears service-local state ───────────────────────────────

describe("CacheService — disconnect", () => {
  it("drops tag mappings and in-flight computations", async () => {
    await service.set("k", "v", { tags: ["t"] });
    await service.disconnect();
    // The tag mappings are gone, so a later invalidateByTag clears nothing.
    expect(await service.invalidateByTag(["t"])).toEqual({ cleared: 0 });
  });
});

// ─── Regression: locks can be shared across service instances ──────────────

describe("CacheService — shared lock store", () => {
  // Regression (CACHE-15): CacheService called createLockManager() per
  // instance, so two services in one process shared no locks at all, while
  // the exported defaultLockStore singleton was used by nothing.
  it("two services sharing a lock store contend with each other", async () => {
    const { InMemoryLockStore } = await import("../src/lock.js");
    const lockStore = new InMemoryLockStore();
    const a = createCacheService({ adapter, config: { lockStore } });
    const b = createCacheService({ adapter, config: { lockStore } });

    await expect(
      a.withLock(
        "rebuild",
        async () =>
          b.withLock("rebuild", async () => "inner", {
            retryAttempts: 0,
          }),
        { retryAttempts: 0 },
      ),
    ).rejects.toThrow(/Could not acquire lock/);
  });

  it("services with independent stores do not contend", async () => {
    const a = createCacheService({ adapter });
    const b = createCacheService({ adapter });
    const result = await a.withLock(
      "rebuild",
      async () =>
        b.withLock("rebuild", async () => "inner", { retryAttempts: 0 }),
      { retryAttempts: 0 },
    );
    expect(result).toBe("inner");
  });
});
