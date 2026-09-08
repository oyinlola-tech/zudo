import type { CacheKey } from "./types-keys.js";
import type { CacheTTL } from "./types-values.js";
import type {
  CacheClearOptions,
  CacheKeysOptions,
  CacheSetManyOptions,
  CacheSetOptions,
} from "./types-operations.js";
import type {
  CacheClearResult,
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheGetResult,
  CacheSetResult,
} from "./types-results.js";

/**
 * Low-level cache adapter contract.
 *
 * Adapters operate on fully-qualified keys — namespace/prefix resolution is
 * the responsibility of `CacheService` and the key builder. Adapters only
 * understand raw keys and glob patterns.
 */
export interface CacheAdapter {
  readonly name: string;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  get<TValue = unknown>(key: CacheKey): Promise<CacheGetResult<TValue>>;
  set<TValue = unknown>(
    key: CacheKey,
    value: TValue,
    options?: CacheSetOptions,
  ): Promise<CacheSetResult>;
  delete(key: CacheKey): Promise<CacheDeleteResult>;
  has(key: CacheKey): Promise<boolean>;
  clear(options?: CacheClearOptions): Promise<CacheClearResult>;
  keys?(options?: CacheKeysOptions): Promise<readonly CacheKey[]>;
  getMany?<TValue = unknown>(
    keys: readonly CacheKey[],
  ): Promise<ReadonlyMap<CacheKey, CacheGetResult<TValue>>>;
  setMany?<TValue = unknown>(
    entries: ReadonlyMap<CacheKey, TValue>,
    options?: CacheSetManyOptions,
  ): Promise<readonly CacheSetResult[]>;
  deleteMany?(keys: readonly CacheKey[]): Promise<CacheDeleteManyResult>;
  /**
   * Remaining TTL for a key in milliseconds.
   * - `undefined` — the key does not exist (or has expired)
   * - `null` — the key exists and never expires
   * - `number` — remaining milliseconds until expiry
   */
  ttl?(key: CacheKey): Promise<number | null | undefined>;
  expire?(key: CacheKey, ttl: CacheTTL): Promise<boolean>;
  /** Number of live entries currently held, when the adapter can report it. */
  size?(): Promise<number | undefined>;
}

export interface CacheStore extends CacheAdapter {}
