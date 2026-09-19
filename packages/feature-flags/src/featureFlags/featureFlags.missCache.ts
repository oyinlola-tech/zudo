/**
 * Negative cache for flag keys the provider does not know.
 *
 * @module featureFlags/featureFlags.missCache
 */

/** Default lifetime of a remembered miss. */
export const DEFAULT_MISSING_FLAG_TTL_MS = 30_000;

/** Most distinct missing keys remembered at once. */
export const MAX_MISSING_FLAGS = 1_000;

/** Remembers recent "no such flag" answers. */
export interface MissCache {
  has(key: string): boolean;
  add(key: string): void;
  clear(): void;
}

/**
 * Create a bounded, expiring miss cache.
 *
 * A registry miss used to go to `provider.get(key)` on every evaluation. When
 * keys can come from request data (a `?flag=` switch, a client snapshot
 * request), each distinct key was a remote round trip, every time. A miss is
 * now remembered for `ttlMs`, up to {@link MAX_MISSING_FLAGS} keys (oldest
 * evicted). `ttlMs <= 0` disables it.
 */
export function createMissCache(ttlMs: number): MissCache {
  const misses = new Map<string, number>();

  return {
    has(key) {
      const expiresAt = misses.get(key);
      if (expiresAt === undefined) return false;
      if (Date.now() > expiresAt) {
        misses.delete(key);
        return false;
      }
      return true;
    },

    add(key) {
      if (ttlMs <= 0) return;
      misses.delete(key);
      misses.set(key, Date.now() + ttlMs);
      while (misses.size > MAX_MISSING_FLAGS) {
        const oldest = misses.keys().next();
        if (oldest.done === true) break;
        misses.delete(oldest.value);
      }
    },

    clear() {
      misses.clear();
    },
  };
}
