/**
 * Forwarded / proxy header utilities.
 *
 * @module httpHeaders/forwarded
 */

import type { HTTPHeadersLike } from "../types/httpHeaders.type.js";
import {
  getHeaderValues,
  splitHeaderValues,
} from "../list/httpHeaders.list.js";

/**
 * Retrieves all forwarded values for a header, splitting nested comma-separated values.
 *
 * @param headers - The headers to inspect.
 * @param name - The header name (e.g. `"Forwarded"` or `"X-Forwarded-For"`).
 * @returns An array of all forwarded values.
 */
export function getForwardedValues(
  headers: HTTPHeadersLike,
  name: string,
): string[] {
  return getHeaderValues(headers, name).flatMap((value) =>
    splitHeaderValues(value),
  );
}

/**
 * Retrieves the leftmost element of a forwarded header.
 *
 * @remarks
 * **The result is fully attacker-controlled.** Every proxy *appends* to the
 * right of `X-Forwarded-For`, so the leftmost element is whatever the client
 * wrote — a request carrying `X-Forwarded-For: 127.0.0.1` makes this return
 * `"127.0.0.1"`. Never use it for a rate limiter, audit log, geo-block or
 * admin-IP allowlist; select from the right against a trusted-proxy count,
 * or use `src/httpTrustProxy` instead.
 *
 * No IP syntax validation and no RFC 7239 `for=` extraction is performed, so
 * a real `Forwarded` header yields a whole element such as
 * `"for=1.2.3.4;proto=https"`.
 *
 * @param headers - The headers to inspect.
 * @param name - The header name.
 * @returns The untrusted leftmost value, or `undefined` if none exist.
 */
export function getUntrustedForwardedValue(
  headers: HTTPHeadersLike,
  name: string,
): string | undefined {
  return getForwardedValues(headers, name)[0];
}
