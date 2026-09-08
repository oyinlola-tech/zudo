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
