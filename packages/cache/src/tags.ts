/**
 * @zudojs/cache — Tags
 *
 * Tag-based cache invalidation registry. Maps tags to cache keys,
 * allowing bulk invalidation of related entries.
 *
 * Tags are scoped by namespace: the internal map key is the
 * `(namespace, tag)` pair, so the same tag registered under two namespaces
 * yields two independent sets. Without this, one tenant's
 * `invalidateByTag(["users"])` would delete another tenant's entries — the
 * keys are namespace-qualified, but a flat tag map would not be.
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
import { MAX_TAG_LENGTH } from "./constants.js";
import { CacheError } from "./errors.js";

/** Separates the namespace from the tag in the internal map key. */
const SCOPE_SEPARATOR = "\u0000";

/**
 * Composes the internal `(namespace, tag)` map key. A NUL byte cannot appear
 * in a validated tag, so the composition is unambiguous.
 */
function scopedTag(tag: CacheTag, options?: CacheTagOptions): string {
  return `${options?.namespace ?? ""}${SCOPE_SEPARATOR}${tag}`;
}

/**
 * Validates a tag. Tags are untrusted strings used as map keys, so they are
 * required to be non-empty, length-bounded, and free of the scope separator.
 */
export function assertValidTag(tag: CacheTag): void {
  if (typeof tag !== "string" || tag.length === 0) {
    throw new CacheError("Cache tag must be a non-empty string.", {
      code: "CACHE_OPERATION_FAILED",
      statusCode: 400,
      expose: true,
    });
  }
  if (tag.length > MAX_TAG_LENGTH || tag.includes(SCOPE_SEPARATOR)) {
    throw new CacheError(
      `Invalid cache tag: tags must be at most ${MAX_TAG_LENGTH} characters and must not contain NUL.`,
      { code: "CACHE_OPERATION_FAILED", statusCode: 400, expose: true },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* In-Memory Tag Store                                                        */
/* -------------------------------------------------------------------------- */

/**
 * In-memory implementation of `CacheTagStore`.
 *
 * Maintains a bidirectional mapping between scoped tags and cache keys.
 * For production use, this should be backed by a persistent store
 * (e.g., Redis SETs).
 */
export class InMemoryTagStore implements CacheTagStore {
  /** (namespace, tag) → Set of keys */
  private readonly tagToKeys = new Map<string, Set<CacheKey>>();

  /** Key → Set of (namespace, tag) */
  private readonly keyToTags = new Map<CacheKey, Set<string>>();

  /* ---- Add Tags ---- */

  async add(
    key: CacheKey,
    tags: readonly CacheTag[],
    options?: CacheTagOptions,
  ): Promise<void> {
    for (const tag of tags) assertValidTag(tag);
    for (const tag of tags) {
      const scoped = scopedTag(tag, options);
      if (!this.tagToKeys.has(scoped)) {
        this.tagToKeys.set(scoped, new Set());
      }
      this.tagToKeys.get(scoped)!.add(key);

      if (!this.keyToTags.has(key)) {
        this.keyToTags.set(key, new Set());
      }
      this.keyToTags.get(key)!.add(scoped);
    }
  }

  /* ---- Remove Tags ---- */

  async remove(
    key: CacheKey,
    tags: readonly CacheTag[],
    options?: CacheTagOptions,
  ): Promise<void> {
    for (const tag of tags) {
      const scoped = scopedTag(tag, options);
      const keys = this.tagToKeys.get(scoped);
      keys?.delete(key);
      if (keys && keys.size === 0) this.tagToKeys.delete(scoped);

      const owned = this.keyToTags.get(key);
      owned?.delete(scoped);
      if (owned && owned.size === 0) this.keyToTags.delete(key);
    }
  }

  /* ---- Get Keys by Tag ---- */

  async getKeys(
    tag: CacheTag,
    options?: CacheTagOptions,
  ): Promise<readonly CacheKey[]> {
    return [...(this.tagToKeys.get(scopedTag(tag, options)) ?? [])];
  }

  /* ---- Invalidate by Tag ---- */

  async invalidate(
    tag: CacheTag,
    options?: CacheTagOptions,
  ): Promise<CacheClearResult> {
    const scoped = scopedTag(tag, options);
    const keys = this.tagToKeys.get(scoped);

    if (!keys) {
      return { cleared: 0 };
    }

    const count = keys.size;

    // Remove reverse mappings, dropping keys that end up with no tags at
    // all — otherwise every key ever tagged would leak an empty Set for the
    // lifetime of the process and pollute `trackedKeys()`.
    for (const key of keys) {
      const remaining = this.keyToTags.get(key);
      remaining?.delete(scoped);
      if (remaining && remaining.size === 0) this.keyToTags.delete(key);
    }

    // Clear the tag
    this.tagToKeys.delete(scoped);

    return { cleared: count };
  }

  /* ---- Remove Key ---- */

  /** Removes all tag mappings for a key (e.g. after the key is deleted). */
  removeKey(key: CacheKey): void {
    const tags = this.keyToTags.get(key);
    if (!tags) return;
    for (const scoped of tags) {
      const keys = this.tagToKeys.get(scoped);
      keys?.delete(key);
      if (keys && keys.size === 0) this.tagToKeys.delete(scoped);
    }
    this.keyToTags.delete(key);
  }

  /* ---- Utility ---- */

  /** Returns all keys that currently have tag mappings. */
  trackedKeys(): readonly CacheKey[] {
    return [...this.keyToTags.keys()];
  }

  /** Returns all registered tags, optionally scoped to a namespace. */
  tags(options?: CacheTagOptions): readonly CacheTag[] {
    const prefix = `${options?.namespace ?? ""}${SCOPE_SEPARATOR}`;
    const result: CacheTag[] = [];
    for (const scoped of this.tagToKeys.keys()) {
      if (scoped.startsWith(prefix)) result.push(scoped.slice(prefix.length));
    }
    return result;
  }

  /** Returns the number of keys mapped to a tag. */
  count(tag: CacheTag, options?: CacheTagOptions): number {
    return this.tagToKeys.get(scopedTag(tag, options))?.size ?? 0;
  }

  /** Returns all tags for a given key, optionally scoped to a namespace. */
  tagsForKey(key: CacheKey, options?: CacheTagOptions): readonly CacheTag[] {
    const prefix = `${options?.namespace ?? ""}${SCOPE_SEPARATOR}`;
    const result: CacheTag[] = [];
    for (const scoped of this.keyToTags.get(key) ?? []) {
      if (scoped.startsWith(prefix)) result.push(scoped.slice(prefix.length));
    }
    return result;
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
