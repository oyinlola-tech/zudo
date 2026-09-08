/**
 * Header list mutation utilities.
 *
 * @module httpHeaders/listMutation
 */

import type { HTTPHeaders } from "../http.headers.js";
import { getHeaderValues } from "../list/httpHeaders.list.js";
import { headerContains } from "../basic/httpHeaders.basicMatch.js";

/**
 * Appends a value to a header only if it is not already present.
 *
 * @param headers - The headers to modify.
 * @param name - The header name.
 * @param value - The value to append.
 * @returns The modified headers instance.
 */
export function appendUniqueHeaderValue(
  headers: HTTPHeaders,
  name: string,
  value: string,
): HTTPHeaders {
  if (headerContains(headers, name, value)) {
    return headers;
  }

  return headers.append(name, value);
}

/**
 * Removes a specific value from a comma-separated header.
 *
 * @param headers - The headers to modify.
 * @param name - The header name.
 * @param value - The value to remove.
 * @returns The modified headers instance.
 */
export function removeHeaderValue(
  headers: HTTPHeaders,
  name: string,
  value: string,
): HTTPHeaders {
  const existing = getHeaderValues(headers, name);

  const filtered = existing.filter(
    (item) => item.toLowerCase() !== value.trim().toLowerCase(),
  );

  if (filtered.length === 0) {
    headers.delete(name);

    return headers;
  }

  headers.set(name, filtered.join(", "));

  return headers;
}
