/**
 * @zudojs/cache — Round 10 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  JsonCacheSerializer,
  createCacheService,
  createLockManager,
  createMemoryCacheAdapter,
  createTagStore,
} from "../src/index.js";
import type { CacheLockStore } from "../src/index.js";

/* ─── data/SER-02: a cached `$type` field made the key unreadable ───────── */

describe("SER-02", () => {
  it("reads back a value carrying an unregistered `$type` discriminator", () => {
    const serializer = new JsonCacheSerializer();
    const value = { $type: "order", id: 1, lines: [{ $type: "line", sku: "a" }] };
    expect(serializer.deserialize(serializer.serialize(value))).toEqual(value);
  });

  it("reads back a value whose `$type` collides with a built-in tag", () => {
    // Relies on @zudojs/serialization escaping user objects that carry `$type`.
    const serializer = new JsonCacheSerializer();
    const value = { $type: "Date", $value: "not a date", n: 1 };
    expect(serializer.deserialize(serializer.serialize(value))).toEqual(value);
  });

  it("round-trips through CacheService with the JSON serializer", async () => {
    const cache = createCacheService({
      adapter: createMemoryCacheAdapter(),
      config: { serializer: new JsonCacheSerializer() },
    });
    await cache.set("order.1", { $type: "order", id: 1 });
    const read = await cache.get("order.1");
    expect(read.value).toEqual({ $type: "order", id: 1 });
  });

  it("still drops prototype-polluting keys on both paths", () => {
    for (const preserveTypes of [true, false]) {
      const out = new JsonCacheSerializer({ preserveTypes }).deserialize(
        '{"a":{"__proto__":{"isAdmin":true},"constructor":"x","ok":1}}',
      ) as { a: Record<string, unknown> };
      expect(Object.getOwnPropertyNames(out.a)).toEqual(["ok"]);
      expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    }
  });
});

/* ─── INF-07: the tag store could not be shared between instances ──────── */

describe("INF-07", () => {
  it("invalidates entries written by another instance sharing the tag store", async () => {
    const adapter = createMemoryCacheAdapter();
    const tagStore = createTagStore();
    const a = createCacheService({ adapter, config: { tagStore } });
    const b = createCacheService({ adapter, config: { tagStore } });

    await a.set("user.1", { n: 1 }, { tags: ["users"] });
    expect(await b.invalidateByTag(["users"])).toEqual({ cleared: 1 });
    expect((await a.get("user.1")).hit).toBe(false);
  });

  it("does not flush an injected store on disconnect", async () => {
    const adapter = createMemoryCacheAdapter();
    const tagStore = createTagStore();
    const a = createCacheService({ adapter, config: { tagStore } });
    const b = createCacheService({ adapter, config: { tagStore } });
    await a.set("user.1", 1, { tags: ["users"] });
    await b.disconnect();
    expect(await tagStore.getKeys("users")).toHaveLength(1);
  });
});

/* ─── INF-08: an empty namespace fell through to the global keyspace ───── */

describe("INF-08", () => {
  it("rejects an empty namespace per call", async () => {
    const adapter = createMemoryCacheAdapter();
    const tenantA = createCacheService({ adapter, config: { namespace: "tenantA" } });
    await createCacheService({ adapter }).set("secret", "GLOBAL-VALUE");

    await expect(tenantA.get("secret", { namespace: "" })).rejects.toThrow(
      /namespace|key part/i,
    );
    await expect(tenantA.set("secret", "x", { namespace: "" })).rejects.toThrow();
    await expect(
      tenantA.withLock("job", async () => 1, { namespace: "" }),
    ).rejects.toThrow();
    await expect(tenantA.invalidateByTag(["t"], { namespace: "" })).rejects.toThrow();
  });

  it("rejects an empty namespace in the config", () => {
    expect(() =>
      createCacheService({
        adapter: createMemoryCacheAdapter(),
        config: { namespace: "" },
      }),
    ).toThrow(/namespace/i);
  });
});

/* ─── INF-12: a failing release() masked the critical section's error ──── */

describe("INF-12", () => {
  it("surfaces the critical section's error, with the release error attached", async () => {
    const releaseError = new Error("REDIS DOWN on release");
    const store = {
      acquire: async (key: string) => ({
        key,
        token: "t",
        acquiredAt: new Date(),
        expiresAt: null,
        release: async () => {
          throw releaseError;
        },
        extend: async () => true,
      }),
    } as unknown as CacheLockStore;
    const locks = createLockManager({ store });

    const caught = await locks
      .withLock("k", async () => {
        throw new Error("REAL BUSINESS ERROR");
      }, { ttl: null })
      .catch((error: unknown) => error as Error & { suppressed?: unknown });

    expect(caught.message).toBe("REAL BUSINESS ERROR");
    expect(caught.suppressed).toBe(releaseError);
  });
});
