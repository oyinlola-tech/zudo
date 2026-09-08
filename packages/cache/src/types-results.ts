import type { CacheKey } from "./types-keys.js";
import type { CacheEntry } from "./types-values.js";

export interface CacheGetResult<TValue = unknown> {
  readonly hit: boolean;
  readonly value: TValue | null;
  readonly entry?: CacheEntry<TValue>;
}

export interface CacheSetResult {
  readonly success: boolean;
  readonly key: CacheKey;
  readonly expiresAt: Date | null;
  /** True when the set was skipped because the key exists and `overwrite: false` was passed. */
  readonly skipped?: boolean;
}

export interface CacheDeleteResult {
  readonly deleted: boolean;
  readonly key: CacheKey;
}

export interface CacheDeleteManyResult {
  readonly deleted: number;
  readonly keys: readonly CacheKey[];
}

export interface CacheClearResult {
  readonly cleared: number;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly sets: number;
  readonly deletes: number;
  readonly errors: number;
  readonly size?: number;
  readonly hitRate: number;
}
