import { DatabaseError } from "@zudojs/errors";

/**
 * Cache entry stored by the database cache.
 */
export interface CacheEntry<TValue> {
  readonly value: TValue;
  readonly createdAt: number;
  readonly expiresAt?: number;
}

/**
 * Options for a cache operation.
 */
export interface CacheOptions {
  readonly ttlMs?: number;
}

/**
 * Options for constructing a {@link MemoryDatabaseCache}.
 */
export interface MemoryCacheOptions extends CacheOptions {
  /**
   * Maximum number of entries. When exceeded the least recently used entry
   * is evicted. Unbounded when omitted.
   */
  readonly maxEntries?: number;

  /**
   * Interval at which expired entries are pruned in the background. The
   * timer is `unref`'d so it never keeps the process alive. Disabled when
   * omitted; expired entries are still removed lazily on access.
   */
  readonly pruneIntervalMs?: number;
}

/**
 * Statistics exposed by the cache.
 */
export interface CacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly evictions: number;
}

/**
 * Generic cache contract.
 */
export interface DatabaseCache<TValue = unknown> {
  get(key: string): TValue | undefined;

  set(key: string, value: TValue, options?: CacheOptions): void;

  has(key: string): boolean;

  delete(key: string): boolean;

  clear(): void;

  /**
   * Returns all currently valid keys. Optional; required by
   * {@link invalidateByPrefix}.
   */
  keys?(): readonly string[];
}

/**
 * In-memory LRU cache for database read results.
 *
 * This cache is process-local and is not transaction-aware: never populate
 * it from inside a transaction that may still roll back, because other
 * callers would observe the uncommitted value.
 */
export class MemoryDatabaseCache<
  TValue = unknown,
> implements DatabaseCache<TValue> {
  private readonly entries = new Map<string, CacheEntry<TValue>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private readonly defaultTtlMs?: number;
  private readonly maxEntries?: number;
  private pruneTimer?: ReturnType<typeof setInterval>;

  constructor(options: MemoryCacheOptions = {}) {
    this.defaultTtlMs = normalizeTtl(options.ttlMs);
    this.maxEntries = normalizeMaxEntries(options.maxEntries);
    this.startPruning(options.pruneIntervalMs);
  }

  /**
   * Gets a cached value and marks it as recently used.
   */
  public get(key: string): TValue | undefined {
    validateKey(key);
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (isExpired(entry)) {
      this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Re-insert to move the key to the most-recently-used position.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  /**
   * Sets a cached value, evicting the least recently used entry when the
   * cache is full.
   */
  public set(key: string, value: TValue, options: CacheOptions = {}): void {
    validateKey(key);
    const ttlMs = normalizeTtl(options.ttlMs ?? this.defaultTtlMs);
    const createdAt = Date.now();
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      createdAt,
      expiresAt: ttlMs === undefined ? undefined : createdAt + ttlMs,
    });
    this.evictOverflow();
  }

  /**
   * Checks whether a valid cached value exists (does not touch recency).
   */
  public has(key: string): boolean {
    validateKey(key);
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Deletes a cache entry.
   */
  public delete(key: string): boolean {
    validateKey(key);
    return this.entries.delete(key);
  }

  /**
   * Clears the entire cache.
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * Removes expired entries.
   */
  public prune(): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (isExpired(entry)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Stops the background prune timer.
   */
  public dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }

  /**
   * Returns the number of valid entries.
   */
  public get size(): number {
    this.prune();
    return this.entries.size;
  }

  /**
   * Returns cache statistics.
   */
  public getStats(): CacheStats {
    this.prune();
    const total = this.hits + this.misses;
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
      evictions: this.evictions,
    };
  }

  /**
   * Resets hit/miss/eviction counters.
   */
  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Returns all currently valid cache keys (least recently used first).
   */
  public keys(): readonly string[] {
    this.prune();
    return Object.freeze([...this.entries.keys()]);
  }

  private evictOverflow(): void {
    if (this.maxEntries === undefined) return;
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  private startPruning(intervalMs: number | undefined): void {
    if (intervalMs === undefined) return;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new TypeError("Cache prune interval must be a positive finite number.");
    }
    this.pruneTimer = setInterval(() => {
      this.prune();
    }, Math.floor(intervalMs));
    (this.pruneTimer as { unref?: () => void }).unref?.();
  }
}

/**
 * Creates an in-memory database cache.
 */
export function createDatabaseCache<TValue = unknown>(
  options: MemoryCacheOptions = {},
): MemoryDatabaseCache<TValue> {
  return new MemoryDatabaseCache<TValue>(options);
}

/**
 * Separator used between cache key parts.
 */
export const CACHE_KEY_SEPARATOR = ":";

/**
 * Builds a stable cache key from a namespace and parts.
 *
 * Each part is serialised deterministically (nested keys sorted at every
 * level). Plain string parts are escaped so that a separator inside a part
 * cannot collide with the part boundary: `("ns", "a:b", "c")` and
 * `("ns", "a", "b:c")` produce different keys; serialised objects are
 * self-delimiting and are left as-is. The namespace itself is used verbatim
 * so it can be used as a prefix with {@link invalidateByPrefix}.
 */
export function createCacheKey(
  namespace: string,
  ...parts: readonly unknown[]
): string {
  validateKey(namespace);
  return [
    namespace,
    ...parts.map((part) =>
      typeof part === "string"
        ? escapeCachePart(part)
        : serializeCachePart(part),
    ),
  ].join(CACHE_KEY_SEPARATOR);
}

/**
 * Escapes separators and backslashes inside a key part.
 */
export function escapeCachePart(part: string): string {
  return part.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/**
 * Serializes a cache key component deterministically.
 *
 * Objects are serialised with keys sorted at every nesting level;
 * `bigint`, `Date`, `undefined`, `Map` and `Set` are handled explicitly.
 * Functions and symbols cannot be part of a cache key and throw.
 */
export function serializeCachePart(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return stableSerialize(value, new Set());
  } catch (error) {
    throw new DatabaseError("Unable to serialize database cache key.", {
      cause: error,
    });
  }
}

function stableSerialize(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
    case "boolean":
      return String(value);
    case "bigint":
      return `${value.toString()}n`;
    case "function":
    case "symbol":
      throw new TypeError(`Cannot serialize a ${typeof value} as a cache key part.`);
    default:
      break;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '"Invalid Date"' : JSON.stringify(value.toISOString());
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError("Cannot serialize a circular structure as a cache key part.");
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item, seen)).join(",")}]`;
      }
      if (value instanceof Set) {
        return `Set[${[...value].map((item) => stableSerialize(item, seen)).sort().join(",")}]`;
      }
      if (value instanceof Map) {
        const entries = [...value.entries()]
          .map(([k, v]) => `${stableSerialize(k, seen)}=>${stableSerialize(v, seen)}`)
          .sort();
        return `Map{${entries.join(",")}}`;
      }
      if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
        return stableSerialize((value as { toJSON: () => unknown }).toJSON(), seen);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const fields = keys
        .filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`);
      return `{${fields.join(",")}}`;
    } finally {
      seen.delete(value);
    }
  }

  return JSON.stringify(String(value));
}

const inflightLoaders = new WeakMap<object, Map<string, Promise<unknown>>>();

/**
 * Wraps a cache around an asynchronous loader.
 *
 * Concurrent misses for the same key on the same cache share one loader
 * call (stampede protection). Values are stored only when the loader
 * resolves; `undefined` results are never cached.
 */
export async function getOrSet<TValue>(
  cache: DatabaseCache<TValue>,
  key: string,
  loader: () => Promise<TValue>,
  options?: CacheOptions,
): Promise<TValue> {
  validateKey(key);
  if (typeof loader !== "function") {
    throw new TypeError("A cache loader function is required.");
  }

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let inflight = inflightLoaders.get(cache);
  if (!inflight) {
    inflight = new Map();
    inflightLoaders.set(cache, inflight);
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<TValue>;

  const promise = (async () => {
    try {
      const value = await loader();
      if (value !== undefined) cache.set(key, value, options);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidates all entries whose keys start with a prefix.
 *
 * Matching is separator-aware: `"user"` matches `"user"` and `"user:…"`
 * but not `"users:…"`. Pass a prefix ending in the separator to match a
 * namespace only.
 */
export function invalidateByPrefix(
  cache: DatabaseCache,
  prefix: string,
): number {
  validateKey(prefix);
  if (typeof cache.keys !== "function") {
    throw new TypeError("The cache does not expose keys(); cannot invalidate by prefix.");
  }

  const normalized = prefix.endsWith(CACHE_KEY_SEPARATOR)
    ? prefix.slice(0, -CACHE_KEY_SEPARATOR.length)
    : prefix;
  const withSeparator = normalized + CACHE_KEY_SEPARATOR;

  let removed = 0;
  for (const key of cache.keys()) {
    if (key === normalized || key.startsWith(withSeparator)) {
      if (cache.delete(key)) removed += 1;
    }
  }
  return removed;
}

function isExpired<TValue>(entry: CacheEntry<TValue>): boolean {
  return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
}

function normalizeTtl(ttlMs?: number): number | undefined {
  if (ttlMs === undefined) return undefined;
  if (!Number.isFinite(ttlMs)) {
    throw new TypeError("Cache TTL must be a finite number.");
  }
  if (ttlMs < 0) {
    throw new TypeError("Cache TTL cannot be negative.");
  }
  return Math.floor(ttlMs);
}

function normalizeMaxEntries(maxEntries?: number): number | undefined {
  if (maxEntries === undefined) return undefined;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError("Cache maxEntries must be a positive integer.");
  }
  return maxEntries;
}

function validateKey(key: string): void {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new TypeError("A non-empty cache key is required.");
  }
}
