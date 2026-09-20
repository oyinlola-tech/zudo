import type { QueryLimits } from "../queryTypes/index.js";

import { HTTPQueryLimitError } from "../queryTypes/index.js";

/**
 * Percent-decodes a query component.
 *
 * A malformed sequence such as `%ZZ` makes `decodeURIComponent` throw a
 * `URIError`. Any client can send one, so the raw component is returned
 * instead of propagating an unhandled error onto the request path. The raw
 * bytes are never interpolated into an error message.
 */
export function decodeQueryComponent(
  value: string,
  decode = true,
  plusAsSpace = true,
): string {
  const input = plusAsSpace ? value.replace(/\+/g, " ") : value;

  if (!decode) {
    return input;
  }

  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export function stripQueryPrefix(input: string): string {
  let value = input;

  if (value.startsWith("?")) {
    value = value.slice(1);
  }

  const hashIndex = value.indexOf("#");

  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex);
  }

  return value;
}

/**
 * Splits a raw query string into decoded `[name, value]` pairs, enforcing
 * every configured limit as it goes.
 *
 * This is the single tokenizer for the module: {@link parseQuery} and
 * {@link parseQueryString} are both built on it — including their
 * `URLSearchParams` entry points — so the limits and the decoding rules
 * cannot drift apart.
 *
 * `maxKeys` counts *emitted* pairs, not `&`-separated segments. Counting
 * segments let `?a=1,2,3,...` expand past the cap under `commaSeparated`,
 * because the split happened after the check: a single parameter could yield
 * thousands of entries with `maxKeys` set to 1.
 */
export function tokenizeQuery(
  query: string,
  limits: QueryLimits,
  decode: boolean,
  plusAsSpace: boolean,
  commaSeparated: boolean,
): Array<readonly [string, string]> {
  if (query.length > limits.maxTotalLength) {
    throw new HTTPQueryLimitError(
      "Query string exceeds the maximum allowed length.",
    );
  }

  const entries: Array<readonly [string, string]> = [];

  const push = (key: string, value: string): void => {
    if (entries.length >= limits.maxKeys) {
      throw new HTTPQueryLimitError(
        "Query string contains too many parameters.",
      );
    }

    entries.push([key, value]);
  };

  for (const part of query.split("&")) {
    if (part === "") {
      continue;
    }

    const separator = part.indexOf("=");

    const rawKey = separator === -1 ? part : part.slice(0, separator);

    const rawValue = separator === -1 ? "" : part.slice(separator + 1);

    const key = decodeQueryComponent(rawKey, decode, plusAsSpace);

    if (key.length > limits.maxKeyLength) {
      throw new HTTPQueryLimitError(
        "Query parameter name exceeds the maximum allowed length.",
      );
    }

    const value = decodeQueryComponent(rawValue, decode, plusAsSpace);

    if (value.length > limits.maxValueLength) {
      throw new HTTPQueryLimitError(
        "Query parameter value exceeds the maximum allowed length.",
      );
    }

    if (commaSeparated && value.includes(",")) {
      for (const item of value.split(",")) {
        push(key, item);
      }

      continue;
    }

    push(key, value);
  }

  return entries;
}

/**
 * Tokenizes a `URLSearchParams` through the same path as a raw string.
 *
 * `toString()` re-encodes, and the tokenizer decodes again, so the round-trip
 * is lossless. Routing it through the tokenizer is what makes `maxTotalLength`
 * and `commaSeparated` apply here at all: the previous bespoke loop checked
 * only the per-key and per-value caps, so `parseQuery(new URLSearchParams(…))`
 * silently ignored two of the four documented limits and the comma option.
 */
export function tokenizeSearchParams(
  params: URLSearchParams,
  limits: QueryLimits,
  commaSeparated: boolean,
): Array<readonly [string, string]> {
  return tokenizeQuery(params.toString(), limits, true, true, commaSeparated);
}
