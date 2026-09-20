/**
 * HTTP router utility helpers.
 *
 * Request accessors, URL/query parsing, and path normalization shared by the
 * router core.
 */

import type { HttpRequestContext as RequestContext } from "../../../httpRequest/httpRequest.context.js";

import { parseRequestTarget } from "../../../httpRequest/target/httpRequest.target.js";

import { parseQueryString } from "../../../httpQuery/index.js";

import { InvalidRoutePatternError } from "../error/httpRouter.error.js";

export function getRequestMethod(request: RequestContext): string {
  const value = (
    request as unknown as {
      method?: string;
    }
  ).method;

  return (value ?? "GET").toUpperCase();
}

export function getRequestUrl(request: RequestContext): string {
  const value = (
    request as unknown as {
      url?: string | URL;
    }
  ).url;

  if (value instanceof URL) {
    return value.toString();
  }

  return value ?? "/";
}

export function getRequestSignal(
  request: RequestContext,
): AbortSignal | undefined {
  return (
    request as unknown as {
      signal?: AbortSignal;
    }
  ).signal;
}

/**
 * Parses a request-target with the canonical parser shared by the request
 * context and path-scoped middleware.
 */
export function parseUrl(value: string): URL {
  return parseRequestTarget(value);
}

/**
 * Builds the router's query record.
 *
 * Uses the same parser as the Node adapter's `request.query`
 * (`parseQueryString`): a repeated name is an array, the record has a `null`
 * prototype, and `__proto__` / `constructor` / `prototype` are dropped. The
 * two used to disagree (`ctx.query.role` an array, `request.getQuery("role")`
 * the last value), which let middleware and handlers read different values
 * for the same parameter.
 */
export function parseQuery(
  params: URLSearchParams,
): Readonly<Record<string, string | string[]>> {
  return Object.freeze(parseQueryString(params.toString()));
}

/* -------------------------------------------------------------------------- */
/* Path Helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes a **request** path.
 *
 * Strips the query string, forces a leading slash, collapses repeated
 * slashes, and trims a trailing slash.
 *
 * This must not be used on a route *pattern*: a pattern may legitimately
 * contain `?` (the optional-parameter marker), which this function treats as
 * the start of a query string. Use {@link normalizeRoutePattern} for
 * patterns.
 */
export function normalizePath(path: string): string {
  if (!path || path === "") {
    return "/";
  }

  const withoutQuery = path.split("?", 1)[0] ?? path;

  return collapsePath(withoutQuery);
}

/**
 * Normalizes a request path while preserving a single trailing slash.
 *
 * The trailing slash is the only information a strict-trailing-slash route
 * needs and {@link normalizePath} destroys it, so matching runs on this
 * spelling instead.
 *
 * @param path - The raw request path, possibly with a query or fragment.
 * @returns The normalized path, keeping one trailing slash if present.
 */
export function normalizeMatchPath(path: string): string {
  if (!path || path === "") {
    return "/";
  }

  const withoutQuery = path.split("?", 1)[0] ?? path;

  const withoutHash = withoutQuery.split("#", 1)[0] ?? withoutQuery;

  const collapsed = collapsePath(withoutHash);

  return hasTrailingSlash(withoutHash) && collapsed !== "/"
    ? `${collapsed}/`
    : collapsed;
}

/**
 * Normalizes a route **pattern**.
 *
 * Identical to {@link normalizePath} except that `?` is left alone, so the
 * documented optional-parameter syntax (`/users/:id?`, `/files/{name?}`)
 * survives registration.
 *
 * @param pattern - The raw route pattern.
 * @returns The normalized pattern.
 */
export function normalizeRoutePattern(pattern: string): string {
  if (!pattern || pattern === "") {
    return "/";
  }

  return collapsePath(pattern);
}

/**
 * Reports whether a path carries a meaningful trailing slash.
 *
 * @param path - The path to inspect.
 * @returns `true` when the path ends with `/` and is not the root path.
 */
export function hasTrailingSlash(path: string): boolean {
  const trimmed = path.replace(/\/{2,}/g, "/");

  return trimmed.length > 1 && trimmed.endsWith("/");
}

function collapsePath(value: string): string {
  let normalized = value.startsWith("/") ? value : `/${value}`;

  normalized = normalized.replace(/\/{2,}/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function splitPath(path: string): string[] {
  const normalized = normalizePath(path);

  if (normalized === "/") {
    return [];
  }

  return normalized.split("/").filter(Boolean);
}

/**
 * Splits a route pattern into its segments, keeping `?` markers intact.
 *
 * @param pattern - The raw route pattern.
 * @returns The pattern's non-empty segments.
 */
export function splitRoutePattern(pattern: string): string[] {
  const normalized = normalizeRoutePattern(pattern);

  if (normalized === "/") {
    return [];
  }

  return normalized.split("/").filter(Boolean);
}

export function validateParameterName(name: string, path: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
    throw new InvalidRoutePatternError(
      path,
      `Invalid parameter name "${name}".`,
    );
  }
}

export function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Characters and segment values that must never survive percent-decoding into
 * a route parameter.
 *
 * A single path segment is matched *before* it is decoded, so `%2e%2e%2f`
 * satisfies a `[^/]+`-shaped segment and then decodes to `../`. Any handler
 * that uses the parameter as a path component — the overwhelmingly common
 * case — receives a traversal payload the router has certified as one
 * segment.
 */
const TRAVERSAL_CHARS = /[/\\\u0000]/;

/**
 * Decodes one matched path segment, rejecting anything that would smuggle a
 * path separator, a NUL, or a `.`/`..` segment past the matcher.
 *
 * @param value - The raw (still percent-encoded) segment.
 * @returns The decoded segment, or `undefined` if the segment is malformed or
 *   carries a traversal payload. `undefined` must fail the match.
 */
export function decodeRouteSegment(value: string): string | undefined {
  let decoded: string;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    /* Malformed percent-encoding: `%zz`, a lone `%`, a truncated surrogate. */
    return undefined;
  }

  if (TRAVERSAL_CHARS.test(decoded)) {
    return undefined;
  }

  if (decoded === "." || decoded === "..") {
    return undefined;
  }

  return decoded;
}
