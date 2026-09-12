/**
 * @zudojs/cache — Cache Service
 * High-level cache service combining adapter, key builder, tags,
 * invalidation, locking, metrics, middleware, events, and an optional
 * serializer.
 *
 * Serialization: when `config.serializer` is provided, values are
 * serialized on set and deserialized on get, so cached values are
 * structural copies. Without a serializer the memory adapter stores
 * values by reference — mutations of a cached object are visible to
 * later readers.
 *
 * Scoping: keys, tags and locks are all namespace-scoped. A namespace is
 * validated as an identity part everywhere it is used (including in glob
 * patterns), so it can never widen an operation beyond its own tenant.
 */

import type {
  CacheAdapter,
  CacheBatchOperation,
  CacheBatchResult,
  CacheConfig,
  CacheDeleteResult,
  CacheEntry,
  CacheEvent,
  CacheEventHandler,
  CacheEventSubscription,
  CacheGetResult,
  CacheHealth,
  CacheHealthChecker,
  CacheNamespace,
  CacheOperation,
  CacheOrComputeOptions,
  CacheOrComputeResult,
  CacheSerializer,
  CacheSetResult,
  CacheStats,
  CacheTag,
  CacheTTL,
} from "./types.js";
import type { CacheErrorCode } from "./types-config.js";
import type { CacheKeyBuilder } from "./types-keys.js";
import {
  DEFAULT_LOCK_RETRY_DELAY_MS,
  DEFAULT_SEPARATOR,
  DEFAULT_TTL_MS,
} from "./constants.js";
import { DefaultKeyBuilder } from "./key-builder.js";
import { createCacheStore, DefaultCacheStore } from "./store.js";
import { assertValidTag, createTagStore, InMemoryTagStore } from "./tags.js";
import {
  CacheInvalidationManager,
  createInvalidationManager,
} from "./invalidation.js";
import { CacheLockManager, createLockManager } from "./lock.js";
import { createCacheMetrics, InMemoryCacheMetrics } from "./metrics.js";
import {
  CacheError,
  cacheDeserializationError,
  cacheSerializationError,
  isCacheError,
} from "./errors.js";
import { createGlobMatcher } from "./utils.js";

/** Options accepted by every namespace-scoped read operation. */
interface NamespaceOptions {
  readonly namespace?: CacheNamespace;
}

export class CacheService implements CacheHealthChecker {
  private readonly store: DefaultCacheStore;
  private readonly keyBuilder: CacheKeyBuilder;
  private readonly tagStore: InMemoryTagStore;
  private readonly invalidation: CacheInvalidationManager;
  private readonly lockManager: CacheLockManager;
  private readonly metrics: InMemoryCacheMetrics | null;
  private readonly serializer: CacheSerializer | null;
  private readonly defaultTtl: CacheTTL;
  private readonly enabled: boolean;
  private readonly failSilently: boolean;
  /** Namespace configured for this service; the default scope for keys, tags and locks. */
  private readonly namespace: CacheNamespace | undefined;
  private readonly separator: string;
  /** In-flight getOrSet computations, keyed by full key (stampede protection). */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: {
    readonly adapter: CacheAdapter;
    readonly config?: CacheConfig;
    readonly keyBuilder?: CacheKeyBuilder;
  }) {
    this.enabled = options.config?.enabled ?? true;
    this.failSilently = options.config?.failSilently ?? false;
    this.defaultTtl =
      options.config?.defaultTtl !== undefined
        ? options.config.defaultTtl
        : DEFAULT_TTL_MS;
    this.serializer = options.config?.serializer ?? null;
    this.namespace = options.config?.namespace;
    this.separator = options.config?.separator ?? DEFAULT_SEPARATOR;
    this.metrics =
      options.config?.collectStats !== false ? createCacheMetrics() : null;
    this.store = createCacheStore({
      adapter: options.adapter,
      ...(this.metrics ? { metrics: this.metrics } : {}),
      ...(options.config?.middlewares
        ? { middlewares: options.config.middlewares }
        : {}),
    });
    this.keyBuilder =
      options.keyBuilder ??
      new DefaultKeyBuilder({
        ...(options.config?.prefix !== undefined
          ? { prefix: options.config.prefix }
          : {}),
        ...(options.config?.separator !== undefined
          ? { separator: options.config.separator }
          : {}),
        ...(options.config?.namespace !== undefined
          ? { namespace: options.config.namespace }
          : {}),
      });
    this.tagStore = createTagStore();
    // Route invalidation through the instrumented store so metrics and
    // events fire for invalidation-driven deletions too.
    this.invalidation = createInvalidationManager({
      adapter: this.store,
      tagStore: this.tagStore,
      keyBuilder: this.keyBuilder,
    });
    this.lockManager = createLockManager(
      options.config?.lockStore ? { store: options.config.lockStore } : {},
    );
  }

  async get<TValue = unknown>(
    key: string,
    options?: NamespaceOptions,
  ): Promise<CacheGetResult<TValue>> {
    if (!this.enabled) return { hit: false, value: null };
    const fullKey = this.keyBuilder.build(key, options);
    try {
      const result = await this.store.get<TValue>(fullKey);
      if (!result.hit || !this.serializer) return result;
      const value = this.deserialize(result.value) as TValue;
      return {
        ...result,
        value,
        ...(result.entry
          ? { entry: { ...result.entry, value } as CacheEntry<TValue> }
          : {}),
      };
    } catch (error) {
      if (this.failSilently) return { hit: false, value: null };
      throw error;
    }
  }

  async set<TValue = unknown>(
    key: string,
    value: TValue,
    options?: {
      readonly ttl?: CacheTTL;
      readonly tags?: readonly CacheTag[];
      readonly namespace?: CacheNamespace;
      readonly overwrite?: boolean;
      readonly metadata?: Readonly<Record<string, unknown>>;
    },
  ): Promise<CacheSetResult> {
    if (!this.enabled) return { success: false, key, expiresAt: null };
    const fullKey = this.keyBuilder.build(key, options);
    if (options?.tags) for (const tag of options.tags) assertValidTag(tag);
    try {
      const stored = this.serializer ? this.serialize(value) : value;
      const result = await this.store.set(fullKey, stored, {
        ttl: options?.ttl !== undefined ? options.ttl : this.defaultTtl,
        ...(options?.tags !== undefined ? { tags: options.tags } : {}),
        ...(options?.overwrite !== undefined
          ? { overwrite: options.overwrite }
          : {}),
        ...(options?.metadata !== undefined
          ? { metadata: options.metadata }
          : {}),
      });
      if (result.success) {
        // The entry now carries exactly the tags of this write. Mappings
        // left over from an earlier write would let `invalidateByTag` on a
        // tag the entry no longer has delete the new value.
        this.tagStore.removeKey(fullKey);
        if (options?.tags && options.tags.length > 0)
          await this.tagStore.add(fullKey, options.tags, this.tagScope(options));
      }
      return result;
    } catch (error) {
      if (this.failSilently) return { success: false, key, expiresAt: null };
      throw error;
    }
  }

  async delete(
    key: string,
    options?: NamespaceOptions,
  ): Promise<CacheDeleteResult> {
    if (!this.enabled) return { deleted: false, key };
    const fullKey = this.keyBuilder.build(key, options);
    try {
      const result = await this.store.delete(fullKey);
      this.tagStore.removeKey(fullKey);
      return result;
    } catch (error) {
      if (this.failSilently) return { deleted: false, key };
      throw error;
    }
  }

  async has(key: string, options?: NamespaceOptions): Promise<boolean> {
    if (!this.enabled) return false;
    const fullKey = this.keyBuilder.build(key, options);
    try {
      return await this.store.has(fullKey);
    } catch (error) {
      if (this.failSilently) return false;
      throw error;
    }
  }

  /**
   * Clears cache entries.
   * - No options: clears everything (and flushes the tag store).
   * - `namespace` and/or `pattern`: builds a fully-qualified pattern via
   *   the key builder (prefix + namespace + pattern) so only matching
   *   entries are removed. Both parts are validated: a `namespace` of `"*"`
   *   is rejected rather than escaping its own scope.
   */
  async clear(options?: {
    readonly namespace?: CacheNamespace;
    readonly pattern?: string;
  }): Promise<{ readonly cleared: number }> {
    if (!this.enabled) return { cleared: 0 };
    if (options?.pattern !== undefined || options?.namespace !== undefined) {
      // Validation happens outside the failSilently guard: a malformed
      // pattern is programmer error, not an adapter fault.
      const pattern = this.qualifyPattern(
        options.pattern ?? "*",
        options.namespace,
      );
      try {
        const result = await this.store.clear({ pattern });
        this.purgeTagsMatching(pattern);
        return result;
      } catch (error) {
        if (this.failSilently) return { cleared: 0 };
        throw error;
      }
    }
    try {
      const result = await this.store.clear();
      this.tagStore.clear();
      return result;
    } catch (error) {
      if (this.failSilently) return { cleared: 0 };
      throw error;
    }
  }

  /** Remaining TTL for a key (undefined = missing, null = never expires). */
  async ttl(
    key: string,
    options?: NamespaceOptions,
  ): Promise<number | null | undefined> {
    if (!this.enabled) return undefined;
    const fullKey = this.keyBuilder.build(key, options);
    try {
      return await this.store.ttl?.(fullKey);
    } catch (error) {
      if (this.failSilently) return undefined;
      throw error;
    }
  }

  /** Updates the TTL of an existing key. Returns false when unsupported or missing. */
  async expire(
    key: string,
    ttl: CacheTTL,
    options?: NamespaceOptions,
  ): Promise<boolean> {
    if (!this.enabled) return false;
    const fullKey = this.keyBuilder.build(key, options);
    try {
      return (await this.store.expire?.(fullKey, ttl)) ?? false;
    } catch (error) {
      if (this.failSilently) return false;
      throw error;
    }
  }

  async getOrSet<TValue>(
    key: string,
    fn: () => Promise<TValue>,
    options?: CacheOrComputeOptions,
  ): Promise<CacheOrComputeResult<TValue>> {
    if (!this.enabled) return { value: await fn(), cached: false };
    const fullKey = this.keyBuilder.build(key, options);
    if (!options?.forceRefresh) {
      const cached = await this.get<TValue>(key, options);
      if (cached.hit) return { value: cached.value as TValue, cached: true };
      // Stampede protection: concurrent misses share a single fn() call.
      const pending = this.inFlight.get(fullKey);
      if (pending) return { value: (await pending) as TValue, cached: false };
    }
    const promise = (async () => {
      const value = await fn();
      await this.set<TValue>(key, value, options);
      return value;
    })();
    this.inFlight.set(fullKey, promise);
    try {
      return { value: (await promise) as TValue, cached: false };
    } finally {
      if (this.inFlight.get(fullKey) === promise) this.inFlight.delete(fullKey);
    }
  }

  /**
   * Invalidates every entry tagged with any of `tags`, within this
   * service's namespace (or `options.namespace`). Tags registered under a
   * different namespace are untouched.
   */
  async invalidateByTag(
    tags: readonly CacheTag[],
    options?: NamespaceOptions,
  ): Promise<{ readonly cleared: number }> {
    if (!this.enabled) return { cleared: 0 };
    for (const tag of tags) assertValidTag(tag);
    try {
      return await this.invalidation.invalidateByTag(
        tags,
        this.tagScope(options),
      );
    } catch (error) {
      if (this.failSilently) return { cleared: 0 };
      throw error;
    }
  }

  /**
   * Invalidates entries matching a service-level glob pattern. The
   * pattern is qualified with the key builder's prefix (and namespace,
   * if configured), so `invalidateByPattern("user.*")` matches keys this
   * service wrote via `set("user.1", ...)`.
   *
   * `*` never crosses the key separator, so a pattern cannot reach into a
   * namespace the caller did not name. Use `**` as the pattern to span
   * whole namespaces deliberately.
   */
  async invalidateByPattern(
    pattern: string,
    options?: NamespaceOptions,
  ): Promise<{ readonly cleared: number }> {
    if (!this.enabled) return { cleared: 0 };
    const qualified = this.qualifyPattern(pattern, options?.namespace);
    try {
      const result = await this.invalidation.invalidateByPattern(qualified);
      this.purgeTagsMatching(qualified);
      return result;
    } catch (error) {
      if (this.failSilently) return { cleared: 0 };
      throw error;
    }
  }

  /**
   * Runs `fn` under a namespace-scoped, fully-qualified lock.
   *
   * The lock name goes through the key builder, so it is prefixed and
   * namespaced exactly like a cache key and validated the same way — two
   * tenants using the same lock name do not collide.
   *
   * The lease is renewed while `fn` runs and a lost lease throws (see
   * `CacheLockManager.withLock`). `failSilently` deliberately does not apply:
   * running a critical section without exclusion is never a safe
   * degradation, and neither is running it while the cache is disabled.
   */
  async withLock<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    options?: {
      readonly ttl?: CacheTTL;
      readonly retryAttempts?: number;
      readonly namespace?: CacheNamespace;
    },
  ): Promise<T> {
    if (!this.enabled) {
      const code: CacheErrorCode = "CACHE_DISABLED";
      throw new CacheError(
        `Cannot acquire lock "${key}": the cache is disabled.`,
        { code, statusCode: 503 },
      );
    }
    const lockKey = this.keyBuilder.build(
      key,
      options?.namespace !== undefined
        ? { namespace: options.namespace }
        : undefined,
    );
    return this.lockManager.withLock(lockKey, fn, {
      ...(options?.ttl !== undefined ? { ttl: options.ttl } : {}),
      // `retryAttempts: 0` is honored (single attempt, no retries).
      ...(options?.retryAttempts !== undefined
        ? {
            retry: {
              attempts: options.retryAttempts,
              delay: DEFAULT_LOCK_RETRY_DELAY_MS,
            },
          }
        : {}),
    });
  }

  /**
   * Applies a sequence of operations, one at a time, returning one result
   * per operation in submission order. A failing operation does not stop
   * the batch; its error is reported on its own result.
   */
  async batch(
    operations: readonly CacheBatchOperation[],
    options?: NamespaceOptions,
  ): Promise<readonly CacheBatchResult[]> {
    const results: CacheBatchResult[] = [];
    for (const operation of operations) {
      try {
        const result = await this.applyBatchOperation(operation, options);
        results.push({ operation, success: true, result });
      } catch (error) {
        results.push({ operation, success: false, error });
      }
    }
    return results;
  }

  /* ---- Observability ---- */

  getStats(): CacheStats | null {
    return this.metrics?.getStats() ?? null;
  }

  /** Number of live entries, when the underlying adapter can report it. */
  async size(): Promise<number | undefined> {
    if (!this.enabled) return undefined;
    try {
      return await this.store.size();
    } catch (error) {
      if (this.failSilently) return undefined;
      throw error;
    }
  }

  /** Latency percentiles for one operation. */
  getLatencyStats(
    operation: CacheOperation,
  ): ReturnType<InMemoryCacheMetrics["getLatencyStats"]> | null {
    return this.metrics?.getLatencyStats(operation) ?? null;
  }

  /** Latency histogram for one operation. */
  getLatencyHistogram(
    operation: CacheOperation,
  ): ReturnType<InMemoryCacheMetrics["getLatencyHistogram"]> | null {
    return this.metrics?.getLatencyHistogram(operation) ?? null;
  }

  /** The most-read keys currently tracked, hottest first. */
  getHotKeys(
    topN?: number,
  ): ReturnType<InMemoryCacheMetrics["getHotKeys"]> | null {
    return this.metrics?.getHotKeys(topN) ?? null;
  }

  /** Resets all collected metrics. */
  resetStats(): void {
    this.metrics?.reset();
  }

  /**
   * Subscribes to cache events (`cache.hit`, `cache.miss`, `cache.set`,
   * `cache.delete`, `cache.clear`, `cache.error`), or to `"*"` for all.
   */
  subscribe(
    eventType: CacheEvent["type"] | "*",
    handler: CacheEventHandler,
  ): CacheEventSubscription {
    return this.store.subscribe(eventType, handler);
  }

  async healthCheck(): Promise<CacheHealth> {
    if (!this.enabled) {
      // A disabled cache is not unhealthy — but the caller must be able to
      // tell the two apart, so say so explicitly instead of probing an
      // adapter the service has been told not to use.
      return {
        healthy: true,
        adapter: this.store.name,
        checkedAt: new Date(),
        disabled: true,
      };
    }
    const start = performance.now();
    try {
      await this.store.has("__health__");
      return {
        healthy: true,
        adapter: this.store.name,
        latencyMs: performance.now() - start,
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        adapter: this.store.name,
        checkedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async connect(): Promise<void> {
    await this.store.connect?.();
  }
  async disconnect(): Promise<void> {
    await this.store.disconnect?.();
    // Drop service-local state so a reconnect does not resurrect stale
    // in-flight computations or tag mappings.
    this.inFlight.clear();
    this.tagStore.clear();
  }

  /* ---- Internals ---- */

  private async applyBatchOperation(
    operation: CacheBatchOperation,
    options?: NamespaceOptions,
  ): Promise<unknown> {
    const scope =
      options?.namespace !== undefined
        ? { namespace: options.namespace }
        : undefined;
    switch (operation.type) {
      case "get":
        return this.get(operation.key, scope);
      case "set":
        return this.set(operation.key, operation.value, {
          ...operation.options,
          ...(scope ?? {}),
        });
      case "delete":
        return this.delete(operation.key, scope);
      default: {
        const code: CacheErrorCode = "CACHE_OPERATION_FAILED";
        throw new CacheError(
          `Unsupported batch operation type: ${String(
            (operation as CacheBatchOperation).type,
          )}.`,
          { code, key: operation.key, statusCode: 400, expose: true },
        );
      }
    }
  }

  /** The namespace scope applied to tag registrations and lookups. */
  private tagScope(options?: NamespaceOptions): { namespace?: CacheNamespace } {
    const namespace = options?.namespace ?? this.namespace;
    return namespace !== undefined ? { namespace } : {};
  }

  private qualifyPattern(pattern: string, namespace?: CacheNamespace): string {
    if (this.keyBuilder.buildPattern) {
      return this.keyBuilder.buildPattern(
        pattern,
        namespace !== undefined ? { namespace } : undefined,
      );
    }
    return pattern;
  }

  private purgeTagsMatching(pattern: string): void {
    const matches = createGlobMatcher(pattern, { separator: this.separator });
    for (const key of this.tagStore.trackedKeys()) {
      if (matches(key)) this.tagStore.removeKey(key);
    }
  }

  private serialize(value: unknown): unknown {
    try {
      return this.serializer!.serialize(value);
    } catch (error) {
      if (isCacheError(error)) throw error;
      throw cacheSerializationError(undefined, { cause: error });
    }
  }

  private deserialize(value: unknown): unknown {
    try {
      return this.serializer!.deserialize(value);
    } catch (error) {
      if (isCacheError(error)) throw error;
      throw cacheDeserializationError(undefined, { cause: error });
    }
  }
}

export function createCacheService(options: {
  readonly adapter: CacheAdapter;
  readonly config?: CacheConfig;
  readonly keyBuilder?: CacheKeyBuilder;
}): CacheService {
  return new CacheService(options);
}
