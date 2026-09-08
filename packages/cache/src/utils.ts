/**
 * @zudojs/cache — Internal Utilities
 *
 * Shared helpers: glob→RegExp conversion, sequential delete-many fallback,
 * and TTL validation.
 */

import type {
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheKey,
  CacheTTL,
} from "./types.js";
import { MAX_TTL_MS, MIN_TTL_MS } from "./constants.js";
import { CacheError } from "./errors.js";

/**
 * Converts a glob pattern (`*` matches any run of characters, `?` matches
 * a single character) into an anchored regular expression.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
  return new RegExp(`^${regexStr}$`);
}

/**
 * Deletes many keys by calling a single-key delete function sequentially.
 * Shared fallback used by the memory adapter, the store, and the
 * invalidation manager.
 */
export async function deleteManyViaDelete(
  keys: readonly CacheKey[],
  deleteOne: (key: CacheKey) => Promise<CacheDeleteResult>,
): Promise<CacheDeleteManyResult> {
  let deleted = 0;
  const deletedKeys: CacheKey[] = [];
  for (const key of keys) {
    const result = await deleteOne(key);
    if (result.deleted) {
      deleted++;
      deletedKeys.push(key);
    }
  }
  return { deleted, keys: deletedKeys };
}

/**
 * Validates a TTL value. `null` means "never expires" and `undefined`
 * means "use the default"; both are valid. Finite numbers must be within
 * [MIN_TTL_MS, MAX_TTL_MS]. Throws a CacheError with the
 * `CACHE_INVALID_TTL` code otherwise.
 */
export function assertValidTtl(ttl: CacheTTL | undefined): void {
  if (ttl === null || ttl === undefined) return;
  if (!Number.isFinite(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
    throw new CacheError(
      `Invalid cache TTL: ${ttl}. TTL must be between ${MIN_TTL_MS} and ${MAX_TTL_MS} ms, or null for no expiry.`,
      {
        statusCode: 400,
        expose: true,
        metadata: { errorCode: "CACHE_INVALID_TTL", ttl },
      },
    );
  }
}
