/**
 * Header list reading utilities.
 *
 * @module httpHeaders/list
 */

import type { HTTPHeadersLike } from "../types/httpHeaders.type.js";
import { asHTTPHeaders } from "../conversion/httpHeaders.conversion.js";

/**
 * Maximum number of elements parsed from one list-valued header.
 */
export const MAX_HEADER_LIST_ELEMENTS = 64;

/**
 * Splits a comma-separated header value into its list elements.
 *
 * The split honours `quoted-string` per RFC 9110 section 5.6.1: a comma
 * inside quotes is data, not a delimiter, so `W/"foo,bar", "baz"` is two
 * elements rather than three fragments — which is what made conditional
 * requests silently fail to match.
 *
 * @param value - The raw header value string.
 * @returns The trimmed, non-empty elements, capped at
 *   {@link MAX_HEADER_LIST_ELEMENTS}.
 */
export function splitHeaderValues(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  const result: string[] = [];

  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }

    if (character === "," && !quoted) {
      pushHeaderListElement(result, current);
      current = "";

      if (result.length >= MAX_HEADER_LIST_ELEMENTS) {
        return result;
      }

      continue;
    }

    current += character;
  }

  pushHeaderListElement(result, current);

  return result.slice(0, MAX_HEADER_LIST_ELEMENTS);
}

/**
 * Appends one trimmed, non-empty list element.
 *
 * @param result - The accumulating element list.
 * @param value - The raw element.
 */
function pushHeaderListElement(result: string[], value: string): void {
  const trimmed = value.trim();

  if (trimmed.length > 0) {
    result.push(trimmed);
  }
}

/**
 * Retrieves all comma-separated values for a header as an array.
 *
 * @param headers - The headers to inspect.
 * @param name - The header name.
 * @returns An array of trimmed values.
 */
export function getHeaderValues(
  headers: HTTPHeadersLike,
  name: string,
): string[] {
  return splitHeaderValues(asHTTPHeaders(headers).get(name));
}
