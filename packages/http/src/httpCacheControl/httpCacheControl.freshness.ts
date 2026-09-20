/**
 * Cache freshness calculations.
 *
 * @module httpCacheControl/freshness
 */

import type { CacheFreshness } from "./core/httpCacheControl.type.js";

import { parseCacheControl } from "./core/httpCacheControl.parse.js";

/**
 * Calculates the freshness of a cached response.
 *
 * `s-maxage` is preferred over `max-age`, and `Expires` is used when neither
 * is present. `no-cache` and `no-store` force the response stale — a response
 * the origin marked must-revalidate-before-reuse must never be reported
 * fresh.
 *
 * The response's current age follows RFC 9111 section 4.2.3: the `Age`
 * header plus the time elapsed since the response's `Date`. Reading `Age`
 * alone — as this used to — left every response without that header aged
 * `0` forever, so `isFresh()` answered `true` for a response of any age.
 *
 * @param responseHeaders - The cached response's headers.
 * @param responseDate - The response's `Date`, if already parsed.
 * @param now - The current time, defaulting to `Date.now()`.
 * @returns The freshness calculation.
 */
export function calculateFreshness(
  responseHeaders: Readonly<Record<string, string>>,
  responseDate?: Date,
  now: Date = new Date(),
): CacheFreshness {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);

  const date = responseDate ?? parseDateHeader(responseHeaders["date"], now);

  /*
   * RFC 9111 section 5.1: Age is a non-negative delta-seconds. A negative or
   * suffixed value would otherwise inflate freshness without bound, which
   * pins a poisoned response in cache far past the origin's TTL.
   */
  const rawAge = (responseHeaders["age"] ?? "").trim();

  const ageHeader = /^\d+$/.test(rawAge) ? Number(rawAge) : 0;

  const residentSeconds = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 1_000),
  );

  const age = ageHeader + residentSeconds;

  const expiresHeader = responseHeaders["expires"];

  const expires = expiresHeader ? parseExpires(expiresHeader) : undefined;

  const effectiveMaxAge = resolveMaxAge(directives, expires, date);

  /*
   * With an `Expires`-derived lifetime this reduces to `expires - now`,
   * because the lifetime is measured from `Date` and the age is measured to
   * `now`.
   */
  const remaining = Math.max(0, effectiveMaxAge - age);

  const stale =
    remaining <= 0 ||
    directives.noCache === true ||
    directives.noStore === true;

  return {
    maxAge: effectiveMaxAge,
    expires,
    date,
    age,
    stale,
    remaining,
  };
}

/**
 * Parses a `Date` header, falling back to the current time.
 *
 * @param value - The raw `Date` value.
 * @param now - The fallback instant.
 * @returns The parsed date.
 */
function parseDateHeader(value: string | undefined, now: Date): Date {
  if (value === undefined) {
    return now;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

/**
 * Parses an `Expires` header, treating an unparseable value as expired.
 *
 * @param value - The raw `Expires` value.
 * @returns The parsed date, or the epoch when it cannot be parsed.
 */
function parseExpires(value: string): Date {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * Resolves the freshness lifetime in seconds.
 *
 * @param directives - The parsed Cache-Control directives.
 * @param expires - The parsed `Expires` header, if present.
 * @param date - The response's `Date`.
 * @returns The freshness lifetime in seconds.
 */
function resolveMaxAge(
  directives: ReturnType<typeof parseCacheControl>,
  expires: Date | undefined,
  date: Date,
): number {
  if (directives.sMaxAge !== undefined) {
    return directives.sMaxAge;
  }

  if (directives.maxAge !== undefined) {
    return directives.maxAge;
  }

  if (expires) {
    return Math.max(
      0,
      Math.floor((expires.getTime() - date.getTime()) / 1_000),
    );
  }

  return 0;
}

/**
 * Determines if a cached response is still fresh.
 */
export function isFresh(
  responseHeaders: Readonly<Record<string, string>>,
  requestHeaders?: Readonly<Record<string, string>>,
): boolean {
  const freshness = calculateFreshness(responseHeaders);

  if (freshness.stale) {
    return false;
  }

  if (requestHeaders) {
    const reqCacheControl = requestHeaders["cache-control"];
    const reqDirectives = parseCacheControl(reqCacheControl);

    if (
      reqDirectives.maxAge !== undefined &&
      freshness.age >= reqDirectives.maxAge
    ) {
      return false;
    }

    if (reqDirectives.minFresh !== undefined) {
      const remaining = freshness.remaining;
      if (remaining < reqDirectives.minFresh) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Gets the remaining freshness in seconds.
 */
export function getRemainingFreshness(
  responseHeaders: Readonly<Record<string, string>>,
): number {
  const freshness = calculateFreshness(responseHeaders);
  return freshness.remaining;
}

/**
 * Determines if a stale response can be served while revalidating.
 */
export function canServeStaleWhileRevalidate(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return (
    directives.staleWhileRevalidate !== undefined &&
    directives.staleWhileRevalidate > 0
  );
}

/**
 * Determines if a stale response can be served on error.
 */
export function canServeStaleIfError(
  responseHeaders: Readonly<Record<string, string>>,
): boolean {
  const cacheControl = responseHeaders["cache-control"];
  const directives = parseCacheControl(cacheControl);
  return directives.staleIfError !== undefined && directives.staleIfError > 0;
}
