/**
 * @zudojs/cache
 *
 * Cache abstraction layer with memory adapter, tag-based
 * invalidation, in-process locking, events, middleware, and metrics.
 *
 * @example
 * ```ts
 * import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
 *
 * const cache = createCacheService({
 *   adapter: createMemoryCacheAdapter(),
 *   config: { defaultTtl: 60_000 },
 * });
 *
 * // Key parts must not contain the separator, so use "." inside a key.
 * await cache.set("user.123", { name: "Alice" }, { tags: ["users"] });
 * const { hit, value } = await cache.get<{ name: string }>("user.123");
 * ```
 */

// Types
export type {
  CacheKey,
  CacheNamespace,
  CacheKeyOptions,
  CacheTTL,
  CacheExpiration,
  CacheSetOptions,
  CacheClearOptions,
  CacheKeysOptions,
  CacheSetManyOptions,
  CacheEntry,
  CacheGetResult,
  CacheSetResult,
  CacheDeleteResult,
  CacheDeleteManyResult,
  CacheClearResult,
  CacheStats,
  CacheAdapter,
  CacheStore,
  CacheConfig,
  CacheEventType,
  CacheTag,
  CacheTagOptions,
  CacheTagStore,
  CacheLockOptions,
  CacheLock,
  CacheLockStore,
  CacheHealth,
  CacheHealthChecker,
  CacheSerializer,
  CacheMetrics,
  CacheMiddlewareContext,
  CacheMiddleware,
  CacheSerializationOptions,
  CacheErrorCode,
  CacheOrComputeOptions,
  CacheOrComputeResult,
  CacheBatchOperation,
  CacheBatchResult,
  MaybePromise,
} from "./types.js";

export type {
  BaseCacheEvent,
  CacheHitEvent,
  CacheMissEvent,
  CacheSetEvent,
  CacheDeleteEvent,
  CacheClearEvent,
  CacheErrorEvent,
  CacheEvent,
  CacheEventHandler,
  CacheEventSubscription,
} from "./types-events.js";

export type { CacheKeyBuilder } from "./types-keys.js";

// Constants
export {
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  MIN_TTL_MS,
  DEFAULT_SEPARATOR,
  DEFAULT_PREFIX,
  MAX_KEY_LENGTH,
  CACHE_KEY_PATTERN,
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_LOCK_RETRY_ATTEMPTS,
  DEFAULT_LOCK_RETRY_DELAY_MS,
  MAX_LATENCY_SAMPLES,
  MAX_TRACKED_KEYS,
  LATENCY_BUCKETS,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_MEMORY_BYTES,
  EXPIRED_PURGE_INTERVAL_MS,
  CACHE_PATTERN_PART_PATTERN,
  MAX_TAG_LENGTH,
} from "./constants.js";

// Errors (re-exported from @zudojs/errors)
export {
  CacheError,
  isCacheError,
  cacheConnectionError,
  cacheTimeoutError,
  cacheSerializationError,
  cacheDeserializationError,
  cacheInvalidKeyError,
  cacheAdapterNotConfiguredError,
  CacheOperation,
} from "./errors.js";

export type { CacheErrorOptions } from "./errors.js";

// Serializer
export {
  JsonCacheSerializer,
  RawCacheSerializer,
  defaultSerializer,
  rawSerializer,
  stripUnsafeKeys,
} from "./serializer.js";

// Key Builder
export {
  DefaultKeyBuilder,
  createKeyBuilder,
  defaultKeyBuilder,
} from "./key-builder.js";

// Store
export { DefaultCacheStore, createCacheStore } from "./store.js";

// Memory Adapter
export {
  MemoryCacheAdapter,
  createMemoryCacheAdapter,
  estimateValueBytes,
} from "./memory.js";

// Tags
export { InMemoryTagStore, createTagStore, assertValidTag } from "./tags.js";

// Invalidation
export {
  CacheInvalidationManager,
  createInvalidationManager,
} from "./invalidation.js";

// Lock
export {
  InMemoryLockStore,
  CacheLockManager,
  createLockManager,
  defaultLockStore,
} from "./lock.js";

// Metrics
export { InMemoryCacheMetrics, createCacheMetrics } from "./metrics.js";

// Cache Service
export { CacheService, createCacheService } from "./cache.js";
