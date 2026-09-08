/**
 * In-memory permission cache implementation.
 *
 * @module cache/cache
 */

import type {
  PermissionCache,
  PermissionDecision,
} from "../permissionTypes/index.js";

/** Cache entry with optional TTL. */
interface CacheEntry {
  readonly value: PermissionDecision;
  readonly expiresAt?: number;
}

/** Separates the actor id from the rest of the key. */
const KEY_DELIMITER = "|";

/** Prefix identifying an actor's cache entries. */
function actorPrefix(actorId: string): string {
  return `actor:${actorId}${KEY_DELIMITER}`;
}

/**
 * Generate a cache key for a permission check.
 *
 * The actor id is delimited, so invalidating actor `1` cannot also clear
 * actors `10` and `123`.
 */
export function permissionCacheKey(
  actorId: string,
  permission: string,
  resourceId?: string,
): string {
  const base = `${actorPrefix(actorId)}${permission}`;
  return resourceId ? `${base}${KEY_DELIMITER}${resourceId}` : base;
}

/** Options for {@link createMemoryPermissionCache}. */
export interface MemoryPermissionCacheOptions {
  /** Default TTL in milliseconds. Defaults to 60,000 (1 minute). */
  readonly defaultTtlMs?: number;
  /**
   * Maximum entries held. The oldest are evicted past it. Default: 10,000.
   *
   * Keys carry actor and resource ids, so an unbounded cache grows with
   * traffic — and this one holds authorization decisions, which is the last
   * place to want unbounded retention.
   */
  readonly maxEntries?: number;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Create an in-memory permission cache.
 *
 * A TTL of `0` or less means "do not cache", not "cache forever" — the
 * inverse is a decision that outlives the grant that produced it.
 */
export function createMemoryPermissionCache(
  optionsOrTtl: MemoryPermissionCacheOptions | number = {},
): PermissionCache & { size(): number } {
  const options: MemoryPermissionCacheOptions =
    typeof optionsOrTtl === "number"
      ? { defaultTtlMs: optionsOrTtl }
      : optionsOrTtl;

  const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const store = new Map<string, CacheEntry>();

  function evictIfNeeded(): void {
    if (store.size <= maxEntries) return;
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        store.delete(key);
      }
    }
    // Map iterates in insertion order, so the head is the oldest entry.
    while (store.size > maxEntries) {
      const oldest = store.keys().next();
      if (oldest.done === true) break;
      store.delete(oldest.value);
    }
  }

  return {
    async get(key: string): Promise<PermissionDecision | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    async set(
      key: string,
      value: PermissionDecision,
      setOptions?: { readonly ttl?: number },
    ): Promise<void> {
      const ttl = setOptions?.ttl ?? defaultTtlMs;
      if (ttl <= 0) {
        store.delete(key);
        return;
      }
      store.delete(key);
      store.set(key, { value, expiresAt: Date.now() + ttl });
      evictIfNeeded();
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    async invalidateActor(actorId: string): Promise<void> {
      const prefix = actorPrefix(actorId);
      for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },

    async clear(): Promise<void> {
      store.clear();
    },

    size(): number {
      return store.size;
    },
  };
}
