import type { CacheKey, CacheNamespace } from "./types-keys.js";
import type { CacheClearResult } from "./types-results.js";

export type CacheTag = string;

export interface CacheTagOptions {
  /**
   * Scopes the tag. Tags registered under one namespace are invisible to
   * lookups and invalidations made under another, so one tenant's
   * `invalidateByTag` can never reach another tenant's entries.
   */
  readonly namespace?: CacheNamespace;
}

export interface CacheTagStore {
  add(
    key: CacheKey,
    tags: readonly CacheTag[],
    options?: CacheTagOptions,
  ): Promise<void>;
  remove(
    key: CacheKey,
    tags: readonly CacheTag[],
    options?: CacheTagOptions,
  ): Promise<void>;
  getKeys(
    tag: CacheTag,
    options?: CacheTagOptions,
  ): Promise<readonly CacheKey[]>;
  invalidate(
    tag: CacheTag,
    options?: CacheTagOptions,
  ): Promise<CacheClearResult>;
  /** Removes all tag mappings for a key, across every namespace. */
  removeKey?(key: CacheKey): void;
  /** Removes all tag mappings. */
  clear?(): void;
}
