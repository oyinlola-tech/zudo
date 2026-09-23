/**
 * @zudojs/cache — batch 5 regression tests.
 *
 * Bugs reproduced by lesson writers against the published package.
 */

import { describe, it, expect } from "vitest";

import { ErrorCode } from "@zudojs/errors";

import {
  CacheError,
  createCacheService,
  createMemoryCacheAdapter,
} from "../src/index.js";
import type { CacheEvent } from "../src/index.js";

const newCache = () =>
  createCacheService({ adapter: createMemoryCacheAdapter() });

/** Resolves to the error `run` rejects with. */
async function rejection(run: () => Promise<unknown>): Promise<CacheError> {
  try {
    await run();
  } catch (error) {
    return error as CacheError;
  }
  throw new Error("expected a rejection");
}

describe("getStats().errors counts invalid keys as well as invalid TTLs", () => {
  it("counts an invalid TTL (the case that already worked)", async () => {
    const cache = newCache();
    await expect(cache.set("k", 1, { ttl: -5 })).rejects.toThrow(CacheError);
    expect(cache.getStats()?.errors).toBe(1);
  });

  it("counts an empty key, a malformed key and an over-long key", async () => {
    const cache = newCache();
    await expect(cache.get("")).rejects.toThrow(CacheError);
    await expect(cache.set("bad key!", 1)).rejects.toThrow(CacheError);
    await expect(cache.has("x".repeat(5_000))).rejects.toThrow(CacheError);
    expect(cache.getStats()?.errors).toBe(3);
  });

  it("counts an invalid clear pattern", async () => {
    const cache = newCache();
    await expect(cache.clear({ pattern: "bad pattern!" })).rejects.toThrow(
      CacheError,
    );
    expect(cache.getStats()?.errors).toBe(1);
  });

  it("emits cache.error for a rejected key, as it does for a rejected TTL", async () => {
    const cache = newCache();
    const events: CacheEvent[] = [];
    cache.subscribe("cache.error", (event) => {
      events.push(event);
    });

    await expect(cache.delete("")).rejects.toThrow(CacheError);

    expect(events).toHaveLength(1);
  });
});

describe("an invalid key carries the ERR_INVALID_INPUT code", () => {
  it("uses ErrorCode.INVALID_INPUT, as the README now documents", async () => {
    const error = await rejection(() => newCache().get(""));
    expect(error).toBeInstanceOf(CacheError);
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(error.code).toBe("ERR_INVALID_INPUT");
  });

  it("rejects an empty namespace with the same code", () => {
    expect(() =>
      createCacheService({
        adapter: createMemoryCacheAdapter(),
        config: { namespace: "" },
      }),
    ).toThrow(expect.objectContaining({ code: "ERR_INVALID_INPUT" }));
  });
});

describe("an invalid tag is an invalid-input error", () => {
  it("rejects an empty tag with ERR_INVALID_INPUT, not CACHE_OPERATION_FAILED", async () => {
    const cache = newCache();
    const error = await rejection(() => cache.set("k", 1, { tags: [""] }));

    expect(error).toBeInstanceOf(CacheError);
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(await cache.has("k")).toBe(false);
  });

  it("rejects an over-long tag with the same code", async () => {
    const error = await rejection(() =>
      newCache().set("k", 1, { tags: ["t".repeat(10_000)] }),
    );
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
  });

  it("counts a rejected tag in the error stats", async () => {
    const cache = newCache();
    await expect(cache.set("k", 1, { tags: [""] })).rejects.toThrow();
    await expect(cache.invalidateByTag([""])).rejects.toThrow();
    expect(cache.getStats()?.errors).toBe(2);
  });
});

describe("ttl() reports whole milliseconds", () => {
  it("returns an integer no greater than the TTL just set", async () => {
    const cache = newCache();
    await cache.set("k", 1, { ttl: 10_000 });

    const remaining = await cache.ttl("k");

    expect(Number.isInteger(remaining)).toBe(true);
    expect(remaining).toBeLessThanOrEqual(10_000);
    expect(remaining).toBeGreaterThan(9_000);
  });

  it("floors on the adapter too", async () => {
    const adapter = createMemoryCacheAdapter();
    await adapter.set("k", 1, { ttl: 10_000 });
    expect(Number.isInteger(await adapter.ttl?.("k"))).toBe(true);
  });

  it("still reports null for an entry that never expires", async () => {
    const cache = newCache();
    await cache.set("k", 1, { ttl: null });
    expect(await cache.ttl("k")).toBeNull();
  });
});
