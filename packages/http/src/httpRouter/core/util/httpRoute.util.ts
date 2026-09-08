/**
 * HTTP router utility helpers.
 *
 * Request accessors, URL/query parsing, and path normalization shared by the
 * router core.
 */

import type { HttpRequestContext as RequestContext } from "../../../httpRequest/httpRequest.context.js";

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

export function parseUrl(value: string): URL {
  try {
    return new URL(value, "http://zudojs.local");
  } catch {
    return new URL("/", "http://zudojs.local");
  }
}

export function parseQuery(
  params: URLSearchParams,
): Readonly<Record<string, string | string[]>> {
  const result: Record<string, string | string[]> = {};

  for (const key of new Set(Array.from(params.keys()))) {
    const values = params.getAll(key);

    result[key] = values.length > 1 ? values : (values[0] ?? "");
  }

  return Object.freeze({
    ...result,
  });
}

/* -------------------------------------------------------------------------- */
/* Path Helpers                                                               */
/* -------------------------------------------------------------------------- */

export function normalizePath(path: string): string {
  if (!path || path === "") {
    return "/";
  }

  const withoutQuery = path.split("?", 1)[0] ?? path;

  let normalized = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;

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
