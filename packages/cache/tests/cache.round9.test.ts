/**
 * @zudojs/cache — Round 9 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import { createCacheService, createMemoryCacheAdapter } from "../src/index.js";

/* ─── CACHE-R9-01: overwriting a key kept the previous write's tags ─────── */

describe("CACHE-R9-01", () => {
  it("drops tags from an earlier write when the key is overwritten", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

    await cache.set("user.1", { v: 1 }, { tags: ["old"] });
    await cache.set("user.1", { v: 2 }, { tags: ["new"] });

    expect((await cache.get("user.1")).entry?.tags).toEqual(["new"]);

    // The entry is no longer tagged "old", so this must not touch it.
    expect(await cache.invalidateByTag(["old"])).toEqual({ cleared: 0 });
    expect((await cache.get("user.1")).hit).toBe(true);

    expect(await cache.invalidateByTag(["new"])).toEqual({ cleared: 1 });
    expect((await cache.get("user.1")).hit).toBe(false);
  });

  it("an untagged overwrite leaves the key with no tags", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

    await cache.set("k", 1, { tags: ["x"] });
    await cache.set("k", 2);

    expect(await cache.invalidateByTag(["x"])).toEqual({ cleared: 0 });
    expect((await cache.get("k")).value).toBe(2);
  });

  it("a skipped write (overwrite: false) keeps the existing tags", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

    await cache.set("k", 1, { tags: ["keep"] });
    const skipped = await cache.set("k", 2, { tags: ["ignored"], overwrite: false });
    expect(skipped.skipped).toBe(true);

    expect(await cache.invalidateByTag(["ignored"])).toEqual({ cleared: 0 });
    expect(await cache.invalidateByTag(["keep"])).toEqual({ cleared: 1 });
  });

  it("scopes the replacement per namespace", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

    await cache.set("k", 1, { namespace: "t1", tags: ["shared"] });
    await cache.set("k", 1, { namespace: "t2", tags: ["shared"] });
    await cache.set("k", 2, { namespace: "t1", tags: ["other"] });

    expect(await cache.invalidateByTag(["shared"], { namespace: "t2" })).toEqual({
      cleared: 1,
    });
    expect(await cache.invalidateByTag(["shared"], { namespace: "t1" })).toEqual({
      cleared: 0,
    });
    expect((await cache.get("k", { namespace: "t1" })).value).toBe(2);
  });
});
