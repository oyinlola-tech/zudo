import type { HTTPRequest } from "../../httpTypes/http.types.js";

import type {
  QueryObject,
  QueryParseOptions,
  QueryValue,
} from "../queryTypes/index.js";

import {
  createQueryContainer,
  ownValue,
  queryValueToString,
} from "../queryTypes/index.js";

import { parseQuery } from "../queryParse/index.js";

/**
 * Extracts the query component of a request-target.
 *
 * The fragment is stripped: a proxy or a client that leaves `#…` on the
 * request line must not turn it into a parameter.
 */
function queryComponent(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return undefined;
  }

  const hashIndex = url.indexOf("#", queryIndex + 1);

  return url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
}

export function getQuery(
  request: HTTPRequest,
  options: QueryParseOptions = {},
): QueryObject {
  const query = queryComponent(request.url);

  if (query === undefined) {
    return createQueryContainer();
  }

  return parseQuery(query, options);
}

export function getQueryValue(
  request: HTTPRequest,
  key: string,
): QueryValue | undefined {
  return ownValue(getQuery(request) as Record<string, QueryValue>, key);
}

/**
 * Returns a single parameter as a string.
 *
 * A parameter that appeared more than once, or as a bracket path, has no
 * single string form and yields `undefined`; use {@link getQueryStrings} for
 * those. A literal `?a=null` yields `"null"` — the text the client sent.
 * This used to return `null` while declaring `string | undefined`, so a
 * caller doing `value.length` on a non-`undefined` result crashed.
 */
export function getQueryString(
  request: HTTPRequest,
  key: string,
): string | undefined {
  const value = getQueryValue(request, key);

  if (value === undefined || Array.isArray(value)) {
    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    return undefined;
  }

  return queryValueToString(value);
}

/**
 * Returns every value a parameter carries, as strings.
 *
 * The parsed shape is attacker-chosen: `?a[b]=1&a=2` puts a null-prototype
 * object inside the array for `a`, and `String()` on such an object throws
 * `TypeError: Cannot convert object to primitive value`. Stringifying through
 * {@link queryValueToString} keeps this total for every reachable input.
 */
export function getQueryStrings(request: HTTPRequest, key: string): string[] {
  const value = getQueryValue(request, key);

  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(queryValueToString);
  }

  return [queryValueToString(value)];
}

/**
 * Returns the raw search parameters of a request-target.
 *
 * This is the undecoded, unnested view. It applies none of the parser's
 * limits and drops no key, so prefer {@link getQuery} for anything that
 * reaches application code.
 */
export function getSearchParams(request: HTTPRequest): URLSearchParams {
  const query = queryComponent(request.url ?? "");

  if (query === undefined) {
    return new URLSearchParams();
  }

  return new URLSearchParams(query);
}

/**
 * Reports whether a parameter is present in the parsed query.
 *
 * Answers about the same object {@link getQuery} returns, not about the raw
 * search params. The two used to disagree: `hasQuery(req, "a")` was `false`
 * for `?a[b]=1` (which `getQuery` exposes as `a`), and
 * `hasQuery(req, "__proto__")` was `true` for a key the parser drops.
 */
export function hasQuery(request: HTTPRequest, key: string): boolean {
  return getQueryValue(request, key) !== undefined;
}

/** Number of distinct parameter names in the parsed query. */
export function querySize(request: HTTPRequest): number {
  return Object.keys(getQuery(request)).length;
}
