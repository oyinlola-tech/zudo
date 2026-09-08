/**
 * Header value comparison utilities.
 *
 * @module httpHeaders/basicMatch
 */

import type {
  HTTPHeadersLike,
  HeaderMatchOptions,
} from "../types/httpHeaders.type.js";
import { asHTTPHeaders } from "../conversion/httpHeaders.conversion.js";

/**
 * Checks if a header equals an expected value.
 *
 * @param headers - The headers to inspect.
 * @param name - The header name.
 * @param expected - The expected value.
 * @param options - Matching options (case sensitivity, trimming).
 * @returns `true` if the header value matches.
 */
export function headerEquals(
  headers: HTTPHeadersLike,
  name: string,
  expected: string,
  options: HeaderMatchOptions = {},
): boolean {
  const actual = asHTTPHeaders(headers).get(name);

  if (actual === undefined) {
    return false;
  }

  const left = options.trim === false ? actual : actual.trim();

  const right = options.trim === false ? expected : expected.trim();

  if (options.caseSensitive) {
    return left === right;
  }

  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Checks if a header's comma-separated values contain a specific value.
 *
 * @param headers - The headers to inspect.
 * @param name - The header name.
 * @param value - The value to search for.
 * @returns `true` if the value is found among the header's values.
 */
export function headerContains(
  headers: HTTPHeadersLike,
  name: string,
  value: string,
): boolean {
  const actual = asHTTPHeaders(headers).get(name);

  if (actual === undefined) {
    return false;
  }

  return actual
    .split(",")
    .some((item) => item.trim().toLowerCase() === value.trim().toLowerCase());
}
