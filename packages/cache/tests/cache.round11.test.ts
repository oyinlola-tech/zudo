/**
 * @zudojs/cache — Round 11 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import { createCacheService, createMemoryCacheAdapter, createTagStore } from "../src/index.js";
import type { CacheKey, CacheTag, CacheTagOptions, CacheTagStore } from "../src/index.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface RecordingTagStore extends CacheTagStore {
  readonly removeKeyCalls: string[];
  /** Flipped on after setup so `set()` itself is not the failing call. */
  failRemoveKey: boolean;
}

/**
 * Wraps the in-memory tag store so every mutation completes only after a
 * macrotask — the shape a shared (Redis-backed) store has.
 */
function createAsyncTagStore(): RecordingTagStore {
  const inner = createTagStore();
  const removeKeyCalls: string[] = [];
  const store: RecordingTagStore = {
    removeKeyCalls,
    failRemoveKey: false,
    async add(key: CacheKey, tags: readonly CacheTag[], tagOptions?: CacheTagOptions) {
      await delay(1);
      await inner.add(key, tags, tagOptions);
    },
    async remove(key: CacheKey, tags: readonly CacheTag[], tagOptions?: CacheTagOptions) {
      await delay(1);
      await inner.remove(key, tags, tagOptions);
    },
    async getKeys(tag: CacheTag, tagOptions?: CacheTagOptions) {
      await delay(1);
      return await inner.getKeys(tag, tagOptions);
    },
    async invalidate(tag: CacheTag, tagOptions?: CacheTagOptions) {
      await delay(1);
      return await inner.invalidate(tag, tagOptions);
    },
    async clear() {
      await delay(1);
      inner.clear();
    },
    async trackedKeys() {
      await delay(1);
      return inner.trackedKeys();
    },
    async removeKey(key: CacheKey) {
      removeKeyCalls.push(key);
      await delay(1);
      if (store.failRemoveKey) throw new Error("tag store down");
      inner.removeKey(key);
    },
  };
  return store;
}

/* ─── DATA-01: invalidateByPattern did not await the tag purge ──────────── */

describe("DATA-01", () => {
  it("has dropped the tag mappings by the time invalidateByPattern resolves", async () => {
    const tagStore = createAsyncTagStore();
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { tagStore },
    });

    await cache.set("user.1", { id: 1 }, { tags: ["t"] });
    expect(await tagStore.trackedKeys!()).toEqual(["zudojs:user.1"]);

    await cache.invalidateByPattern("user.*");

    // No extra ticks: the purge must be complete when the call resolves.
    expect(await tagStore.getKeys("t")).toEqual([]);
  });

  it("routes a rejecting tag store through failSilently instead of escaping", async () => {
    const tagStore = createAsyncTagStore();
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { tagStore, failSilently: true },
    });

    await cache.set("user.1", { id: 1 }, { tags: ["t"] });
    tagStore.removeKeyCalls.length = 0;
    tagStore.failRemoveKey = true;
    const result = await cache.invalidateByPattern("user.*");

    // failSilently's catch reports 0 rather than the invalidation's own count.
    expect(result).toEqual({ cleared: 0 });
    expect(tagStore.removeKeyCalls).toEqual(["zudojs:user.1"]);
  });

  it("surfaces a rejecting tag store to the caller when failSilently is off", async () => {
    const tagStore = createAsyncTagStore();
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { tagStore },
    });

    await cache.set("user.1", { id: 1 }, { tags: ["t"] });
    tagStore.failRemoveKey = true;
    await expect(cache.invalidateByPattern("user.*")).rejects.toThrow("tag store down");
  });
});
