import type { CacheKey } from "./types-keys.js";

export type CacheValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | readonly unknown[];
export type SerializableCacheValue = CacheValue;

/**
 * Time-to-live in milliseconds. `null` means the entry never expires.
 */
export type CacheTTL = number | null;
export type CacheExpiration = CacheTTL | undefined;

export interface CacheExpirationInfo {
  readonly ttl: number | null;
  readonly expiresAt: Date | null;
}

export interface CacheEntry<TValue = unknown> {
  readonly key: CacheKey;
  readonly value: TValue;
  readonly createdAt?: Date;
  readonly expiresAt?: Date | null;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CacheEntryMetadata {
  readonly createdAt?: Date;
  readonly expiresAt?: Date | null;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
