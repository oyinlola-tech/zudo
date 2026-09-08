import type { CacheKey } from "./types-keys.js";

/**
 * Time-to-live in milliseconds. `null` means the entry never expires.
 */
export type CacheTTL = number | null;
export type CacheExpiration = CacheTTL | undefined;

/**
 * A cached entry with its metadata, as returned on `CacheGetResult.entry`
 * by adapters that retain per-entry metadata (the memory adapter does).
 */
export interface CacheEntry<TValue = unknown> {
  readonly key: CacheKey;
  readonly value: TValue;
  readonly createdAt?: Date;
  readonly expiresAt?: Date | null;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
