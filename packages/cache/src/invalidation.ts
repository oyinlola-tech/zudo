/**
 * @zudojs/cache — Invalidation
 *
 * Coordinates cache invalidation across tags, patterns, and keys.
 * Works with both the tag store and the cache adapter to ensure
 * consistent invalidation.
 *
 * The adapter passed in may be an instrumented `CacheStore` (as done by
 * `CacheService`), in which case deletions flow through metrics/events.
 * Adapters operate on fully-qualified keys and glob patterns only;
 * namespace scoping is translated into patterns via the key builder.
 */

import type {
  CacheAdapter,
  CacheClearResult,
  CacheKey,
  CacheNamespace,
  CacheTag,
  CacheTagStore,
} from "./types.js";
import type { CacheKeyBuilder } from "./types-keys.js";
import { DEFAULT_SEPARATOR } from "./constants.js";
import { deleteManyViaDelete } from "./utils.js";

/* -------------------------------------------------------------------------- */
/* Invalidation Manager                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Coordinates cache invalidation across multiple strategies:
 * - Tag-based invalidation
 * - Pattern-based invalidation
 * - Direct key invalidation
 */
export class CacheInvalidationManager {
  private readonly adapter: CacheAdapter;
  private readonly tagStore: CacheTagStore;
  private readonly keyBuilder?: CacheKeyBuilder;

  constructor(options: {
    readonly adapter: CacheAdapter;
    readonly tagStore: CacheTagStore;
    /** Used to translate namespaces into fully-qualified key patterns. */
    readonly keyBuilder?: CacheKeyBuilder;
  }) {
    this.adapter = options.adapter;
    this.tagStore = options.tagStore;
    this.keyBuilder = options.keyBuilder;
  }

  /* ---- Tag Invalidation ---- */

  /**
   * Invalidates all cache entries associated with the given tags.
   * Keys are de-duplicated across tags and only actual successful
   * deletions are counted; keys that already expired or were evicted
   * (dead tag mappings) are tolerated and simply skipped.
   */
  async invalidateByTag(tags: readonly CacheTag[]): Promise<CacheClearResult> {
    const keys = new Set<CacheKey>();
    for (const tag of tags) {
      for (const key of await this.tagStore.getKeys(tag)) keys.add(key);
    }

    let cleared = 0;
    for (const key of keys) {
      const result = await this.adapter.delete(key);
      if (result.deleted) cleared++;
    }

    for (const tag of tags) {
      await this.tagStore.invalidate(tag);
    }

    return { cleared };
  }

  /* ---- Pattern Invalidation ---- */

  /**
   * Invalidates all cache entries matching the given glob pattern.
   * The pattern is matched against fully-qualified keys as-is; use
   * `CacheService.invalidateByPattern` for prefix/namespace-aware patterns.
   */
  async invalidateByPattern(pattern: string): Promise<CacheClearResult> {
    return this.adapter.clear({ pattern });
  }

  /* ---- Namespace Invalidation ---- */

  /**
   * Invalidates all cache entries in the given namespace by building a
   * key pattern (`prefix:namespace:*`) instead of wiping the whole cache.
   */
  async invalidateByNamespace(
    namespace: CacheNamespace,
  ): Promise<CacheClearResult> {
    const pattern =
      this.keyBuilder?.buildPattern?.("*", { namespace }) ??
      `${namespace}${DEFAULT_SEPARATOR}*`;
    return this.adapter.clear({ pattern });
  }

  /* ---- Direct Key Invalidation ---- */

  /**
   * Invalidates a specific cache key.
   */
  async invalidateKey(key: CacheKey): Promise<{ readonly deleted: boolean }> {
    const result = await this.adapter.delete(key);
    return { deleted: result.deleted };
  }

  /* ---- Bulk Invalidation ---- */

  /**
   * Invalidates multiple cache keys at once.
   */
  async invalidateKeys(keys: readonly CacheKey[]): Promise<{
    readonly deleted: number;
    readonly keys: readonly CacheKey[];
  }> {
    return deleteManyViaDelete(keys, (key) => this.adapter.delete(key));
  }

  /* ---- Full Flush ---- */

  /**
   * Clears all entries in the cache adapter and resets the tag store.
   */
  async flushAll(): Promise<CacheClearResult> {
    const result = await this.adapter.clear();
    this.tagStore.clear?.();
    return result;
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates a cache invalidation manager.
 */
export function createInvalidationManager(options: {
  readonly adapter: CacheAdapter;
  readonly tagStore: CacheTagStore;
  readonly keyBuilder?: CacheKeyBuilder;
}): CacheInvalidationManager {
  return new CacheInvalidationManager(options);
}
