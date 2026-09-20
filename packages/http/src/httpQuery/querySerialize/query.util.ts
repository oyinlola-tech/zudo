import type { QueryObject, QueryValue } from "../queryTypes/index.js";

import {
  createQueryContainer,
  DEFAULT_QUERY_MAX_DEPTH,
  HTTPQueryLimitError,
  isForbiddenQueryKey,
  isQueryObject,
  ownValue,
} from "../queryTypes/index.js";

/**
 * Deep-copies a parsed query object.
 *
 * Structural rather than a `JSON.parse(JSON.stringify(…))` round-trip. That
 * round-trip rebuilt every level with `Object.prototype`, so the clone of a
 * hardened, null-prototype query silently regained `toString`, `constructor`
 * and every other inherited member — the exact property the parser exists to
 * guarantee. It also violated the repo rule against calling `JSON` directly.
 */
export function cloneQuery(query: QueryObject): QueryObject {
  return cloneQueryObject(query, DEFAULT_QUERY_MAX_DEPTH);
}

function cloneQueryObject(source: QueryObject, depth: number): QueryObject {
  if (depth <= 0) {
    throw new HTTPQueryLimitError(
      "Query object nesting exceeds the maximum allowed depth.",
    );
  }

  const result = createQueryContainer();

  for (const [key, value] of Object.entries(source)) {
    if (isForbiddenQueryKey(key)) {
      continue;
    }

    result[key] = cloneQueryValue(value, depth);
  }

  return result;
}

function cloneQueryValue(value: QueryValue, depth: number): QueryValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneQueryValue(item, depth - 1));
  }

  if (isQueryObject(value)) {
    return cloneQueryObject(value, depth - 1);
  }

  return value;
}

/**
 * Merges query objects left to right into a fresh null-prototype object.
 *
 * Every value is deep-copied on the way in. Assigning the source's own
 * nested object by reference made the result alias its inputs, so mutating
 * `merged.a.b` also changed the source query the caller had already handed
 * to something else.
 */
export function mergeQuery(...queries: QueryObject[]): QueryObject {
  const result = createQueryContainer();

  for (const query of queries) {
    mergeQueryObject(result, query, DEFAULT_QUERY_MAX_DEPTH);
  }

  return result;
}

function mergeQueryObject(
  target: Record<string, QueryValue>,
  source: QueryObject,
  depth: number,
): void {
  if (depth <= 0) {
    throw new HTTPQueryLimitError(
      "Query object nesting exceeds the maximum allowed depth.",
    );
  }

  for (const [key, value] of Object.entries(source)) {
    if (isForbiddenQueryKey(key)) {
      continue;
    }

    const existing = ownValue(target, key);

    if (isQueryObject(existing) && isQueryObject(value)) {
      mergeQueryObject(
        existing as Record<string, QueryValue>,
        value,
        depth - 1,
      );

      continue;
    }

    target[key] = cloneQueryValue(value, depth);
  }
}
