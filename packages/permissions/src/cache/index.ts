/**
 * Permission decision caching.
 *
 * @module cache
 */

export {
  createMemoryPermissionCache,
  permissionCacheKey,
  type MemoryPermissionCacheOptions,
} from "./cache.core.js";
export {
  actorCacheDigest,
  MAX_ACTOR_DIGEST_LENGTH,
} from "./cache.actorDigest.js";
