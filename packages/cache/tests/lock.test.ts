/**
 * @zudojs/cache — Lock Manager Tests
 *
 * Tests for InMemoryLockStore, CacheLockManager acquire/release/extend,
 * withLock execution, and retry behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  InMemoryLockStore,
  CacheLockManager,
  createLockManager,
} from "../src/lock.js";

let store: InMemoryLockStore;
let manager: CacheLockManager;

beforeEach(() => {
  store = new InMemoryLockStore();
  manager = createLockManager({ store, retryAttempts: 2, retryDelayMs: 10 });
});

// ─── InMemoryLockStore ─────────────────────────────────────────────────────

describe("InMemoryLockStore", () => {
  it("acquires a lock", async () => {
    const lock = await store.acquire("resource");
    expect(lock).not.toBeNull();
    expect(lock!.key).toBe("resource");
    expect(lock!.token).toBeTruthy();
    expect(lock!.acquiredAt).toBeInstanceOf(Date);
    expect(lock!.expiresAt).toBeInstanceOf(Date);
  });

  it("returns null when lock is already held", async () => {
    await store.acquire("resource");
    const second = await store.acquire("resource");
    expect(second).toBeNull();
  });

  it("releases a lock", async () => {
    const lock = await store.acquire("resource");
    const released = await lock!.release();
    expect(released).toBe(true);
    // Can acquire again
    const second = await store.acquire("resource");
    expect(second).not.toBeNull();
  });

  it("extend extends lock TTL", async () => {
    const lock = await store.acquire("resource", { ttl: 100 });
    const originalExpiry = lock!.expiresAt!.getTime();
    // Small delay to ensure time progresses
    await new Promise((r) => setTimeout(r, 5));
    const extended = await lock!.extend(10_000);
    expect(extended).toBe(true);
    expect(lock!.expiresAt!.getTime()).toBeGreaterThanOrEqual(originalExpiry);
  });

  it("release returns false once the lease has been taken over", async () => {
    // `release()` closes over its own token, so a "wrong token" arises in
    // practice when the lease expires and another holder acquires it. The
    // original holder must not then release the new owner's lock.
    const first = await store.acquire("resource", { ttl: 20 });
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 40));

    const second = await store.acquire("resource", { ttl: 1_000 });
    expect(second).not.toBeNull();
    expect(second!.token).not.toBe(first!.token);

    // The stale holder releasing must be a no-op, not a steal.
    expect(await first!.release()).toBe(false);
    // The current owner still holds it.
    expect(await second!.release()).toBe(true);
  });

  it("release returns false on a second release by the same holder", async () => {
    const lock = await store.acquire("resource");
    expect(await lock!.release()).toBe(true);
    expect(await lock!.release()).toBe(false);
  });

  it("tracks lock count", async () => {
    expect(store.size).toBe(0);
    await store.acquire("a");
    expect(store.size).toBe(1);
    await store.acquire("b");
    expect(store.size).toBe(2);
  });

  it("clear() removes all locks", async () => {
    await store.acquire("a");
    await store.acquire("b");
    store.clear();
    expect(store.size).toBe(0);
  });

  it("acquires expired lock after expiry", async () => {
    await store.acquire("resource", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const lock = await store.acquire("resource");
    expect(lock).not.toBeNull();
  });
});

// ─── CacheLockManager ──────────────────────────────────────────────────────

describe("CacheLockManager", () => {
  it("acquires a lock", async () => {
    const lock = await manager.acquire("resource");
    expect(lock).not.toBeNull();
  });

  it("returns null after exhausting retries", async () => {
    await store.acquire("resource");
    const lock = await manager.acquire("resource");
    expect(lock).toBeNull();
  });

  it("withLock executes function while holding lock", async () => {
    let executed = false;
    await manager.withLock("resource", async () => {
      executed = true;
    });
    expect(executed).toBe(true);
    // Lock should be released
    const lock = await store.acquire("resource");
    expect(lock).not.toBeNull();
  });

  it("withLock releases lock even if function throws", async () => {
    await expect(
      manager.withLock("resource", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Lock should still be released
    const lock = await store.acquire("resource");
    expect(lock).not.toBeNull();
  });

  it("withLock throws when lock cannot be acquired", async () => {
    await store.acquire("resource");
    await expect(
      manager.withLock("resource", async () => {}),
    ).rejects.toThrow();
  });

  it("respects lock TTL in options", async () => {
    const lock = await manager.acquire("resource", { ttl: 1000 });
    expect(lock).not.toBeNull();
    const remaining = lock!.expiresAt!.getTime() - Date.now();
    expect(remaining).toBeLessThanOrEqual(1000);
    expect(remaining).toBeGreaterThan(0);
  });
});

// ─── Factory ───────────────────────────────────────────────────────────────

describe("createLockManager", () => {
  it("creates a CacheLockManager", () => {
    const m = createLockManager();
    expect(m).toBeInstanceOf(CacheLockManager);
  });

  it("accepts custom store", async () => {
    const customStore = new InMemoryLockStore();
    const m = createLockManager({ store: customStore });
    await m.acquire("key");
    expect(customStore.size).toBe(1);
  });
});

// ─── Regression: per-call retry options ────────────────────────────────────

describe("CacheLockManager — per-call retry", () => {
  it("honors retry.attempts = 0 (single attempt, no delay)", async () => {
    await store.acquire("resource");
    const start = Date.now();
    const lock = await manager.acquire("resource", {
      retry: { attempts: 0, delay: 100 },
    });
    expect(lock).toBeNull();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("honors per-call retry attempts and delay", async () => {
    const held = await store.acquire("resource", { ttl: 40 });
    expect(held).not.toBeNull();
    // 5 attempts x 20ms delay outlives the 40ms lock TTL
    const lock = await manager.acquire("resource", {
      retry: { attempts: 5, delay: 20 },
    });
    expect(lock).not.toBeNull();
  });
});

// ─── Regression: expired locks are swept ───────────────────────────────────

describe("InMemoryLockStore — expired lock sweeping", () => {
  it("sweeps all expired locks on acquire, not just the requested key", async () => {
    await store.acquire("stale-1", { ttl: 1 });
    await store.acquire("stale-2", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(store.size).toBe(2);
    await store.acquire("fresh");
    expect(store.size).toBe(1); // only "fresh" remains
  });

  it("supports null TTL (never-expiring lock)", async () => {
    const lock = await store.acquire("permanent", { ttl: null });
    expect(lock).not.toBeNull();
    expect(lock!.expiresAt).toBeNull();
    store.sweepExpired();
    expect(store.size).toBe(1);
  });
});

// ─── Regression: namespace-scoped locks ────────────────────────────────────

describe("InMemoryLockStore — namespace scoping", () => {
  // Regression (CACHE-15): CacheLockOptions.namespace was declared and read
  // nowhere, so tenant A's withLock("import") blocked tenant B's.
  it("does not contend across namespaces", async () => {
    const a = await store.acquire("import", { namespace: "tenant-a" });
    const b = await store.acquire("import", { namespace: "tenant-b" });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it("still contends within one namespace", async () => {
    const first = await store.acquire("import", { namespace: "tenant-a" });
    const second = await store.acquire("import", { namespace: "tenant-a" });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("releases only its own scoped lease", async () => {
    const a = await store.acquire("import", { namespace: "tenant-a" });
    await store.acquire("import", { namespace: "tenant-b" });
    expect(await a!.release()).toBe(true);
    expect(await store.acquire("import", { namespace: "tenant-b" })).toBeNull();
  });
});

// ─── Regression: lock TTL validation ───────────────────────────────────────

describe("InMemoryLockStore — TTL validation", () => {
  // Regression (CACHE-28): a negative TTL minted an already-expired lease
  // that the next sweep dropped, so withLock provided no exclusion at all
  // while appearing to succeed.
  it("rejects a negative or zero TTL", async () => {
    await expect(store.acquire("k", { ttl: -1_000 })).rejects.toThrow();
    await expect(store.acquire("k", { ttl: 0 })).rejects.toThrow();
  });

  it("rejects an oversized TTL", async () => {
    await expect(
      store.acquire("k", { ttl: 25 * 60 * 60 * 1000 }),
    ).rejects.toThrow();
  });

  it("rejects an invalid TTL on extend", async () => {
    const lock = await store.acquire("k", { ttl: 1_000 });
    await expect(lock!.extend(-1)).rejects.toThrow();
  });

  it("accepts ttl: null (never expires)", async () => {
    const lock = await store.acquire("k", { ttl: null });
    expect(lock!.expiresAt).toBeNull();
  });
});

// ─── Regression: acquire() distinguishes contention from store failure ─────

describe("CacheLockManager — acquire error handling", () => {
  // Regression (CACHE-28): lastError was sticky, so a transient store error
  // on attempt 1 made an ordinary "someone else holds it" outcome throw a
  // misleading store-failure CacheError.
  it("returns null when a transient error is followed by clean contention", async () => {
    let attempt = 0;
    const flaky = {
      acquire: async () => {
        attempt++;
        if (attempt === 1) throw new Error("transient store error");
        return null;
      },
    };
    const mgr = createLockManager({
      store: flaky,
      retryAttempts: 3,
      retryDelayMs: 1,
    });
    await expect(mgr.acquire("k")).resolves.toBeNull();
  });

  it("throws when the final attempt fails with a store error", async () => {
    const broken = {
      acquire: async () => {
        throw new Error("store down");
      },
    };
    const mgr = createLockManager({
      store: broken,
      retryAttempts: 1,
      retryDelayMs: 1,
    });
    await expect(mgr.acquire("k")).rejects.toThrow(/Failed to acquire lock/);
  });

  it("tags the failure with CACHE_LOCK_ACQUIRE_FAILED", async () => {
    const broken = {
      acquire: async () => {
        throw new Error("store down");
      },
    };
    const mgr = createLockManager({
      store: broken,
      retryAttempts: 0,
      retryDelayMs: 1,
    });
    await expect(mgr.acquire("k")).rejects.toMatchObject({
      code: "CACHE_LOCK_ACQUIRE_FAILED",
    });
  });
});

// ─── Regression: withLock detects lease loss ───────────────────────────────

describe("CacheLockManager — withLock lease handling", () => {
  // Regression (CACHE-04): withLock threw away release()'s boolean — the
  // only signal that the lease expired mid-critical-section — and never
  // renewed the lease, so mutual exclusion failed silently.
  it("throws when the lease was lost before the critical section finished", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    await expect(
      mgr.withLock(
        "resource",
        async () => {
          // Simulate a lease taken over by someone else: drop it, then let
          // another holder claim the name.
          store.clear();
          await store.acquire("resource");
          return "done";
        },
        { ttl: 60_000 },
      ),
    ).rejects.toThrow(/was lost before the critical section completed/);
  });

  it("tags the lost lease with CACHE_LOCK_LOST", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    await expect(
      mgr.withLock(
        "resource",
        async () => {
          store.clear();
          return 1;
        },
        { ttl: 60_000 },
      ),
    ).rejects.toMatchObject({ code: "CACHE_LOCK_LOST" });
  });

  it("does not mask an error thrown by fn", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    await expect(
      mgr.withLock(
        "resource",
        async () => {
          store.clear();
          throw new Error("original failure");
        },
        { ttl: 60_000 },
      ),
    ).rejects.toThrow("original failure");
  });

  it("renews the lease so a critical section longer than the TTL keeps it", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    let concurrent: unknown = "not-attempted";
    const result = await mgr.withLock(
      "slow",
      async () => {
        // Run well past the TTL; the heartbeat (ttl/3) must keep the lease.
        await new Promise((r) => setTimeout(r, 160));
        concurrent = await store.acquire("slow");
        return "ok";
      },
      { ttl: 60 },
    );
    expect(result).toBe("ok");
    // A second acquire during the critical section must still be refused.
    expect(concurrent).toBeNull();
  });

  it("passes an AbortSignal to fn", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    let seen: AbortSignal | undefined;
    await mgr.withLock(
      "resource",
      async (signal) => {
        seen = signal;
        return 1;
      },
      { ttl: 60_000 },
    );
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);
  });

  it("still accepts a zero-argument fn", async () => {
    const mgr = createLockManager({ store, retryAttempts: 0 });
    await expect(mgr.withLock("resource", async () => 42)).resolves.toBe(42);
  });
});
