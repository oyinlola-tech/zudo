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
  /**
   * Removes all tag mappings for a key, across every namespace.
   *
   * May be async: `CacheService` awaits it, so a shared (e.g. Redis-backed)
   * store can complete the removal before the write is reported.
   */
  removeKey?(key: CacheKey): void | Promise<void>;
  /** Removes all tag mappings. May be async. */
  clear?(): void | Promise<void>;
  /**
   * Every key that currently has at least one tag mapping. Used to drop the
   * mappings of keys removed by a pattern clear; when absent, those mappings
   * are left for the next write or tag invalidation of the key.
   */
  trackedKeys?(): readonly CacheKey[] | Promise<readonly CacheKey[]>;
}
