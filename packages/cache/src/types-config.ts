import type { CacheNamespace } from "./types-keys.js";
import type { CacheTTL } from "./types-values.js";
import type { CacheOperation } from "./types-metrics.js";
import type { CacheSerializer } from "./types-health.js";

export interface CacheConfig {
  readonly enabled?: boolean;
  readonly defaultTtl?: CacheTTL;
  readonly namespace?: CacheNamespace;
  readonly prefix?: string;
  readonly separator?: string;
  /**
   * When true, get/has return miss/false on adapter errors instead of
   * throwing, and set/delete return no-op results.
   */
  readonly failSilently?: boolean;
  readonly collectStats?: boolean;
  /**
   * Optional serializer applied by CacheService: values are serialized on
   * set and deserialized on get, so cached values are structural copies.
   * When omitted, values are stored by reference (memory adapter).
   */
  readonly serializer?: CacheSerializer;
}

export type CacheErrorCode =
  | "CACHE_DISABLED"
  | "CACHE_CONNECTION_FAILED"
  | "CACHE_TIMEOUT"
  | "CACHE_SERIALIZATION_FAILED"
  | "CACHE_DESERIALIZATION_FAILED"
  | "CACHE_OPERATION_FAILED"
  | "CACHE_INVALID_KEY"
  | "CACHE_INVALID_TTL"
  | "CACHE_ADAPTER_NOT_CONFIGURED"
  | "CACHE_NOT_SUPPORTED";

export interface CacheErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly operation?: CacheOperation;
  readonly key?: CacheKey;
}

import type { CacheKey } from "./types-keys.js";
