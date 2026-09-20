import type {
  QueryObject,
  QueryStringifyOptions,
} from "../queryTypes/index.js";

import {
  DEFAULT_QUERY_MAX_DEPTH,
  HTTPQueryLimitError,
} from "../queryTypes/index.js";

/**
 * Serializes an object into a query string.
 *
 * Bounded in the same two ways the parser is. Nesting deeper than `maxDepth`
 * and any cycle both throw {@link HTTPQueryLimitError}; previously either one
 * produced a bare `RangeError: Maximum call stack size exceeded` from inside
 * the walk, which no caller could distinguish from an internal fault.
 */
export function stringifyQuery(
  query: QueryObject | Record<string, unknown>,
  options: QueryStringifyOptions = {},
): string {
  const params = new URLSearchParams();

  appendObjectToSearchParams(
    params,
    query as Record<string, unknown>,
    undefined,
    options.maxDepth ?? DEFAULT_QUERY_MAX_DEPTH,
    new Set<object>(),
  );

  return params.toString();
}

export function buildQueryString(
  query: QueryObject | Record<string, unknown>,
  options: QueryStringifyOptions = {},
): string {
  const value = stringifyQuery(query, options);

  return value ? `?${value}` : "";
}

/**
 * Walks one object level.
 *
 * `seen` is scoped to the current path — marked on descent, deleted on
 * ascent — so a value that legitimately appears twice in a DAG serializes
 * twice, while a value that contains itself is rejected. A set that is never
 * unmarked would reject the DAG instead.
 */
function appendObjectToSearchParams(
  params: URLSearchParams,
  object: Record<string, unknown>,
  prefix: string | undefined,
  remainingDepth: number,
  seen: Set<object>,
): void {
  if (remainingDepth <= 0) {
    throw new HTTPQueryLimitError(
      "Query object nesting exceeds the maximum allowed depth.",
    );
  }

  if (seen.has(object)) {
    throw new HTTPQueryLimitError("Query object contains a circular reference.");
  }

  seen.add(object);

  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}[${key}]` : key;

    appendValue(params, value, path, remainingDepth, seen);
  }

  seen.delete(object);
}

function appendValue(
  params: URLSearchParams,
  value: unknown,
  path: string,
  remainingDepth: number,
  seen: Set<object>,
): void {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    params.append(path, "null");

    return;
  }

  if (Array.isArray(value)) {
    if (remainingDepth <= 0) {
      throw new HTTPQueryLimitError(
        "Query object nesting exceeds the maximum allowed depth.",
      );
    }

    if (seen.has(value)) {
      throw new HTTPQueryLimitError(
        "Query object contains a circular reference.",
      );
    }

    seen.add(value);

    for (const item of value) {
      appendValue(params, item, path, remainingDepth - 1, seen);
    }

    seen.delete(value);

    return;
  }

  if (isPlainObject(value)) {
    appendObjectToSearchParams(
      params,
      value as Record<string, unknown>,
      path,
      remainingDepth - 1,
      seen,
    );

    return;
  }

  params.append(path, serializeQueryPrimitive(value));
}

function serializeQueryPrimitive(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;

  return prototype === Object.prototype || prototype === null;
}
