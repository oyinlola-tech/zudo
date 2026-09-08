/**
 * HTTP header format conversion utilities.
 *
 * @module httpHeaders/conversion
 */

import { HTTPHeaders } from "../http.headers.js";

import type { HTTPHeadersLike } from "../types/httpHeaders.type.js";
import { isIterableHeaders } from "../internal/httpHeaders.internal.typeGuards.js";

/**
 * Converts any supported header format into an {@link HTTPHeaders} instance.
 *
 * Entries whose name or value is malformed are skipped rather than thrown
 * on: the input is frequently a raw, attacker-supplied header bag, and a
 * read-only query such as `headerContains` must not be able to raise from
 * one bad field.
 *
 * @param headers - The headers to convert. If omitted, returns an empty instance.
 * @returns A new {@link HTTPHeaders} instance.
 */
export function toHTTPHeaders(headers?: HTTPHeadersLike): HTTPHeaders {
  if (headers === undefined) {
    return new HTTPHeaders();
  }

  if (headers instanceof HTTPHeaders) {
    return headers.clone();
  }

  return buildHTTPHeaders(headers);
}

/**
 * Returns an {@link HTTPHeaders} view of any supported header format
 * **without** copying when the input already is one.
 *
 * Read-only helpers should use this: `toHTTPHeaders` deep-copies the whole
 * map on every call, so checking five headers copies it five times.
 *
 * @param headers - The headers to view.
 * @returns The original instance, or a converted one.
 */
export function asHTTPHeaders(headers?: HTTPHeadersLike): HTTPHeaders {
  if (headers === undefined) {
    return new HTTPHeaders();
  }

  if (headers instanceof HTTPHeaders) {
    return headers;
  }

  return buildHTTPHeaders(headers);
}

/**
 * Builds a fresh {@link HTTPHeaders} from a non-{@link HTTPHeaders} input.
 *
 * @param headers - The headers to convert.
 * @returns A new instance holding every well-formed entry.
 */
function buildHTTPHeaders(headers: HTTPHeadersLike): HTTPHeaders {
  const result = new HTTPHeaders();

  if (headers instanceof Headers) {
    headers.forEach((value, name) => {
      appendSafely(result, name, value);
    });

    return result;
  }

  if (isIterableHeaders(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue;
      }

      appendSafely(result, String(entry[0]), String(entry[1]));
    }

    return result;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        appendSafely(result, name, String(item));
      }

      continue;
    }

    appendSafely(result, name, String(value));
  }

  return result;
}

/**
 * Appends one header entry, skipping it if it is malformed.
 *
 * @param headers - The target headers.
 * @param name - The header name.
 * @param value - The header value.
 */
function appendSafely(headers: HTTPHeaders, name: string, value: string): void {
  try {
    headers.append(name, value);
  } catch {
    /*
     * A malformed name or a value carrying CR/LF/NUL is dropped. Throwing
     * would turn a pure inspection call on attacker-supplied headers into an
     * unhandled 500.
     */
  }
}
