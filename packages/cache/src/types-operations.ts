import type { CacheTTL } from "./types-values.js";

/**
 * Adapter-level operation options.
 *
 * NOTE: Adapters always receive fully-qualified keys. Namespace and prefix
 * resolution happens in `CacheService` / the key builder, so adapter-level
 * options intentionally carry no `namespace` field — every option present
 * here is honored by the adapter.
 */

export interface CacheSetOptions {
  readonly ttl?: CacheTTL;
  readonly tags?: readonly string[];
  /**
   * When `false`, the set is skipped if the key already exists (the result
   * carries `skipped: true` and `success: false`). Defaults to `true`.
   */
  readonly overwrite?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CacheClearOptions {
  /** Glob pattern of fully-qualified keys to clear. Omit to clear everything. */
  readonly pattern?: string;
}

export interface CacheKeysOptions {
  readonly pattern?: string;
  readonly limit?: number;
}

export interface CacheSetManyOptions {
  readonly ttl?: CacheTTL;
  readonly overwrite?: boolean;
}
