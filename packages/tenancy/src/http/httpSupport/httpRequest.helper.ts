/**
 * Portable reads from an HTTP request's headers.
 *
 * @module http/httpRequest.helper
 */

import type { HttpRequestBag, HttpRequestContext } from "../httpTypes.js";

/** Read one entry from a map-shaped or record-shaped bag, case-insensitively. */
function readBag(
  bag: HttpRequestBag<string> | undefined,
  name: string,
): string | undefined {
  if (!bag) return undefined;
  const lower = name.toLowerCase();

  if (typeof (bag as ReadonlyMap<string, string>).get === "function") {
    const map = bag as ReadonlyMap<string, string>;
    const direct = map.get(lower) ?? map.get(name);
    if (direct !== undefined) return direct;
    for (const [key, value] of map) {
      if (key.toLowerCase() === lower) return value;
    }
    return undefined;
  }

  const record = bag as Readonly<Record<string, string | undefined>>;
  if (Object.hasOwn(record, lower)) return record[lower];
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) return record[key];
  }
  return undefined;
}

/**
 * Read a request header, whatever shape the request carries.
 *
 * The real `@zudojs/http` request exposes `headers` as a frozen plain object
 * and a `getHeader(name)` accessor; the local mirror used to type `headers`
 * as a `ReadonlyMap` and call `.get()`, which threw on every real request.
 * `getHeader` is preferred when present, then a `Map`/`Headers`-like `get`,
 * then a plain object — each case-insensitive.
 */
export function readRequestHeader(
  request: HttpRequestContext,
  name: string,
): string | undefined {
  if (typeof request.getHeader === "function") {
    const value = request.getHeader(name);
    if (value !== undefined) return value;
  }
  return readBag(request.headers, name);
}
