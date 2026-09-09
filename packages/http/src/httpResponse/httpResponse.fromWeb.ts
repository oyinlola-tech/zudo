/**
 * Conversion from a WHATWG `Response` into an {@link HttpResponseContext}.
 *
 * @module httpResponse/fromWeb
 *
 * Returning a plain web `Response` from a middleware is part of the public
 * contract (`HttpMiddlewareResult` includes `Response`), but nothing in the
 * package ever converted one. Both middleware normalizers fabricated
 * `{ response } as unknown as ResponseContext` — an object with no `status`,
 * no `headers` and no `body`, which the adapter then read as `undefined`.
 *
 * A `Response` is not a response context and cannot be cast into one: its
 * headers live in a `Headers` instance (no own enumerable properties, so
 * spreading yields `{}`) and its body is a `ReadableStream`. The conversion
 * has to be written out, and it is written here once so that the pipeline and
 * the built-in middleware share it.
 */

import { HttpResponseContext } from "./httpResponse.context.js";

import type { ResponseHeaders } from "./core/httpResponse.type.js";

/**
 * Narrows an unknown value to a WHATWG `Response`.
 *
 * @param value - Candidate value.
 * @returns `true` when `value` is a `Response` instance.
 */
export function isWebResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

/**
 * Copies a `Response`'s headers into a plain header record.
 *
 * `set-cookie` is read through `getSetCookie()` so that multiple cookies stay
 * separate values; iterating `Headers` alone joins them into one
 * comma-separated string, which is invalid for that header.
 */
function collectHeaders(headers: Headers): ResponseHeaders {
  const collected: ResponseHeaders = {};

  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() === "set-cookie") {
      continue;
    }

    collected[name.toLowerCase()] = value;
  }

  const setCookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

  if (setCookies.length > 0) {
    collected["set-cookie"] = setCookies;
  }

  return collected;
}

function assertBodyReadable(response: Response): void {
  if (response.bodyUsed) {
    /*
     * Silently producing a body-less context here would drop the payload the
     * middleware meant to send, which is exactly the failure this module
     * exists to remove. Fail loudly instead.
     */
    throw new TypeError(
      "Cannot convert a Response whose body has already been consumed. " +
        "Return a fresh Response per request, or clone it before reading.",
    );
  }
}

/**
 * Converts a web `Response` into a response context, streaming its body.
 *
 * The body is carried across as the `Response`'s own `ReadableStream`; the
 * response writer already has a streaming branch with backpressure handling,
 * so nothing is buffered and an unbounded stream stays unbounded. This keeps
 * the conversion synchronous, which is what lets the middleware normalizer
 * stay synchronous too.
 *
 * The stream can only be consumed once, so this suits a `Response` built for
 * a single request. For a `Response` value reused across requests use
 * {@link bufferWebResponse}.
 *
 * @param response - The web response to convert.
 * @returns An equivalent response context.
 * @throws {TypeError} If the response body has already been consumed.
 */
export function webResponseToContext(response: Response): HttpResponseContext {
  assertBodyReadable(response);

  return new HttpResponseContext({
    status: response.status,
    statusText: response.statusText === "" ? undefined : response.statusText,
    headers: collectHeaders(response.headers),
    body: response.body ?? undefined,
  });
}

/**
 * Converts a web `Response` into a response context, reading its body into
 * memory.
 *
 * Use this for a `Response` that has to survive more than one request: the
 * resulting context holds bytes rather than a one-shot stream, so it can be
 * cloned per request.
 *
 * @param response - The web response to convert.
 * @returns An equivalent response context holding a buffered body.
 * @throws {TypeError} If the response body has already been consumed.
 */
export async function bufferWebResponse(
  response: Response,
): Promise<HttpResponseContext> {
  assertBodyReadable(response);

  const headers = collectHeaders(response.headers);

  const status = response.status;

  const statusText =
    response.statusText === "" ? undefined : response.statusText;

  if (response.body === null) {
    return new HttpResponseContext({ status, statusText, headers });
  }

  const buffer = await response.arrayBuffer();

  return new HttpResponseContext({
    status,
    statusText,
    headers,
    body: new Uint8Array(buffer),
  });
}
