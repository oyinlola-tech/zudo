import type { CacheNamespace } from "./types-keys.js";
import type { CacheTTL } from "./types-values.js";
import type { CacheMiddleware } from "./types-metrics.js";
import type { CacheSerializer } from "./types-health.js";
import type { CacheLockStore } from "./types-lock.js";

export interface CacheConfig {
  readonly enabled?: boolean;
  readonly defaultTtl?: CacheTTL;
  readonly namespace?: CacheNamespace;
  readonly prefix?: string;
  readonly separator?: string;
  /**
   * When true, adapter failures are swallowed and a neutral result is
   * returned instead of throwing, for every fallible operation:
   * `get`/`has` report a miss, `set`/`delete` report a no-op,
   * `clear`/`invalidateByTag`/`invalidateByPattern` report `cleared: 0`,
   * `ttl` returns `undefined` and `expire` returns `false`.
   *
   * Two deliberate exclusions:
   * - Key/pattern/TTL **validation** errors always throw. A malformed key is
   *   programmer error, not an adapter fault, and silently ignoring it would
   *   hide a bug rather than degrade gracefully.
   * - `withLock` always throws when the lock cannot be acquired or its lease
   *   is lost. Running a critical section without mutual exclusion is never
   *   a safe degradation.
   */
  readonly failSilently?: boolean;
  readonly collectStats?: boolean;
  /**
   * Optional serializer applied by CacheService: values are serialized on
   * set and deserialized on get, so cached values are structural copies.
   * When omitted, values are stored by reference (memory adapter).
   */
  readonly serializer?: CacheSerializer;
  /**
   * Middlewares wrapping every adapter operation, applied in order (the
   * first entry is outermost). Used for tracing, circuit-breaking,
   * per-operation timeouts, and similar cross-cutting concerns.
   */
  readonly middlewares?: readonly CacheMiddleware[];
  /**
   * Lock store backing `withLock`. Defaults to a fresh in-process store per
   * service. Pass a shared store (e.g. the exported `defaultLockStore`, or a
   * Redis-backed implementation) to share locks across service instances or
   * processes.
   */
  readonly lockStore?: CacheLockStore;
}

/**
 * Error codes set by errors this package constructs directly. Every member
 * is produced by some code path in `@zudojs/cache`.
 *
 * NOTE: errors created by the re-exported `@zudojs/errors` cache factories
 * (`cacheConnectionError`, `cacheInvalidKeyError`, …) carry that package's
 * generic `ErrorCode` values, not these.
 */
export type CacheErrorCode =
  | "CACHE_DISABLED"
  | "CACHE_OPERATION_FAILED"
  | "CACHE_INVALID_TTL"
  | "CACHE_MIDDLEWARE_RESULT_MISSING"
  | "CACHE_LOCK_UNAVAILABLE"
  | "CACHE_LOCK_ACQUIRE_FAILED"
  | "CACHE_LOCK_LOST";
