/**
 * @zudojs/cache — Store
 * Wraps a CacheAdapter with metrics, events, middleware, and error handling.
 * Batch operations run through the same instrumentation path as single
 * operations: per-key hit/miss metrics and events fire, and errors are
 * wrapped in CacheError.
 */

import type {
  CacheAdapter,
  CacheClearOptions,
  CacheClearResult,
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheEvent,
  CacheEventHandler,
  CacheEventSubscription,
  CacheGetResult,
  CacheKeysOptions,
  CacheMiddleware,
  CacheMiddlewareContext,
  CacheMetrics,
  CacheSetManyOptions,
  CacheSetOptions,
  CacheSetResult,
  CacheStore,
  CacheTTL,
} from "./types.js";
import { CacheError, CacheOperation } from "./errors.js";
import { deleteManyViaDelete } from "./utils.js";

export class DefaultCacheStore implements CacheStore {
  readonly name: string;
  private readonly adapter: CacheAdapter;
  private readonly metrics?: CacheMetrics;
  private readonly middlewares: CacheMiddleware[] = [];
  private readonly handlers = new Map<string, Set<CacheEventHandler>>();

  constructor(options: {
    readonly adapter: CacheAdapter;
    readonly metrics?: CacheMetrics;
    readonly middlewares?: readonly CacheMiddleware[];
  }) {
    this.adapter = options.adapter;
    this.name = options.adapter.name;
    this.metrics = options.metrics;
    if (options.middlewares) this.middlewares = [...options.middlewares];
  }

  connect(): Promise<void> {
    return this.adapter.connect?.() ?? Promise.resolve();
  }
  disconnect(): Promise<void> {
    return this.adapter.disconnect?.() ?? Promise.resolve();
  }

  async get<TValue = unknown>(key: string): Promise<CacheGetResult<TValue>> {
    return this.executeWithMiddleware(CacheOperation.GET, key, () =>
      this.adapter.get<TValue>(key),
    );
  }

  async has(key: string): Promise<boolean> {
    return this.executeWithMiddleware(CacheOperation.HAS, key, () =>
      this.adapter.has(key),
    );
  }

  async keys(options?: CacheKeysOptions): Promise<readonly string[]> {
    return this.executeWithMiddleware(
      CacheOperation.KEYS,
      "*",
      () => this.adapter.keys?.(options) ?? Promise.resolve([]),
    );
  }

  async set<TValue = unknown>(
    key: string,
    value: TValue,
    options?: CacheSetOptions,
  ): Promise<CacheSetResult> {
    return this.executeWithMiddleware(CacheOperation.SET, key, () =>
      this.adapter.set<TValue>(key, value, options),
    );
  }

  async delete(key: string): Promise<CacheDeleteResult> {
    return this.executeWithMiddleware(CacheOperation.DELETE, key, () =>
      this.adapter.delete(key),
    );
  }

  async clear(options?: CacheClearOptions): Promise<CacheClearResult> {
    return this.executeWithMiddleware(CacheOperation.CLEAR, "*", () =>
      this.adapter.clear(options),
    );
  }

  async getMany<TValue = unknown>(
    keys: readonly string[],
  ): Promise<ReadonlyMap<string, CacheGetResult<TValue>>> {
    if (!this.adapter.getMany) {
      const results = new Map<string, CacheGetResult<TValue>>();
      for (const key of keys) results.set(key, await this.get<TValue>(key));
      return results;
    }
    const results = await this.executeWithMiddleware(
      CacheOperation.GET_MANY,
      "*",
      () => this.adapter.getMany!<TValue>(keys),
    );
    for (const key of keys) {
      this.recordGetOutcome(key, results.get(key)?.hit ?? false);
    }
    return results;
  }

  async setMany<TValue = unknown>(
    entries: ReadonlyMap<string, TValue>,
    options?: CacheSetManyOptions,
  ): Promise<readonly CacheSetResult[]> {
    if (!this.adapter.setMany) {
      const results: CacheSetResult[] = [];
      for (const [key, value] of entries)
        results.push(await this.set<TValue>(key, value, options));
      return results;
    }
    const results = await this.executeWithMiddleware(
      CacheOperation.SET_MANY,
      "*",
      () => this.adapter.setMany!<TValue>(entries, options),
    );
    for (const result of results) {
      if (!result.success) continue;
      this.metrics?.incrementSet(result.key);
      this.emit({ type: "cache.set", key: result.key, occurredAt: new Date() });
    }
    return results;
  }

  async deleteMany(keys: readonly string[]): Promise<CacheDeleteManyResult> {
    if (!this.adapter.deleteMany) {
      return deleteManyViaDelete(keys, (key) => this.delete(key));
    }
    const result = await this.executeWithMiddleware(
      CacheOperation.DELETE_MANY,
      "*",
      () => this.adapter.deleteMany!(keys),
    );
    const deletedKeys = new Set(result.keys);
    for (const key of keys) {
      this.metrics?.incrementDelete(key);
      this.emit({
        type: "cache.delete",
        key,
        occurredAt: new Date(),
        deleted: deletedKeys.has(key),
      });
    }
    return result;
  }

  async ttl(key: string): Promise<number | null | undefined> {
    if (!this.adapter.ttl) return undefined;
    return this.executeWithMiddleware(CacheOperation.TTL, key, () =>
      this.adapter.ttl!(key),
    );
  }

  async expire(key: string, ttl: CacheTTL): Promise<boolean> {
    if (!this.adapter.expire) return false;
    return this.executeWithMiddleware(CacheOperation.EXPIRE, key, () =>
      this.adapter.expire!(key, ttl),
    );
  }

  subscribe(
    eventType: CacheEvent["type"] | "*",
    handler: CacheEventHandler,
  ): CacheEventSubscription {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler);
    return {
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handler);
      },
    };
  }

  private emit(event: CacheEvent): void {
    const specific = this.handlers.get(event.type);
    const wildcard = this.handlers.get("*");
    const all = new Set<CacheEventHandler>([
      ...(specific ?? []),
      ...(wildcard ?? []),
    ]);
    for (const handler of all) {
      try {
        // Swallow both sync throws and async rejections so a faulty
        // handler can never crash the process.
        Promise.resolve(handler(event)).catch(() => {
          /* swallow */
        });
      } catch {
        /* swallow */
      }
    }
  }

  private recordGetOutcome(key: string, hit: boolean, latencyMs?: number): void {
    if (hit) {
      this.metrics?.incrementHit(key);
      this.emit({ type: "cache.hit", key, occurredAt: new Date(), latencyMs });
    } else {
      this.metrics?.incrementMiss(key);
      this.emit({ type: "cache.miss", key, occurredAt: new Date(), latencyMs });
    }
  }

  private async executeWithMiddleware<T>(
    operation: CacheOperation,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const context: CacheMiddlewareContext = {
      key,
      operation,
      startedAt: new Date(),
    };
    const execute = async (): Promise<T> => {
      const start = performance.now();
      try {
        const result = await fn();
        const latencyMs = performance.now() - start;
        this.metrics?.observeLatency(operation, latencyMs);
        if (operation === CacheOperation.GET) {
          const hitResult = result as CacheGetResult;
          this.recordGetOutcome(key, hitResult.hit, latencyMs);
        } else if (operation === CacheOperation.SET) {
          this.metrics?.incrementSet(key);
          this.emit({ type: "cache.set", key, occurredAt: new Date() });
        } else if (operation === CacheOperation.DELETE) {
          this.metrics?.incrementDelete(key);
          this.emit({
            type: "cache.delete",
            key,
            occurredAt: new Date(),
            deleted: (result as CacheDeleteResult).deleted,
          });
        } else if (operation === CacheOperation.CLEAR) {
          this.emit({
            type: "cache.clear",
            occurredAt: new Date(),
            cleared: (result as CacheClearResult).cleared,
          });
        }
        return result;
      } catch (error) {
        this.metrics?.incrementError(key);
        this.emit({ type: "cache.error", key, occurredAt: new Date(), error });
        if (error instanceof CacheError) throw error;
        throw new CacheError(`Cache ${operation} failed for key "${key}".`, {
          cause: error,
          operation,
          key,
        });
      }
    };
    let index = 0;
    const chain = async (): Promise<T> => {
      if (index >= this.middlewares.length) return execute();
      const middleware = this.middlewares[index];
      index++;
      if (middleware === undefined) return execute();
      return middleware(context, chain) as Promise<T>;
    };
    return chain();
  }
}

export function createCacheStore(options: {
  readonly adapter: CacheAdapter;
  readonly metrics?: CacheMetrics;
  readonly middlewares?: readonly CacheMiddleware[];
}): DefaultCacheStore {
  return new DefaultCacheStore(options);
}
