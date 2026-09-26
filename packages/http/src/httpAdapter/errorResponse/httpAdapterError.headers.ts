/**
 * Headers the adapters add to the responses they build themselves.
 *
 * A response that never passes through the middleware pipeline — a request
 * refused by the guard, the adapter's own `413`, an unhandled error, the
 * response a custom `errorHandler` returns — used to leave without a single
 * security header, because `createSecurityMiddleware` only decorates
 * responses that flow back through it. Those are exactly the responses an
 * attacker provokes on purpose.
 *
 * @module httpAdapter/errorResponse/headers
 */

import type { HttpResponseContext } from "../../httpResponse/httpResponse.context.js";

import { isValidHeaderFieldValue } from "../../httpHeaders/security/index.js";

import { createDefaultSecurityHeaders } from "../../httpSecurityHeaders/httpSecurityHeader.recommended.js";

import { resolveErrorResponse } from "./httpAdapterError.response.js";

/**
 * The adapter's `securityHeaders` option.
 *
 * - `true` / omitted (default): the package's default security header set
 *   ({@link createDefaultSecurityHeaders}).
 * - an object: exactly those headers instead.
 * - `false`: none.
 */
export type AdapterSecurityHeadersOption =
  | boolean
  | Readonly<Record<string, string>>;

/**
 * Resolves the option to the header set the adapter applies.
 *
 * @throws {TypeError} If a configured value contains a control character.
 */
export function resolveAdapterSecurityHeaders(
  option: AdapterSecurityHeadersOption | undefined,
): Readonly<Record<string, string>> {
  if (option === false) {
    return Object.freeze({});
  }

  const headers: Record<string, string> =
    option === undefined || option === true
      ? { ...(createDefaultSecurityHeaders() as Record<string, string>) }
      : {};

  if (typeof option === "object") {
    for (const [name, value] of Object.entries(option)) {
      if (!isValidHeaderFieldValue(value)) {
        throw new TypeError(
          `Invalid value for security header "${name}": it contains a control character or surrounding whitespace.`,
        );
      }

      headers[name.toLowerCase()] = value;
    }
  }

  return Object.freeze(headers);
}

/**
 * Sets each header the response does not already carry.
 *
 * A custom error handler that set its own `Retry-After` or `Cache-Control`
 * keeps it; only the gaps are filled.
 */
export function applyMissingHeaders(
  response: HttpResponseContext,
  headers: Readonly<Record<string, string>>,
): HttpResponseContext {
  const existing = response.headers;

  for (const [name, value] of Object.entries(headers)) {
    if (existing[name.toLowerCase()] === undefined) {
      response.setHeader(name, value);
    }
  }

  return response;
}

/**
 * Finishes a response the adapter built for a failed request: the thrown
 * error's own headers (`Retry-After`, `WWW-Authenticate`, `Allow`) where the
 * response lacks them — a custom `errorHandler` used to have to copy them by
 * hand — and then the adapter's security headers.
 *
 * @param response - The response about to be written.
 * @param securityHeaders - The adapter's resolved header set.
 * @param error - The error being answered, if any.
 */
export function finalizeErrorResponse(
  response: HttpResponseContext,
  securityHeaders: Readonly<Record<string, string>>,
  error?: unknown,
): HttpResponseContext {
  if (error !== undefined) {
    applyMissingHeaders(response, resolveErrorResponse(error).headers);
  }

  return applyMissingHeaders(response, securityHeaders);
}
