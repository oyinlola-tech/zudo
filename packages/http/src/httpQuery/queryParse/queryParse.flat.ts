import type { QueryStringParseOptions } from "../queryTypes/index.js";

import {
  createQueryContainer,
  isForbiddenQueryKey,
  ownValue,
  resolveLimits,
} from "../queryTypes/index.js";

import { stripQueryPrefix, tokenizeQuery } from "./queryParse.tokenizer.js";

/**
 * Parses a query string into a flat record of decoded values.
 *
 * Unlike {@link parseQuery} this applies no bracket-path nesting and no value
 * coercion: every value is the decoded string, and a repeated name yields an
 * array. Both functions share one tokenizer and one set of limits.
 *
 * The record has a `null` prototype and `__proto__` / `constructor` /
 * `prototype` are dropped, so no parameter name can reach a prototype chain.
 */
export function parseQueryString(
  input: string | undefined | null,
  options: QueryStringParseOptions = {},
): Record<string, string | string[]> {
  const result = createQueryContainer() as Record<string, string | string[]>;

  if (input === undefined || input === null || input === "") {
    return result;
  }

  const value = stripQueryPrefix(input);

  if (value.length === 0) {
    return result;
  }

  const allowEmptyKeys = options.allowEmptyKeys ?? true;

  const entries = tokenizeQuery(
    value,
    resolveLimits(options),
    true,
    options.decodePlusAsSpace !== false,
    false,
  );

  for (const [key, item] of entries) {
    if (!allowEmptyKeys && key.length === 0) {
      continue;
    }

    if (isForbiddenQueryKey(key)) {
      continue;
    }

    const existing = ownValue(result, key);

    if (existing === undefined) {
      result[key] = item;

      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(item);

      continue;
    }

    result[key] = [existing, item];
  }

  return result;
}
