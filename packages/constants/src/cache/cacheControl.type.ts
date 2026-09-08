/**
 * Cache control header constants and builder.
 *
 * @module cache/cacheControl
 */

import { type CacheStrategy } from "./cacheStrategy.type.js";
import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";
import { TimeMs } from "../time/time.constant.js";

/** Milliseconds per second, for deriving second-based durations from {@link TimeMs}. */
const MS_PER_SECOND = TimeMs.SECOND;

/**
 * Default cache durations in **seconds** (the unit `Cache-Control` uses) for
 * different resource types.
 *
 * Derived from {@link TimeMs} (milliseconds) so the two never drift apart.
 */
export const CacheDuration = Object.freeze({
  /** No caching */
  NONE: 0,
  /** Very short cache (10 seconds) — API data */
  SHORT: (10 * TimeMs.SECOND) / MS_PER_SECOND,
  /** Medium cache (5 minutes) — semi-dynamic content */
  MEDIUM: (5 * TimeMs.MINUTE) / MS_PER_SECOND,
  /** Long cache (1 hour) — static content */
  LONG: TimeMs.HOUR / MS_PER_SECOND,
  /** Very long cache (1 day) — immutable assets */
  VERY_LONG: TimeMs.DAY / MS_PER_SECOND,
  /** One week — versioned assets */
  WEEK: TimeMs.WEEK / MS_PER_SECOND,
} as const);

/**
 * Options for building a Cache-Control header value.
 */
export interface CacheControlOptions {
  /** The caching strategy */
  readonly strategy: CacheStrategy;
  /** Max age in seconds */
  readonly maxAge?: number;
  /** Stale-while-revalidate duration in seconds */
  readonly staleWhileRevalidate?: number;
  /** Shared (proxy) cache max age in seconds — emits the s-maxage directive */
  readonly sharedMaxAge?: number;
}

/**
 * Assert that a cache duration is a non-negative finite integer.
 */
function assertCacheSeconds(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidConstantError(
      `buildCacheControl: ${name} must be a non-negative finite integer, got ${String(value)}`,
    );
  }
}

/**
 * Build a Cache-Control header value from options.
 *
 * When the strategy is `no-store`, all duration directives (`max-age`,
 * `stale-while-revalidate`, `s-maxage`) are ignored — combining them with
 * `no-store` is invalid per RFC 9111.
 *
 * @param options - Cache control options
 * @returns Cache-Control header string
 * @throws {InvalidConstantError} if any provided duration is not a
 * non-negative finite integer
 */
export function buildCacheControl(options: CacheControlOptions): string {
  if (options.maxAge !== undefined) {
    assertCacheSeconds("maxAge", options.maxAge);
  }
  if (options.staleWhileRevalidate !== undefined) {
    assertCacheSeconds("staleWhileRevalidate", options.staleWhileRevalidate);
  }
  if (options.sharedMaxAge !== undefined) {
    assertCacheSeconds("sharedMaxAge", options.sharedMaxAge);
  }

  const parts: string[] = [options.strategy];
  if (options.strategy === "no-store") {
    return parts.join(", ");
  }
  if (options.maxAge !== undefined) {
    parts.push(`max-age=${options.maxAge}`);
  }
  if (options.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }
  if (options.sharedMaxAge !== undefined) {
    parts.push(`s-maxage=${options.sharedMaxAge}`);
  }
  return parts.join(", ");
}
