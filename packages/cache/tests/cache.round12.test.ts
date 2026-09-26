/**
 * Round 12 (academy findings) — @zudojs/cache.
 *
 * #130 / #140 Keys containing ":" are rejected under the default separator
 *      because ":" is the scope delimiter (a key "a:b" would collide with
 *      key "b" in namespace "a"); the error now says so and names the
 *      operation that rejected the key instead of "unknown". Under a
 *      different separator ":" is an ordinary character.
 * #5   CacheAdapter.get<TValue>() is an unchecked assertion (doc note only).
 */

import { describe, expect, it } from "vitest";

import {
  CacheError,
  CacheOperation,
  createCacheService,
  createKeyBuilder,
  createMemoryCacheAdapter,
} from "../src/index.js";

async function rejection(run: () => Promise<unknown>): Promise<CacheError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CacheError) return error;
    throw error;
  }
  throw new Error("expected a CacheError");
}

describe("#140 key-validation errors name the operation", () => {
  it("attributes the rejection to the operation that built the key", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const key = "tenant:kola:dashboard";

    const cases: readonly [CacheOperation, () => Promise<unknown>][] = [
      [CacheOperation.GET, () => cache.get(key)],
      [CacheOperation.SET, () => cache.set(key, 1)],
      [CacheOperation.DELETE, () => cache.delete(key)],
      [CacheOperation.HAS, () => cache.has(key)],
      [CacheOperation.TTL, () => cache.ttl(key)],
      [CacheOperation.EXPIRE, () => cache.expire(key, 1000)],
      [CacheOperation.GET, () => cache.getOrSet(key, async () => 1)],
      [CacheOperation.LOCK_ACQUIRE, () => cache.withLock(key, async () => 1)],
      [CacheOperation.CLEAR, () => cache.clear({ pattern: "a:*" })],
      [CacheOperation.DELETE_MANY, () => cache.invalidateByPattern("a:*")],
    ];

    for (const [operation, run] of cases) {
      const error = await rejection(run);
      expect(error.operation, `${operation}`).toBe(operation);
      expect(error.code).toBe("ERR_INVALID_INPUT");
      expect(error.statusCode).toBe(400);
      expect(error.toJSON()).toMatchObject({ operation });
    }
  });

  it("attributes a rejected tag to the operation too", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const set = await rejection(() =>
      cache.set("k", 1, { tags: ["bad\u0000tag"] }),
    );
    expect(set.operation).toBe(CacheOperation.SET);
    const invalidate = await rejection(() =>
      cache.invalidateByTag(["bad\u0000tag"]),
    );
    expect(invalidate.operation).toBe(CacheOperation.DELETE_MANY);
  });

  it("keeps the key and the original stack on the attributed error", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const error = await rejection(() => cache.get("a:b"));
    expect(error.key).toBe("a:b");
    expect(error.stack).toContain("key-builder");
  });

  it("reports the operation in batch results and error stats", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const seen: CacheError[] = [];
    cache.subscribe("cache.error", (event) => {
      if (event.type === "cache.error" && event.error instanceof CacheError)
        seen.push(event.error);
    });
    const [result] = await cache.batch([{ type: "set", key: "a:b", value: 1 }]);
    expect(result?.success).toBe(false);
    expect((result?.error as CacheError).operation).toBe(CacheOperation.SET);
    expect(seen.map((e) => e.operation)).toEqual([CacheOperation.SET]);
    expect(cache.getStats()?.errors).toBe(1);
  });
});

describe("#130 ':' inside a key", () => {
  it("is still rejected under the default separator, with a reason", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    const error = await rejection(() => cache.get("tenant:kola:dashboard"));
    expect(error.message).toContain('must not contain the separator ":"');
    expect(error.message).toContain("namespace option");
    expect(error.message).toContain("different separator");
  });

  it("cannot forge a namespaced key under the default separator", () => {
    const builder = createKeyBuilder();
    expect(builder.build("b", { namespace: "a" })).toBe("zudojs:a:b");
    expect(() => builder.build("a:b")).toThrow(CacheError);
    expect(() => builder.buildPattern("a:*")).toThrow(CacheError);
  });

  it("is an ordinary character under a different separator", () => {
    const builder = createKeyBuilder({ separator: "/" });
    expect(builder.build("tenant:kola:dashboard")).toBe(
      "zudojs/tenant:kola:dashboard",
    );
    expect(builder.build("dashboard", { namespace: "tenant:kola" })).toBe(
      "zudojs/tenant:kola/dashboard",
    );
    expect(builder.buildPattern("tenant:*")).toBe("zudojs/tenant:*");
    expect(() => builder.build("a/b")).toThrow(CacheError);
    expect(() => builder.build("a b")).toThrow(CacheError);
  });

  it("keeps namespaces isolated when ':' is allowed in keys", async () => {
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter({ separator: "/" }),
      config: { separator: "/" },
    });
    await cache.set("tenant:kola:dashboard", "kola");
    await cache.set("dashboard", "scoped", { namespace: "tenant:kola" });
    await cache.set("dashboard", "other", { namespace: "tenant:ada" });

    expect((await cache.get("tenant:kola:dashboard")).value).toBe("kola");
    expect(
      (await cache.get("dashboard", { namespace: "tenant:kola" })).value,
    ).toBe("scoped");

    await cache.clear({ namespace: "tenant:kola" });

    expect((await cache.get("tenant:kola:dashboard")).value).toBe("kola");
    expect(
      (await cache.get("dashboard", { namespace: "tenant:kola" })).hit,
    ).toBe(false);
    expect(
      (await cache.get("dashboard", { namespace: "tenant:ada" })).value,
    ).toBe("other");
  });
});

describe("#5 get<TValue>() is an unchecked assertion", () => {
  it("returns whatever was stored, regardless of the type argument", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    await cache.set("n", "not-a-number");
    const result = await cache.get<number>("n");
    expect(typeof result.value).toBe("string");
  });
});
