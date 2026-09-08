/**
 * @zudojs/cache — Cache Service
 * High-level cache service combining adapter, key builder, tags,
 * invalidation, locking, metrics, and an optional serializer.
 *
 * Serialization: when `config.serializer` is provided, values are
 * serialized on set and deserialized on get, so cached values are
 * structural copies. Without a serializer the memory adapter stores
 * values by reference — mutations of a cached object are visible to
 * later readers.
 */

import type {
  CacheAdapter,
  CacheConfig,
  CacheDeleteResult,
  CacheGetResult,
  CacheHealth,
  CacheHealthChecker,
  CacheOrComputeOptions,
  CacheOrComputeResult,
  CacheSerializer,
  CacheSetResult,
  CacheStats,
  CacheStore,
  CacheTag,
  CacheTTL,
} from "./types.js";
import type { CacheKeyBuilder } from "./types-keys.js";
import {
  DEFAULT_LOCK_RETRY_DELAY_MS,
  DEFAULT_TTL_MS,
} from "./constants.js";
import { DefaultKeyBuilder } from "./key-builder.js";
import { createCacheStore } from "./store.js";
import { createTagStore, InMemoryTagStore } from "./tags.js";
import {
  CacheInvalidationManager,
  createInvalidationManager,
} from "./invalidation.js";
import { CacheLockManager, createLockManager } from "./lock.js";
import { createCacheMetrics, InMemoryCacheMetrics } from "./metrics.js";
import {
  cacheDeserializationError,
  cacheSerializationError,
  isCacheError,
} from "./errors.js";
import { globToRegExp } from "./utils.js";

export class CacheService implements CacheHealthChecker {
  private readonly store: CacheStore;
  private readonly keyBuilder: CacheKeyBuilder;
  private readonly tagStore: InMemoryTagStore;
  private readonly invalidation: CacheInvalidationManager;
  private readonly lockManager: CacheLockManager;
  private readonly metrics: InMemoryCacheMetrics | null;
  private readonly serializer: CacheSerializer | null;
  private readonly defaultTtl: CacheTTL;
  private readonly enabled: boolean;
  private readonly failSilently: boolean;
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
    this.metrics =
      options.config?.collectStats !== false ? createCacheMetrics() : null;
    this.store = createCacheStore({
      adapter: options.adapter,
      ...(this.metrics ? { metrics: this.metrics } : {}),
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
    this.lockManager = createLockManager();
  }

  async get<TValue = unknown>(
    key: string,
    options?: { readonly namespace?: string },
  ): Promise<CacheGetResult<TValue>> {
    if (!this.enabled) return { hit: false, value: null };
    const fullKey = this.keyBuilder.build(key, options);
    try {
      const result = await this.store.get<TValue>(fullKey);
      if (!result.hit || !this.serializer) return result;
      return { ...result, value: this.deserialize(result.value) as TValue };
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
      readonly namespace?: string;
      readonly overwrite?: boolean;
    },
  ): Promise<CacheSetResult> {
    if (!this.enabled) return { success: false, key, expiresAt: null };
    const fullKey = this.keyBuilder.build(key, options);
    try {
      const stored = this.serializer ? this.serialize(value) : value;
      const result = await this.store.set(fullKey, stored, {
        ttl: options?.ttl !== undefined ? options.ttl : this.defaultTtl,
        ...(options?.tags !== undefined ? { tags: options.tags } : {}),
        ...(options?.overwrite !== undefined
          ? { overwrite: options.overwrite }
          : {}),
      });
      if (result.success && options?.tags && options.tags.length > 0)
        await this.tagStore.add(fullKey, options.tags);
      return result;
    } catch (error) {
      if (this.failSilently) return { success: false, key, expiresAt: null };
      throw error;
    }
  }

  async delete(
    key: string,
    options?: { readonly namespace?: string },
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

  async has(
    key: string,
    options?: { readonly namespace?: string },
  ): Promise<boolean> {
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
   *   entries are removed.
   */
  async clear(options?: {
    readonly namespace?: string;
    readonly pattern?: string;
  }): Promise<{ readonly cleared: number }> {
    if (!this.enabled) return { cleared: 0 };
    if (options?.pattern !== undefined || options?.namespace !== undefined) {
      const pattern = this.qualifyPattern(
        options.pattern ?? "*",
        options.namespace,
      );
      const result = await this.store.clear({ pattern });
      this.purgeTagsMatching(pattern);
      return result;
    }
    const result = await this.store.clear();
    this.tagStore.clear();
    return result;
  }

  /** Remaining TTL for a key (undefined = missing, null = never expires). */
  async ttl(
    key: string,
    options?: { readonly namespace?: string },
  ): Promise<number | null | undefined> {
    if (!this.enabled) return undefined;
    return this.store.ttl?.(this.keyBuilder.build(key, options));
  }

  /** Updates the TTL of an existing key. Returns false when unsupported or missing. */
  async expire(
    key: string,
    ttl: CacheTTL,
    options?: { readonly namespace?: string },
  ): Promise<boolean> {
    if (!this.enabled) return false;
    return (
      (await this.store.expire?.(this.keyBuilder.build(key, options), ttl)) ??
      false
    );
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

  async invalidateByTag(
    tags: readonly CacheTag[],
  ): Promise<{ readonly cleared: number }> {
    return this.invalidation.invalidateByTag(tags);
  }

  /**
   * Invalidates entries matching a service-level glob pattern. The
   * pattern is qualified with the key builder's prefix (and namespace,
   * if configured), so `invalidateByPattern("user.*")` matches keys this
   * service wrote via `set("user.1", ...)`.
   */
  async invalidateByPattern(
    pattern: string,
  ): Promise<{ readonly cleared: number }> {
    const qualified = this.qualifyPattern(pattern);
    const result = await this.invalidation.invalidateByPattern(qualified);
    this.purgeTagsMatching(qualified);
    return result;
  }

  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: { readonly ttl?: CacheTTL; readonly retryAttempts?: number },
  ): Promise<T> {
    return this.lockManager.withLock(key, fn, {
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

  getStats(): CacheStats | null {
    return this.metrics?.getStats() ?? null;
  }

  async healthCheck(): Promise<CacheHealth> {
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
  }

  /* ---- Internals ---- */

  private qualifyPattern(pattern: string, namespace?: string): string {
    if (this.keyBuilder.buildPattern) {
      return this.keyBuilder.buildPattern(
        pattern,
        namespace !== undefined ? { namespace } : undefined,
      );
    }
    return pattern;
  }

  private purgeTagsMatching(pattern: string): void {
    const regex = globToRegExp(pattern);
    for (const key of this.tagStore.trackedKeys()) {
      if (regex.test(key)) this.tagStore.removeKey(key);
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
