import type {
  QueryObject,
  QueryParseOptions,
  QueryPrimitive,
  QueryValue,
} from "../queryTypes/index.js";

import {
  createQueryContainer,
  DEFAULT_QUERY_MAX_DEPTH,
  HTTPQueryLimitError,
  isForbiddenQueryKey,
  isQueryObject,
  ownValue,
  resolveLimits,
} from "../queryTypes/index.js";

import {
  stripQueryPrefix,
  tokenizeQuery,
  tokenizeSearchParams,
} from "./queryParse.tokenizer.js";

/**
 * Parses a query string into a nested object.
 *
 * The returned objects have a `null` prototype: a parameter named
 * `__proto__` can never reach `Object.prototype`, and a lookup of an
 * unrelated key can never return an inherited member.
 */
export function parseQuery(
  query: string | URLSearchParams | undefined,
  options: QueryParseOptions = {},
): QueryObject {
  if (query === undefined) {
    return createQueryContainer();
  }

  const limits = resolveLimits(options);

  const maxDepth = options.maxDepth ?? DEFAULT_QUERY_MAX_DEPTH;

  const commaSeparated = options.commaSeparated === true;

  const entries =
    query instanceof URLSearchParams
      ? tokenizeSearchParams(query, limits, commaSeparated)
      : tokenizeQuery(
          stripQueryPrefix(query),
          limits,
          options.decode !== false,
          options.plusAsSpace !== false,
          commaSeparated,
        );

  const result = createQueryContainer();

  for (const [key, value] of entries) {
    appendQueryValue(result, parseQueryKey(key), value, maxDepth);
  }

  return result;
}

/**
 * Splits a bracket/dot path such as `a[b][c]` into its segments.
 *
 * A path containing `__proto__`, `constructor` or `prototype` yields an empty
 * array, which callers treat as "drop this parameter entirely".
 */
export function parseQueryKey(key: string): string[] {
  if (!key) {
    return [""];
  }

  const normalized = key.replace(/\]/g, "");

  const segments = normalized.split(/[.[\]]+/).filter((part) => part.length > 0);

  if (segments.some(isForbiddenQueryKey)) {
    return [];
  }

  return segments;
}

/**
 * Writes one value into the nested result object.
 *
 * Iterative rather than recursive so a deeply nested key cannot overflow the
 * stack, depth-capped so it cannot allocate without bound, and every level is
 * a null-prototype container read through `hasOwnProperty`.
 */
function appendQueryValue(
  target: Record<string, QueryValue>,
  path: readonly string[],
  value: string,
  maxDepth: number,
): void {
  if (path.length === 0) {
    return;
  }

  if (path.length > maxDepth) {
    throw new HTTPQueryLimitError(
      "Query parameter nesting exceeds the maximum allowed depth.",
    );
  }

  let current = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];

    if (segment === undefined) {
      continue;
    }

    const existing = ownValue(current, segment);

    if (isQueryObject(existing)) {
      current = existing as Record<string, QueryValue>;

      continue;
    }

    const next = createQueryContainer();

    current[segment] = next;

    current = next;
  }

  const leaf = path[path.length - 1];

  if (leaf === undefined) {
    return;
  }

  const existing = ownValue(current, leaf);

  if (existing === undefined) {
    current[leaf] = normalizeQueryValue(value);

    return;
  }

  if (Array.isArray(existing)) {
    existing.push(normalizeQueryValue(value));

    return;
  }

  current[leaf] = [existing, normalizeQueryValue(value)];
}

/**
 * Coerces the well-known literals and numbers that round-trip exactly.
 *
 * A numeric literal is only converted when `String(Number(value)) === value`,
 * so a 20-digit identifier stays the string it arrived as instead of being
 * silently rewritten to a different number.
 */
export function normalizeQueryValue(value: string): QueryPrimitive {
  if (value === "null") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const number = Number(value);

    if (Number.isFinite(number) && String(number) === value) {
      return number;
    }
  }

  return value;
}
