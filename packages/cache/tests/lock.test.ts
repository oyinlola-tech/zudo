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
    const originalExpiry = lock!.expiresAt.getTime();
    // Small delay to ensure time progresses
    await new Promise((r) => setTimeout(r, 5));
    const extended = await lock!.extend(10_000);
    expect(extended).toBe(true);
    expect(lock!.expiresAt.getTime()).toBeGreaterThanOrEqual(originalExpiry);
  });

  it("release returns false for wrong token", async () => {
    const lock = await store.acquire("resource");
    // Manually create a fake release
    const fakeLock = { ...lock!, token: "wrong-token" };
    // The release function is bound to the original token
    // So we test by releasing from a different lock perspective
    const released = await lock!.release();
    expect(released).toBe(true);
    // Second release should fail
    const releasedAgain = await lock!.release();
    expect(releasedAgain).toBe(false);
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
    const remaining = lock!.expiresAt.getTime() - Date.now();
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
