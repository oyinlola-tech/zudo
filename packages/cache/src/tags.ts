/**
 * @zudojs/cache — Tags
 *
 * Tag-based cache invalidation registry. Maps tags to cache keys,
 * allowing bulk invalidation of related entries.
 *
 * NOTE: The tag store is not notified when entries expire or are evicted
 * by the adapter, so cleanup of stale mappings is lazy — dead keys linger
 * until `invalidateByTag`/`removeKey`/`clear` touches them, and
 * invalidation tolerates keys that no longer exist in the cache.
 */

import type {
  CacheClearResult,
  CacheKey,
  CacheTag,
  CacheTagOptions,
  CacheTagStore,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* In-Memory Tag Store                                                        */
/* -------------------------------------------------------------------------- */

/**
 * In-memory implementation of `CacheTagStore`.
 *
 * Maintains a bidirectional mapping between tags and cache keys.
 * For production use, this should be backed by a persistent store
 * (e.g., Redis SETs).
 */
export class InMemoryTagStore implements CacheTagStore {
  /** Tag → Set of keys */
  private readonly tagToKeys = new Map<CacheTag, Set<CacheKey>>();

  /** Key → Set of tags */
  private readonly keyToTags = new Map<CacheKey, Set<CacheTag>>();

  /* ---- Add Tags ---- */

  async add(
    key: CacheKey,
    tags: readonly CacheTag[],
    _options?: CacheTagOptions,
  ): Promise<void> {
    for (const tag of tags) {
      if (!this.tagToKeys.has(tag)) {
        this.tagToKeys.set(tag, new Set());
      }
      this.tagToKeys.get(tag)!.add(key);
    }

    if (!this.keyToTags.has(key)) {
      this.keyToTags.set(key, new Set());
    }
    for (const tag of tags) {
      this.keyToTags.get(key)!.add(tag);
    }
  }

  /* ---- Remove Tags ---- */

  async remove(
    key: CacheKey,
    tags: readonly CacheTag[],
    _options?: CacheTagOptions,
  ): Promise<void> {
    for (const tag of tags) {
      this.tagToKeys.get(tag)?.delete(key);
    }

    for (const tag of tags) {
      this.keyToTags.get(key)?.delete(tag);
    }
  }

  /* ---- Get Keys by Tag ---- */

  async getKeys(
    tag: CacheTag,
    _options?: CacheTagOptions,
  ): Promise<readonly CacheKey[]> {
    return [...(this.tagToKeys.get(tag) ?? [])];
  }

  /* ---- Invalidate by Tag ---- */

  async invalidate(
    tag: CacheTag,
    _options?: CacheTagOptions,
  ): Promise<CacheClearResult> {
    const keys = this.tagToKeys.get(tag);

    if (!keys) {
      return { cleared: 0 };
    }

    const count = keys.size;

    // Remove reverse mappings
    for (const key of keys) {
      this.keyToTags.get(key)?.delete(tag);
    }

    // Clear the tag
    this.tagToKeys.delete(tag);

    return { cleared: count };
  }

  /* ---- Remove Key ---- */

  /** Removes all tag mappings for a key (e.g. after the key is deleted). */
  removeKey(key: CacheKey): void {
    const tags = this.keyToTags.get(key);
    if (!tags) return;
    for (const tag of tags) {
      const keys = this.tagToKeys.get(tag);
      keys?.delete(key);
      if (keys && keys.size === 0) this.tagToKeys.delete(tag);
    }
    this.keyToTags.delete(key);
  }

  /* ---- Utility ---- */

  /** Returns all keys that currently have tag mappings. */
  trackedKeys(): readonly CacheKey[] {
    return [...this.keyToTags.keys()];
  }

  /** Returns all registered tags. */
  tags(): readonly CacheTag[] {
    return [...this.tagToKeys.keys()];
  }

  /** Returns the number of keys mapped to a tag. */
  count(tag: CacheTag): number {
    return this.tagToKeys.get(tag)?.size ?? 0;
  }

  /** Returns all tags for a given key. */
  tagsForKey(key: CacheKey): readonly CacheTag[] {
    return [...(this.keyToTags.get(key) ?? [])];
  }

  /** Clears all tag mappings. */
  clear(): void {
    this.tagToKeys.clear();
    this.keyToTags.clear();
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates an in-memory tag store.
 */
export function createTagStore(): InMemoryTagStore {
  return new InMemoryTagStore();
}
