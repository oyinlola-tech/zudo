/**
 * @zudojs/database — Database Cache
 *
 * In-memory LRU cache for database read results.
 */

export {
  MemoryDatabaseCache,
  createDatabaseCache,
  createCacheKey,
  escapeCachePart,
  serializeCachePart,
  getOrSet,
  invalidateByPrefix,
  CACHE_KEY_SEPARATOR,
  type CacheEntry,
  type CacheOptions,
  type MemoryCacheOptions,
  type CacheStats,
  type DatabaseCache,
} from "./cache.memory.js";
