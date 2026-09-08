/**
 * Request-related cache control helpers.
 *
 * @module httpCacheControl/requestHelpers
 */

import type { CacheControlDirectives } from "./core/httpCacheControl.type.js";

import { parseCacheControl } from "./core/httpCacheControl.parse.js";

/**
 * Checks if a specific cache directive is present.
 *
 * Valued directives (`maxAge`, `sMaxAge`, `staleWhileRevalidate`,
 * `noCacheHeaders`, …) are stored as numbers or arrays, not `true`, so a
 * strict equality against `true` answered "no" for every one of them.
 *
 * @param directives - The parsed directives.
 * @param directive - The directive to look for.
 * @returns `true` if the directive was present in the header.
 */
export function hasCacheDirective(
  directives: CacheControlDirectives,
  directive: keyof CacheControlDirectives,
): boolean {
  const value = directives[directive];

  return value !== undefined && value !== false;
}

/**
 * Gets the value of a specific cache directive.
 */
export function getCacheDirective(
  directives: CacheControlDirectives,
  directive: keyof CacheControlDirectives,
): string | number | boolean | readonly string[] | undefined {
  return directives[directive];
}

/**
 * Determines if a request requires cache revalidation.
 */
export function requestRequiresRevalidation(
  header: string | undefined,
): boolean {
  const directives = parseCacheControl(header);
  return directives.noCache === true || directives.mustRevalidate === true;
}

/**
 * Determines if a request only uses cached responses.
 */
export function requestOnlyIfCached(header: string | undefined): boolean {
  const directives = parseCacheControl(header);
  return directives.onlyIfCached === true;
}

/**
 * Gets the maximum stale age from request directives.
 */
export function getMaximumStaleAge(
  header: string | undefined,
): number | undefined {
  const directives = parseCacheControl(header);
  return directives.maxStale;
}

/**
 * Gets the minimum freshness required from request directives.
 */
export function getMinimumFreshness(
  header: string | undefined,
): number | undefined {
  const directives = parseCacheControl(header);
  return directives.minFresh;
}
