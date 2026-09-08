/**
 * @zudojs/cache — Memory Adapter
 * In-memory cache adapter using a Map. Suitable for development, testing, and single-process deployments.
 *
 * Receives fully-qualified keys; namespace resolution happens in CacheService.
 *
 * Bounds: the store is capped both by entry count (`maxEntries`) and by an
 * approximate byte budget (`maxBytes`). Eviction is LRU — reads move an
 * entry to the back of the queue, so the hottest keys survive.
 *
 * Expiry is measured on a monotonic clock, so an NTP step or a VM resume
 * cannot extend (or collapse) an entry's lifetime. The wall-clock
 * `expiresAt` returned to callers is derived from it for display only.
 */

import type {
  CacheClearOptions,
  CacheClearResult,
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheEntry,
  CacheGetResult,
  CacheKeysOptions,
  CacheSetManyOptions,
  CacheSetOptions,
  CacheSetResult,
  CacheTTL,
} from "./types.js";
import type { CacheAdapter } from "./types.js";
import {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_SEPARATOR,
  DEFAULT_TTL_MS,
  EXPIRED_PURGE_INTERVAL_MS,
  SIZE_ESTIMATE_NODE_BUDGET,
} from "./constants.js";
import {
  assertValidTtl,
  createGlobMatcher,
  deleteManyViaDelete,
  monotonicNow,
  wallClockFor,
} from "./utils.js";

interface MemoryEntry {
  readonly value: unknown;
  /** Monotonic ms at creation. */
  readonly createdAt: number;
  /** Monotonic ms deadline, or null when the entry never expires. */
  expiresAt: number | null;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Estimated retained bytes, used for the memory budget. */
  readonly bytes: number;
}

/**
 * Approximates the retained size of a value in bytes.
 *
 * Deliberately bounded: at most `SIZE_ESTIMATE_NODE_BUDGET` nodes are
 * visited, so `set` stays cheap for large object graphs. Beyond the budget
 * the remainder is charged a flat per-node estimate, which keeps the number
 * monotone in value size without walking the whole graph.
 */
export function estimateValueBytes(value: unknown): number {
  let budget = SIZE_ESTIMATE_NODE_BUDGET;
  const seen = new Set<object>();

  const walk = (node: unknown): number => {
    if (budget <= 0) return 16;
    budget--;
    switch (typeof node) {
      case "string":
        return 16 + node.length * 2;
      case "number":
        return 8;
      case "boolean":
        return 4;
      case "bigint":
        return 16;
      case "undefined":
        return 0;
      case "function":
        return 32;
      default:
        break;
    }
    if (node === null) return 0;
    const obj = node as object;
    if (seen.has(obj)) return 0;
    seen.add(obj);
    if (ArrayBuffer.isView(obj))
      return 16 + (obj as ArrayBufferView).byteLength;
    if (obj instanceof ArrayBuffer) return 16 + obj.byteLength;
    if (obj instanceof Date) return 16;
    if (Array.isArray(obj)) {
      let total = 16;
      for (const item of obj) total += walk(item);
      return total;
    }
    if (obj instanceof Map) {
      let total = 16;
      for (const [k, v] of obj) total += walk(k) + walk(v);
      return total;
    }
    if (obj instanceof Set) {
      let total = 16;
      for (const item of obj) total += walk(item);
      return total;
    }
    let total = 16;
    for (const [k, v] of Object.entries(obj))
      total += 16 + k.length * 2 + walk(v);
    return total;
  };

  return walk(value);
}

export class MemoryCacheAdapter implements CacheAdapter {
  readonly name = "memory";
  private readonly store = new Map<string, MemoryEntry>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly defaultTtl: CacheTTL;
  private readonly separator: string;
  private bytesUsed = 0;
  private lastPurgeAt = monotonicNow();

  constructor(options?: {
    readonly maxEntries?: number;
    /**
     * Approximate memory budget in bytes. Entries are evicted (LRU) until
     * the estimated total fits. Defaults to `DEFAULT_MAX_MEMORY_BYTES`.
     */
    readonly maxBytes?: number;
    readonly defaultTtl?: CacheTTL;
    /**
     * Key separator used when matching glob patterns. `*` never crosses it.
     * Defaults to `DEFAULT_SEPARATOR`; set it to match a custom key-builder
     * separator.
     */
    readonly separator?: string;
  }) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_MEMORY_BYTES;
    this.defaultTtl = options?.defaultTtl ?? DEFAULT_TTL_MS;
    this.separator = options?.separator ?? DEFAULT_SEPARATOR;
  }

  async get<TValue = unknown>(key: string): Promise<CacheGetResult<TValue>> {
    const entry = this.store.get(key);
    if (!entry) return { hit: false, value: null };
    if (this.isExpired(entry)) {
      this.remove(key);
      return { hit: false, value: null };
    }
    // LRU: a read moves the entry to the back of the eviction queue, so the
    // hottest key is not evicted merely for being the oldest write.
    this.store.delete(key);
    this.store.set(key, entry);
    return {
      hit: true,
      value: entry.value as TValue,
      entry: this.toCacheEntry<TValue>(key, entry),
    };
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
    const now = monotonicNow();
    const bytes = estimateValueBytes(value) + key.length * 2;
    // The opportunistic purge runs on the overwrite path too — time-gated,
    // so re-setting hot keys stays cheap while dead entries elsewhere in the
    // store still get collected. Overwriting releases the old entry's budget
    // first, so it never counts twice.
    this.maybePurgeExpired(now);
    if (this.store.has(key)) this.remove(key);
    this.evictIfNeeded(bytes);

    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: ttl !== null ? now + ttl : null,
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
      bytes,
    });
    this.bytesUsed += bytes;
    return {
      success: true,
      key,
      expiresAt: ttl !== null ? wallClockFor(now + ttl) : null,
    };
  }

  async delete(key: string): Promise<CacheDeleteResult> {
    const existed = this.store.has(key);
    this.remove(key);
    return { deleted: existed, key };
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.remove(key);
      return false;
    }
    return true;
  }

  async clear(options?: CacheClearOptions): Promise<CacheClearResult> {
    if (!options?.pattern) {
      const size = this.store.size;
      this.store.clear();
      this.bytesUsed = 0;
      return { cleared: size };
    }
    let cleared = 0;
    const matches = createGlobMatcher(options.pattern, {
      separator: this.separator,
    });
    for (const key of [...this.store.keys()]) {
      if (matches(key)) {
        this.remove(key);
        cleared++;
      }
    }
    return { cleared };
  }

  async keys(options?: CacheKeysOptions): Promise<readonly string[]> {
    let filtered: string[] = [];
    for (const [key, entry] of [...this.store]) {
      if (this.isExpired(entry)) {
        this.remove(key);
        continue;
      }
      filtered.push(key);
    }
    if (options?.pattern) {
      const matches = createGlobMatcher(options.pattern, {
        separator: this.separator,
      });
      filtered = filtered.filter(matches);
    }
    if (options?.limit !== undefined)
      filtered = filtered.slice(0, options.limit);
    return filtered;
  }

  /** Number of live entries currently held. */
  async size(): Promise<number> {
    this.purgeExpired();
    return this.store.size;
  }

  /** Estimated bytes currently retained by cached values. */
  get estimatedBytes(): number {
    return this.bytesUsed;
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
      this.remove(key);
      return undefined;
    }
    if (entry.expiresAt === null) return null;
    return entry.expiresAt - monotonicNow();
  }

  async expire(key: string, ttl: CacheTTL): Promise<boolean> {
    assertValidTtl(ttl);
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.remove(key);
      return false;
    }
    entry.expiresAt = ttl !== null ? monotonicNow() + ttl : null;
    return true;
  }

  /* ---- Internals ---- */

  private toCacheEntry<TValue>(
    key: string,
    entry: MemoryEntry,
  ): CacheEntry<TValue> {
    return {
      key,
      value: entry.value as TValue,
      createdAt: wallClockFor(entry.createdAt),
      expiresAt:
        entry.expiresAt !== null ? wallClockFor(entry.expiresAt) : null,
      tags: entry.tags,
      metadata: entry.metadata,
    };
  }

  /**
   * An entry is dead *at* its deadline, not one millisecond after it, so
   * `ttl(key) === 0` and "present" are never both true.
   */
  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== null && monotonicNow() >= entry.expiresAt;
  }

  private remove(key: string): void {
    const entry = this.store.get(key);
    if (!entry) return;
    this.store.delete(key);
    this.bytesUsed -= entry.bytes;
    if (this.bytesUsed < 0) this.bytesUsed = 0;
  }

  private purgeExpired(): void {
    for (const [key, entry] of [...this.store]) {
      if (this.isExpired(entry)) this.remove(key);
    }
    this.lastPurgeAt = monotonicNow();
  }

  private maybePurgeExpired(now: number): void {
    if (now - this.lastPurgeAt < EXPIRED_PURGE_INTERVAL_MS) return;
    this.purgeExpired();
  }

  /**
   * Makes room for an incoming entry of `incomingBytes`, honouring both the
   * entry-count cap and the memory budget. Expired entries are purged before
   * live ones are evicted; live eviction is least-recently-used.
   */
  private evictIfNeeded(incomingBytes: number): void {
    const overCount = this.store.size >= this.maxEntries;
    const overBytes = this.bytesUsed + incomingBytes > this.maxBytes;
    if (!overCount && !overBytes) return;

    this.purgeExpired();

    while (this.store.size >= this.maxEntries) {
      const lru = this.store.keys().next().value;
      if (lru === undefined) break;
      this.remove(lru);
    }
    while (
      this.bytesUsed + incomingBytes > this.maxBytes &&
      this.store.size > 0
    ) {
      const lru = this.store.keys().next().value;
      if (lru === undefined) break;
      this.remove(lru);
    }
  }
}

export function createMemoryCacheAdapter(options?: {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly defaultTtl?: CacheTTL;
  readonly separator?: string;
}): MemoryCacheAdapter {
  return new MemoryCacheAdapter(options);
}
