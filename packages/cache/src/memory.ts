/**
 * @zudojs/cache — Memory Adapter
 * In-memory cache adapter using a Map. Suitable for development, testing, and single-process deployments.
 *
 * Receives fully-qualified keys; namespace resolution happens in CacheService.
 */

import type {
  CacheClearOptions,
  CacheClearResult,
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheGetResult,
  CacheKeysOptions,
  CacheSetManyOptions,
  CacheSetOptions,
  CacheSetResult,
  CacheTTL,
} from "./types.js";
import type { CacheAdapter } from "./types.js";
import { DEFAULT_MAX_ENTRIES, DEFAULT_TTL_MS } from "./constants.js";
import { assertValidTtl, deleteManyViaDelete, globToRegExp } from "./utils.js";

interface MemoryEntry {
  readonly value: unknown;
  readonly createdAt: number;
  expiresAt: number | null;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export class MemoryCacheAdapter implements CacheAdapter {
  readonly name = "memory";
  private readonly store = new Map<string, MemoryEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtl: CacheTTL;

  constructor(options?: {
    readonly maxEntries?: number;
    readonly defaultTtl?: CacheTTL;
  }) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.defaultTtl = options?.defaultTtl ?? DEFAULT_TTL_MS;
  }

  async get<TValue = unknown>(key: string): Promise<CacheGetResult<TValue>> {
    const entry = this.store.get(key);
    if (!entry) return { hit: false, value: null };
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return { hit: false, value: null };
    }
    return { hit: true, value: entry.value as TValue };
  }

  async set<TValue = unknown>(
    key: string,
    value: TValue,
    options?: CacheSetOptions,
  ): Promise<CacheSetResult> {
    const ttl = options?.ttl !== undefined ? options.ttl : this.defaultTtl;
    assertValidTtl(ttl);
    if (options?.overwrite === false && (await this.has(key))) {
      return { success: false, key, expiresAt: null, skipped: true };
    }
    // Overwriting an existing key does not grow the store, so only evict
    // when inserting a genuinely new key.
    if (!this.store.has(key)) this.evictIfNeeded();
    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: ttl !== null ? now + ttl : null,
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
    });
    return {
      success: true,
      key,
      expiresAt: ttl !== null ? new Date(now + ttl) : null,
    };
  }

  async delete(key: string): Promise<CacheDeleteResult> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return { deleted: existed, key };
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async clear(options?: CacheClearOptions): Promise<CacheClearResult> {
    if (!options?.pattern) {
      const size = this.store.size;
      this.store.clear();
      return { cleared: size };
    }
    let cleared = 0;
    const regex = globToRegExp(options.pattern);
    for (const key of [...this.store.keys()]) {
      if (regex.test(key)) {
        this.store.delete(key);
        cleared++;
      }
    }
    return { cleared };
  }

  async keys(options?: CacheKeysOptions): Promise<readonly string[]> {
    let filtered: string[] = [];
    for (const [key, entry] of [...this.store]) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      filtered.push(key);
    }
    if (options?.pattern) {
      const regex = globToRegExp(options.pattern);
      filtered = filtered.filter((k) => regex.test(k));
    }
    if (options?.limit !== undefined)
      filtered = filtered.slice(0, options.limit);
    return filtered;
  }

  async getMany<TValue = unknown>(
    keys: readonly string[],
  ): Promise<ReadonlyMap<string, CacheGetResult<TValue>>> {
    const results = new Map<string, CacheGetResult<TValue>>();
    for (const key of keys) results.set(key, await this.get<TValue>(key));
    return results;
  }

  async setMany<TValue = unknown>(
    entries: ReadonlyMap<string, TValue>,
    options?: CacheSetManyOptions,
  ): Promise<readonly CacheSetResult[]> {
    const results: CacheSetResult[] = [];
    for (const [key, value] of entries)
      results.push(await this.set<TValue>(key, value, options));
    return results;
  }

  async deleteMany(keys: readonly string[]): Promise<CacheDeleteManyResult> {
    return deleteManyViaDelete(keys, (key) => this.delete(key));
  }

  /**
   * Remaining TTL for a key in milliseconds.
   * - `undefined` — the key does not exist (expired entries are deleted)
   * - `null` — the key exists and never expires
   * - `number` — remaining milliseconds until expiry
   */
  async ttl(key: string): Promise<number | null | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    if (entry.expiresAt === null) return null;
    return entry.expiresAt - Date.now();
  }

  async expire(key: string, ttl: CacheTTL): Promise<boolean> {
    assertValidTtl(ttl);
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    this.store.set(key, {
      ...entry,
      expiresAt: ttl !== null ? Date.now() + ttl : null,
    });
    return true;
  }

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  private evictIfNeeded(): void {
    if (this.store.size < this.maxEntries) return;
    // Purge expired entries before evicting live ones.
    for (const [key, entry] of [...this.store]) {
      if (this.isExpired(entry)) this.store.delete(key);
    }
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }
}

export function createMemoryCacheAdapter(options?: {
  readonly maxEntries?: number;
  readonly defaultTtl?: CacheTTL;
}): MemoryCacheAdapter {
  return new MemoryCacheAdapter(options);
}
