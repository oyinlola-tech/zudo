/**
 * @zudojs/cache — Invalidation Tests
 *
 * Tests for CacheInvalidationManager: tag-based, pattern-based,
 * namespace-based, key-based, and full flush invalidation.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { MemoryCacheAdapter, createMemoryCacheAdapter } from "../src/memory.js";
import { InMemoryTagStore, createTagStore } from "../src/tags.js";
import {
  CacheInvalidationManager,
  createInvalidationManager,
} from "../src/invalidation.js";

let adapter: MemoryCacheAdapter;
let tagStore: InMemoryTagStore;
let invalidation: CacheInvalidationManager;

beforeEach(() => {
  adapter = createMemoryCacheAdapter();
  tagStore = createTagStore();
  invalidation = createInvalidationManager({ adapter, tagStore });
});

// ─── Tag Invalidation ──────────────────────────────────────────────────────

describe("CacheInvalidationManager — invalidateByTag", () => {
  it("invalidates entries by tag", async () => {
    await adapter.set("user:1", "alice", { tags: ["user"] });
    await adapter.set("user:2", "bob", { tags: ["user"] });
    await tagStore.add("user:1", ["user"]);
    await tagStore.add("user:2", ["user"]);

    const result = await invalidation.invalidateByTag(["user"]);
    expect(result.cleared).toBe(2);
    expect((await adapter.get("user:1")).hit).toBe(false);
    expect((await adapter.get("user:2")).hit).toBe(false);
  });

  it("does not affect entries with other tags", async () => {
    await adapter.set("user:1", "alice", { tags: ["user"] });
    await adapter.set("post:1", "hello", { tags: ["post"] });
    await tagStore.add("user:1", ["user"]);
    await tagStore.add("post:1", ["post"]);

    await invalidation.invalidateByTag(["user"]);
    expect((await adapter.get("user:1")).hit).toBe(false);
    expect((await adapter.get("post:1")).hit).toBe(true);
  });

  it("handles multiple tags", async () => {
    await adapter.set("k1", "v1", { tags: ["tag1"] });
    await adapter.set("k2", "v2", { tags: ["tag2"] });
    await tagStore.add("k1", ["tag1"]);
    await tagStore.add("k2", ["tag2"]);

    const result = await invalidation.invalidateByTag(["tag1", "tag2"]);
    expect(result.cleared).toBe(2);
  });

  it("returns cleared=0 for unknown tag", async () => {
    const result = await invalidation.invalidateByTag(["unknown"]);
    expect(result.cleared).toBe(0);
  });

  // Regression: keys shared across tags are counted once, and dead keys
  // (already gone from the cache) are not counted at all.
  it("de-duplicates keys across tags and counts real deletions", async () => {
    await adapter.set("shared", "v");
    await tagStore.add("shared", ["a", "b"]);
    await tagStore.add("dead", ["a"]); // never written to the adapter
    const result = await invalidation.invalidateByTag(["a", "b"]);
    expect(result.cleared).toBe(1);
  });

  // Regression: when the "adapter" is an instrumented store, tag
  // invalidation flows through its metrics.
  it("routes deletions through the given store", async () => {
    const { createCacheStore } = await import("../src/store.js");
    const { createCacheMetrics } = await import("../src/metrics.js");
    const metrics = createCacheMetrics();
    const store = createCacheStore({ adapter, metrics });
    const mgr = createInvalidationManager({ adapter: store, tagStore });
    await adapter.set("k1", "v");
    await tagStore.add("k1", ["t"]);
    await mgr.invalidateByTag(["t"]);
    expect(metrics.getStats().deletes).toBe(1);
  });
});

// ─── Pattern Invalidation ──────────────────────────────────────────────────

describe("CacheInvalidationManager — invalidateByPattern", () => {
  it("invalidates entries matching pattern", async () => {
    await adapter.set("user:1", "alice");
    await adapter.set("user:2", "bob");
    await adapter.set("post:1", "hello");

    const result = await invalidation.invalidateByPattern("user:*");
    expect(result.cleared).toBe(2);
    expect((await adapter.get("user:1")).hit).toBe(false);
    expect((await adapter.get("post:1")).hit).toBe(true);
  });

  it("returns cleared=0 for no matches", async () => {
    await adapter.set("a", 1);
    const result = await invalidation.invalidateByPattern("z:*");
    expect(result.cleared).toBe(0);
  });
});

// ─── Namespace Invalidation ────────────────────────────────────────────────

describe("CacheInvalidationManager — invalidateByNamespace", () => {
  // Regression: namespace invalidation must be scoped to the namespace
  // (translated into a key pattern), never wipe the whole cache.
  it("invalidates only entries in the namespace", async () => {
    await adapter.set("ns:item1", "a");
    await adapter.set("ns:item2", "b");
    await adapter.set("other:item1", "c");

    const result = await invalidation.invalidateByNamespace("ns");
    expect(result.cleared).toBe(2);
    expect((await adapter.get("ns:item1")).hit).toBe(false);
    expect((await adapter.get("other:item1")).hit).toBe(true);
  });

  it("uses the key builder to qualify the namespace pattern", async () => {
    const { createKeyBuilder } = await import("../src/key-builder.js");
    const mgr = createInvalidationManager({
      adapter,
      tagStore,
      keyBuilder: createKeyBuilder({ prefix: "app" }),
    });
    await adapter.set("app:ns:item1", "a");
    await adapter.set("app:other:item1", "b");
    const result = await mgr.invalidateByNamespace("ns");
    expect(result.cleared).toBe(1);
    expect((await adapter.get("app:other:item1")).hit).toBe(true);
  });
});

// ─── Direct Key Invalidation ───────────────────────────────────────────────

describe("CacheInvalidationManager — invalidateKey", () => {
  it("invalidates a specific key", async () => {
    await adapter.set("key", "value");
    const result = await invalidation.invalidateKey("key");
    expect(result.deleted).toBe(true);
    expect((await adapter.get("key")).hit).toBe(false);
  });

  it("returns deleted=false for missing key", async () => {
    const result = await invalidation.invalidateKey("missing");
    expect(result.deleted).toBe(false);
  });
});

// ─── Bulk Invalidation ─────────────────────────────────────────────────────

describe("CacheInvalidationManager — invalidateKeys", () => {
  it("invalidates multiple keys", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await adapter.set("c", 3);

    const result = await invalidation.invalidateKeys(["a", "c", "missing"]);
    expect(result.deleted).toBe(2);
    expect(result.keys).toContain("a");
    expect(result.keys).toContain("c");
    expect(result.keys).not.toContain("missing");
  });
});

// ─── Full Flush ────────────────────────────────────────────────────────────

describe("CacheInvalidationManager — flushAll", () => {
  it("clears all entries and resets tags", async () => {
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await tagStore.add("a", ["tag"]);

    const result = await invalidation.flushAll();
    expect(result.cleared).toBe(2);
    expect((await adapter.get("a")).hit).toBe(false);
    expect(tagStore.tags()).toEqual([]);
  });
});

// ─── Factory ───────────────────────────────────────────────────────────────

describe("createInvalidationManager", () => {
  it("creates a CacheInvalidationManager", () => {
    const mgr = createInvalidationManager({ adapter, tagStore });
    expect(mgr).toBeInstanceOf(CacheInvalidationManager);
  });
});
