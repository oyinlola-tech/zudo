/**
 * @zudojs/cache — README Tests
 *
 * The README's Quick Start used to document an API that did not exist
 * (`createMemoryCache`, `ttl`/`maxSize` options) and a cache-aside idiom
 * (`if (!user)` against a `{ hit, value }` result) that never filled the
 * cache. These tests run the documented snippets verbatim so the front door
 * cannot drift from the code again.
 */

import { describe, it, expect, vi } from "vitest";

import {
  CacheOperation,
  createCacheService,
  createMemoryCacheAdapter,
} from "../src/index.js";

interface User {
  id: string;
  name: string;
}

describe("README — Quick Start", () => {
  it("runs the documented cache-aside example and actually fills the cache", async () => {
    const fetchUserFromDb = vi.fn(async (id: string): Promise<User> => ({
      id,
      name: "Alice",
    }));

    const cache = createCacheService({
      adapter: createMemoryCacheAdapter({ maxEntries: 1000 }),
      config: { defaultTtl: 60_000 },
    });

    async function getUser(id: string): Promise<User> {
      const cached = await cache.get<User>(`user.${id}`);
      if (cached.hit) return cached.value!;

      const user = await fetchUserFromDb(id);
      await cache.set(`user.${id}`, user, { tags: ["users"] });
      return user;
    }

    expect(await getUser("123")).toEqual({ id: "123", name: "Alice" });
    expect(await getUser("123")).toEqual({ id: "123", name: "Alice" });
    // The whole point: the second read is served from cache.
    expect(fetchUserFromDb).toHaveBeenCalledTimes(1);
  });

  it("runs the documented getOrSet example", async () => {
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter({ maxEntries: 1000 }),
      config: { defaultTtl: 60_000 },
    });
    const fetchUserFromDb = async (id: string): Promise<User> => ({
      id,
      name: "Alice",
    });

    const first = await cache.getOrSet<User>("user.123", () =>
      fetchUserFromDb("123"),
    );
    const second = await cache.getOrSet<User>("user.123", () =>
      fetchUserFromDb("123"),
    );

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.value.name).toBe("Alice");
  });
});

describe("README — Multi-tenancy", () => {
  it("runs the documented tenant-scoped snippets", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const tenantId = "tenant-a";
    const user: User = { id: "u1", name: "Alice" };

    await cache.set("u1", user, { namespace: tenantId, tags: ["users"] });
    await cache.set("u1", user, { namespace: "tenant-b", tags: ["users"] });

    expect(
      await cache.invalidateByTag(["users"], { namespace: tenantId }),
    ).toEqual({ cleared: 1 });
    expect(await cache.has("u1", { namespace: "tenant-b" })).toBe(true);

    await cache.set("u2", user, { namespace: tenantId });
    expect(await cache.clear({ namespace: tenantId })).toEqual({ cleared: 1 });

    let ran = false;
    await cache.withLock(
      "import",
      async () => {
        ran = true;
      },
      { namespace: tenantId },
    );
    expect(ran).toBe(true);

    // An untrusted namespace is rejected, not honoured.
    await expect(cache.clear({ namespace: "*" })).rejects.toThrow();
  });
});

describe("README — Observability", () => {
  it("runs the documented events, stats and middleware snippets", async () => {
    const misses: (string | undefined)[] = [];
    const spans: string[] = [];

    const cache = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: {
        middlewares: [
          async (ctx, next) => {
            spans.push(String(ctx.operation));
            try {
              return await next();
            } finally {
              /* span.end() */
            }
          },
        ],
      },
    });

    const subscription = cache.subscribe("cache.miss", (event) => {
      misses.push(event.key);
    });

    await cache.get("absent");
    await cache.set("present", 1);
    await cache.get("present");

    expect(misses).toHaveLength(1);
    expect(cache.getStats()).toMatchObject({ hits: 1, misses: 1 });
    expect(cache.getLatencyStats(CacheOperation.GET)!.count).toBe(2);
    expect(cache.getHotKeys(10)!.length).toBe(1);
    expect(await cache.size()).toBe(1);
    expect(spans.length).toBeGreaterThan(0);

    subscription.unsubscribe();
    await cache.get("absent-again");
    expect(misses).toHaveLength(1);
  });
});
