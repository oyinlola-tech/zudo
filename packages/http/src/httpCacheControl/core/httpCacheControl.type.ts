/**
 * Cache control types and constants.
 *
 * @module httpCacheControl/types
 */

export interface CacheControlDirectives {
  readonly noCache?: boolean;
  readonly noStore?: boolean;
  readonly noTransform?: boolean;
  readonly onlyIfCached?: boolean;
  readonly maxAge?: number;
  readonly maxStale?: number;
  readonly minFresh?: number;
  readonly sMaxAge?: number;
  readonly mustRevalidate?: boolean;
  readonly proxyRevalidate?: boolean;
  readonly mustUnderstand?: boolean;
  readonly private?: boolean;
  readonly public?: boolean;
  readonly immutable?: boolean;
  readonly staleWhileRevalidate?: number;
  readonly staleIfError?: number;
  readonly noCacheHeaders?: readonly string[];
}

export interface CacheControlOptions {
  readonly maxAge?: number;
  readonly maxStale?: number;
  readonly minFresh?: number;
  readonly mustUnderstand?: boolean;
  readonly noCacheHeaders?: readonly string[];
  readonly sMaxAge?: number;
  readonly noCache?: boolean;
  readonly noStore?: boolean;
  readonly mustRevalidate?: boolean;
  readonly proxyRevalidate?: boolean;
  readonly private?: boolean;
  readonly public?: boolean;
  readonly immutable?: boolean;
  readonly staleWhileRevalidate?: number;
  readonly staleIfError?: number;
  readonly noTransform?: boolean;
  readonly onlyIfCached?: boolean;
}

export interface CacheFreshness {
  readonly maxAge: number;
  readonly expires: Date | undefined;
  readonly date: Date | undefined;
  readonly age: number;
  readonly stale: boolean;
  readonly remaining: number;
}

export const CACHE_CONTROL_HEADER = "cache-control" as const;

export const DEFAULT_MAX_AGE = 0;
