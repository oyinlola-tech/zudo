/**
 * @zudojs/cache — Tags Tests
 *
 * Tests for InMemoryTagStore: bidirectional tag↔key mapping,
 * add/remove/getKeys/invalidate operations.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryTagStore, createTagStore } from "../src/tags.js";

let tagStore: InMemoryTagStore;

beforeEach(() => {
  tagStore = createTagStore();
});

// ─── Add Tags ──────────────────────────────────────────────────────────────

describe("InMemoryTagStore — add", () => {
  it("adds tags to a key", async () => {
    await tagStore.add("user:1", ["profile", "auth"]);
    expect(await tagStore.getKeys("profile")).toContain("user:1");
    expect(await tagStore.getKeys("auth")).toContain("user:1");
  });

  it("adds multiple keys to a tag", async () => {
    await tagStore.add("user:1", ["profile"]);
    await tagStore.add("user:2", ["profile"]);
    const keys = await tagStore.getKeys("profile");
    expect(keys).toContain("user:1");
    expect(keys).toContain("user:2");
  });

  it("handles adding same tag twice", async () => {
    await tagStore.add("key", ["tag1"]);
    await tagStore.add("key", ["tag1"]);
    const keys = await tagStore.getKeys("tag1");
    expect(keys).toHaveLength(1);
  });
});

// ─── Remove Tags ───────────────────────────────────────────────────────────

describe("InMemoryTagStore — remove", () => {
  it("removes tags from a key", async () => {
    await tagStore.add("user:1", ["profile", "auth"]);
    await tagStore.remove("user:1", ["profile"]);
    expect(await tagStore.getKeys("profile")).not.toContain("user:1");
    expect(await tagStore.getKeys("auth")).toContain("user:1");
  });

  it("does nothing for non-existent key", async () => {
    await expect(tagStore.remove("missing", ["tag"])).resolves.not.toThrow();
  });
});

// ─── Get Keys by Tag ───────────────────────────────────────────────────────

describe("InMemoryTagStore — getKeys", () => {
  it("returns empty array for unknown tag", async () => {
    const keys = await tagStore.getKeys("unknown");
    expect(keys).toEqual([]);
  });

  it("returns all keys for a tag", async () => {
    await tagStore.add("k1", ["tag"]);
    await tagStore.add("k2", ["tag"]);
    await tagStore.add("k3", ["other"]);
    const keys = await tagStore.getKeys("tag");
    expect(keys).toHaveLength(2);
    expect(keys).toContain("k1");
    expect(keys).toContain("k2");
  });
});

// ─── Invalidate by Tag ─────────────────────────────────────────────────────

describe("InMemoryTagStore — invalidate", () => {
  it("invalidates all keys for a tag", async () => {
    await tagStore.add("k1", ["tag"]);
    await tagStore.add("k2", ["tag"]);
    const result = await tagStore.invalidate("tag");
    expect(result.cleared).toBe(2);
    expect(await tagStore.getKeys("tag")).toEqual([]);
  });

  it("returns cleared=0 for unknown tag", async () => {
    const result = await tagStore.invalidate("unknown");
    expect(result.cleared).toBe(0);
  });

  it("does not affect other tags", async () => {
    await tagStore.add("k1", ["tag1"]);
    await tagStore.add("k1", ["tag2"]);
    await tagStore.invalidate("tag1");
    expect(await tagStore.getKeys("tag2")).toContain("k1");
  });
});

// ─── Utility Methods ───────────────────────────────────────────────────────

describe("InMemoryTagStore — utility", () => {
  it("tags() returns all registered tags", async () => {
    await tagStore.add("k1", ["a", "b"]);
    await tagStore.add("k2", ["b", "c"]);
    expect(tagStore.tags()).toContain("a");
    expect(tagStore.tags()).toContain("b");
    expect(tagStore.tags()).toContain("c");
  });

  it("count() returns number of keys for a tag", async () => {
    await tagStore.add("k1", ["tag"]);
    await tagStore.add("k2", ["tag"]);
    expect(tagStore.count("tag")).toBe(2);
    expect(tagStore.count("unknown")).toBe(0);
  });

  it("tagsForKey() returns all tags for a key", async () => {
    await tagStore.add("k1", ["a", "b"]);
    const tags = tagStore.tagsForKey("k1");
    expect(tags).toContain("a");
    expect(tags).toContain("b");
  });

  it("clear() resets all mappings", async () => {
    await tagStore.add("k1", ["a"]);
    await tagStore.add("k2", ["b"]);
    tagStore.clear();
    expect(tagStore.tags()).toEqual([]);
    expect(await tagStore.getKeys("a")).toEqual([]);
  });
});

// ─── Factory ───────────────────────────────────────────────────────────────

describe("createTagStore", () => {
  it("creates an InMemoryTagStore", () => {
    const store = createTagStore();
    expect(store).toBeInstanceOf(InMemoryTagStore);
  });
});

// ─── Regression: removeKey / trackedKeys ───────────────────────────────────

describe("InMemoryTagStore — removeKey", () => {
  it("removes all tag mappings for a key", async () => {
    await tagStore.add("k1", ["a", "b"]);
    await tagStore.add("k2", ["a"]);
    tagStore.removeKey("k1");
    expect(await tagStore.getKeys("a")).toEqual(["k2"]);
    expect(await tagStore.getKeys("b")).toEqual([]);
    expect(tagStore.tagsForKey("k1")).toEqual([]);
    // Empty tags are pruned entirely
    expect(tagStore.tags()).toEqual(["a"]);
  });

  it("is a no-op for unknown keys", () => {
    expect(() => tagStore.removeKey("missing")).not.toThrow();
  });
});

describe("InMemoryTagStore — trackedKeys", () => {
  it("lists keys that currently have tag mappings", async () => {
    await tagStore.add("k1", ["a"]);
    await tagStore.add("k2", ["b"]);
    expect([...tagStore.trackedKeys()].sort()).toEqual(["k1", "k2"]);
  });
});

// ─── Regression: namespace-scoped tags ─────────────────────────────────────

describe("InMemoryTagStore — namespace scoping", () => {
  // Regression (CACHE-03): CacheTagOptions.namespace was named `_options`
  // and discarded, so tags lived in one flat global map and one tenant's
  // invalidateByTag deleted another tenant's entries.
  it("keeps the same tag independent across namespaces", async () => {
    await tagStore.add("zudojs:tenant-a:u1", ["users"], {
      namespace: "tenant-a",
    });
    await tagStore.add("zudojs:tenant-b:u1", ["users"], {
      namespace: "tenant-b",
    });

    expect(await tagStore.getKeys("users", { namespace: "tenant-a" })).toEqual([
      "zudojs:tenant-a:u1",
    ]);
    expect(await tagStore.getKeys("users", { namespace: "tenant-b" })).toEqual([
      "zudojs:tenant-b:u1",
    ]);
    // The un-namespaced scope is its own scope, not a superset.
    expect(await tagStore.getKeys("users")).toEqual([]);
  });

  it("invalidates only the requested namespace", async () => {
    await tagStore.add("a1", ["users"], { namespace: "tenant-a" });
    await tagStore.add("b1", ["users"], { namespace: "tenant-b" });

    const result = await tagStore.invalidate("users", {
      namespace: "tenant-a",
    });
    expect(result.cleared).toBe(1);
    expect(await tagStore.getKeys("users", { namespace: "tenant-b" })).toEqual([
      "b1",
    ]);
  });

  it("scopes remove(), count() and tagsForKey()", async () => {
    await tagStore.add("k", ["t"], { namespace: "a" });
    await tagStore.add("k", ["t"], { namespace: "b" });
    expect(tagStore.count("t", { namespace: "a" })).toBe(1);
    expect(tagStore.tagsForKey("k", { namespace: "b" })).toEqual(["t"]);

    await tagStore.remove("k", ["t"], { namespace: "a" });
    expect(tagStore.count("t", { namespace: "a" })).toBe(0);
    expect(tagStore.count("t", { namespace: "b" })).toBe(1);
  });

  it("lists tags per namespace", async () => {
    await tagStore.add("k", ["one"], { namespace: "a" });
    await tagStore.add("k", ["two"], { namespace: "b" });
    expect(tagStore.tags({ namespace: "a" })).toEqual(["one"]);
    expect(tagStore.tags({ namespace: "b" })).toEqual(["two"]);
  });
});

// ─── Regression: invalidate() does not leak reverse mappings ───────────────

describe("InMemoryTagStore — invalidate cleanup", () => {
  // Regression (CACHE-09): invalidate() removed the forward mapping but
  // left an empty keyToTags Set per key forever, so a long-running service
  // leaked one Map entry per distinct key ever tagged and trackedKeys()
  // reported keys with no tags at all.
  it("drops keys that end up with no tags", async () => {
    await tagStore.add("k1", ["users"]);
    await tagStore.add("k2", ["users"]);
    expect(tagStore.trackedKeys()).toHaveLength(2);

    await tagStore.invalidate("users");

    expect(tagStore.trackedKeys()).toEqual([]);
    expect(tagStore.tags()).toEqual([]);
  });

  it("keeps keys that still carry other tags", async () => {
    await tagStore.add("k1", ["users", "sessions"]);
    await tagStore.invalidate("users");
    expect(tagStore.trackedKeys()).toEqual(["k1"]);
    expect(tagStore.tagsForKey("k1")).toEqual(["sessions"]);
  });

  it("does not leak across repeated tag/invalidate cycles", async () => {
    for (let i = 0; i < 200; i++) {
      await tagStore.add(`key-${i}`, ["batch"]);
      await tagStore.invalidate("batch");
    }
    expect(tagStore.trackedKeys()).toEqual([]);
  });

  it("remove() drops a key once its last tag is gone", async () => {
    await tagStore.add("k", ["only"]);
    await tagStore.remove("k", ["only"]);
    expect(tagStore.trackedKeys()).toEqual([]);
  });
});

// ─── Regression: tag validation ────────────────────────────────────────────

describe("InMemoryTagStore — tag validation", () => {
  it("rejects empty and oversized tags", async () => {
    await expect(tagStore.add("k", [""])).rejects.toThrow();
    await expect(tagStore.add("k", ["t".repeat(200)])).rejects.toThrow();
  });

  it("rejects tags containing the scope separator", async () => {
    await expect(tagStore.add("k", ["a\u0000b"])).rejects.toThrow();
  });
});
