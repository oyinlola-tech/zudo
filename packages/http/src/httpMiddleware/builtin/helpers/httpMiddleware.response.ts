/**
 * Response helpers for the built-in middleware.
 *
 * @module httpMiddleware/builtin/helpers/response
 *
 * Every built-in middleware used to return `{ ...response, headers } as unknown
 * as ResponseContext`. `HttpResponseContext` keeps its state in private
 * `_`-prefixed instance fields and exposes it through prototype getters, so
 * spreading an instance yields a plain object carrying `_status`, `_body` and
 * friends, with every getter lost. The adapter then read `.status` and `.body`
 * as `undefined` — the response's status and body were dropped for every
 * request that passed through a built-in middleware. The double cast is what
 * let it compile.
 *
 * These helpers keep the class instance intact instead.
 */

import { HttpResponseContext } from "../../../httpResponse/httpResponse.context.js";
import { isValidHeaderFieldValue } from "../../../httpHeaders/security/index.js";

/**
 * Returns a copy of `response` carrying the supplied headers.
 *
 * The original is left untouched, so a middleware cannot mutate a response an
 * outer middleware still holds.
 *
 * @param response - The response returned by the next middleware.
 * @param headers - Header names mapped to values, applied over the existing set.
 * @returns A new context with the headers applied.
 * @throws {TypeError} If a header value contains a control character.
 */
export function withResponseHeaders(
  response: HttpResponseContext,
  headers: Readonly<Record<string, string>>,
): HttpResponseContext {
  const next = response.clone();

  for (const [name, value] of Object.entries(headers)) {
    // A CR/LF or control character reaching a response header is a
    // response-splitting primitive; refuse rather than emit it.
    if (!isValidHeaderFieldValue(value)) {
      throw new TypeError(
        `Invalid value for response header "${name}": it contains a control character or surrounding whitespace.`,
      );
    }
    next.setHeader(name, value);
  }

  return next;
}

/**
 * Builds a fresh response context, for middleware that answers without calling
 * `next()` — a CORS preflight, for instance.
 *
 * @param status - HTTP status code.
 * @param headers - Header names mapped to values.
 * @returns A new context.
 * @throws {TypeError} If a header value contains a control character.
 */
export function createMiddlewareResponse(
  status: number,
  headers: Readonly<Record<string, string>>,
): HttpResponseContext {
  const response = new HttpResponseContext({ status });

  for (const [name, value] of Object.entries(headers)) {
    if (!isValidHeaderFieldValue(value)) {
      throw new TypeError(
        `Invalid value for response header "${name}": it contains a control character or surrounding whitespace.`,
      );
    }
    response.setHeader(name, value);
  }

  return response;
}

/**
 * Copies a `Headers` accumulator onto a response context.
 *
 * Middleware that needs `Headers` semantics while building its result — CORS
 * appends to `Vary` rather than overwriting it — can accumulate there and hand
 * the result here. `set-cookie` is transferred through `getSetCookie()` so
 * multiple cookies stay separate values; iterating `Headers` alone would join
 * them into one comma-separated string, which is invalid for that header.
 *
 * @param response - Context to copy onto, or `undefined` to build a fresh one.
 * @param headers - Accumulated headers.
 * @param status - Status for the fresh context; ignored when `response` is given.
 * @returns A new context carrying the accumulated headers.
 */
export function applyHeadersToResponse(
  response: HttpResponseContext | undefined,
  headers: Headers,
  status = 204,
): HttpResponseContext {
  const next = response ? response.clone() : new HttpResponseContext({ status });

  const setCookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() === "set-cookie") {
      continue;
    }
    if (!isValidHeaderFieldValue(value)) {
      throw new TypeError(
        `Invalid value for response header "${name}": it contains a control character or surrounding whitespace.`,
      );
    }
    next.setHeader(name, value);
  }

  if (setCookies.length > 0) {
    next.header("set-cookie", setCookies);
  }

  return next;
}
