/**
 * Response-related cache control helpers.
 *
 * @module httpCacheControl/responseHelpers
 */

import { parseCacheControl } from "./core/httpCacheControl.parse.js";

/**
 * Determines if a response is storable by a **shared** cache.
 *
 * RFC 9111 section 3.5: a response to an `Authorization`-bearing request may
 * only be stored when it carries `must-revalidate`, `public` or `s-maxage`.
 * `private` is not sufficient — it is the directive meaning *"do not store
 * this in a shared cache"*, so accepting it authorised the canonical
 * shared-cache authentication bypass.
 *
 * @param responseHeaders - The response headers.
 * @param requestHeaders - The originating request's headers.
 * @returns `true` if the response may be stored.
 */
export function isResponseStorable(
  responseHeaders: Readonly<Record<string, string>>,
  requestHeaders?: Readonly<Record<string, string>>,
): boolean {
  const directives = parseCacheControl(responseHeaders["cache-control"]);

  if (directives.noStore) {
    return false;
  }

  if (parseCacheControl(requestHeaders?.["cache-control"]).noStore) {
    return false;
  }

  const authHeader = requestHeaders?.["authorization"];

  if (
    authHeader &&
    !(
      directives.public === true ||
      directives.mustRevalidate === true ||
      directives.sMaxAge !== undefined
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Determines if a response is explicitly public.
 */
export function isResponsePublic(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return directives.public === true;
}

/**
 * Determines if a response is explicitly private.
 */
export function isResponsePrivate(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return directives.private === true;
}

/**
 * Determines if a response is immutable.
 */
export function isImmutable(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return directives.immutable === true;
}

/**
 * Determines if a response allows transformation.
 */
export function allowsTransformation(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return directives.noTransform !== true;
}

/**
 * Gets the effective max-age for a response.
 */
export function getEffectiveMaxAge(
  responseHeaders: Readonly<Record<string, string>>,
): number {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);

  if (directives.maxAge !== undefined) {
    return directives.maxAge;
  }

  const expires = responseHeaders["expires"];
  if (expires) {
    const expiresDate = new Date(expires);
    const now = new Date();
    const diff = Math.floor((expiresDate.getTime() - now.getTime()) / 1000);
    return Math.max(0, diff);
  }

  return 0;
}
