/**
 * Internal helper functions for the middleware pipeline.
 *
 * @module httpMiddleware/pipeline/helpers
 */

import type {
  HttpMiddlewareContext,
  RegisteredMiddleware,
} from "../httpMiddleware.type.js";

import { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

import {
  isWebResponse,
  webResponseToContext,
} from "../../httpResponse/httpResponse.fromWeb.js";

import { HttpMiddlewareError } from "../httpMiddleware.error.js";

export async function nextResult(
  context: HttpMiddlewareContext,
  dispatch: (index: number) => Promise<ResponseContext>,
  index: number,
): Promise<ResponseContext> {
  return dispatch(index + 1);
}

/**
 * Turns whatever a middleware returned into a response context.
 *
 * This is the single normalizer for the package. `builtin/helpers` used to
 * carry a second, near-identical copy (`normalizeMiddlewareResult`); it has
 * been deleted in favour of this one.
 *
 * @param result - The middleware's return value.
 * @param fallback - The ambient response to continue with when the middleware
 *   did not produce one of its own.
 * @returns The response context to continue the pipeline with.
 * @throws {HttpMiddlewareError} If no response context can be determined.
 */
export function normalizeResult(
  result: void | Response | RequestContext | ResponseContext | undefined,
  fallback?: ResponseContext,
): ResponseContext {
  /*
   * The `Response` check must come first. `isResponseContext` tests for a
   * `headers` property, and `headers` is a getter on `Response.prototype`, so
   * `"headers" in someResponse` is true and every web `Response` used to be
   * waved through as if it already were a response context — its `Headers`
   * object was then spread into `{}` and all of its headers were lost.
   */
  if (isWebResponse(result)) {
    return webResponseToContext(result);
  }

  if (isResponseContext(result)) {
    return result;
  }

  if (isRequestContext(result)) {
    /*
     * A request context is not a response. Returning one signals "continue
     * with this request", so the ambient response is the correct result. The
     * previous code fabricated `{ request } as unknown as ResponseContext`
     * when there was no ambient response: an object with no status, headers
     * or body, which the adapter read as `undefined` throughout. There is no
     * honest response to invent here, so this is reported instead.
     */
    if (fallback) {
      return fallback;
    }

    throw new HttpMiddlewareError(
      "Middleware returned a request context but no response context is " +
        "available to continue with. A request context signals 'continue " +
        "with this request'; it cannot be used as a response.",
    );
  }

  if (fallback) {
    return fallback;
  }

  throw new HttpMiddlewareError(
    "Middleware completed without producing a response context.",
  );
}

/**
 * Narrows a value to a response context.
 *
 * A web `Response` is explicitly excluded: it satisfies the structural test
 * (`headers` is a prototype getter) but is a different type entirely, and
 * treating one as a response context loses its headers.
 */
export function isResponseContext(value: unknown): value is ResponseContext {
  if (value instanceof ResponseContext) {
    return true;
  }

  /*
   * The nominal checks come first because the structural ones cannot tell
   * these types apart. `headers` is a getter on `Response.prototype` and on
   * `HttpRequestContext.prototype`, so `"headers" in value` is true for both,
   * and a web `Response` or a request context was previously waved through as
   * a response context.
   */
  if (
    value === null ||
    typeof value !== "object" ||
    isWebResponse(value) ||
    value instanceof RequestContext
  ) {
    return false;
  }

  return "response" in value || "status" in value || "headers" in value;
}

export function isRequestContext(value: unknown): value is RequestContext {
  if (value instanceof RequestContext) {
    return true;
  }

  if (
    value === null ||
    typeof value !== "object" ||
    isWebResponse(value) ||
    value instanceof ResponseContext
  ) {
    return false;
  }

  return "request" in value || "method" in value || "url" in value;
}

export function isRegisteredMiddleware(
  value: unknown,
): value is RegisteredMiddleware {
  return (
    typeof value === "object" &&
    value !== null &&
    "middleware" in value &&
    "id" in value
  );
}

export function normalizePriority(priority?: number): number {
  if (priority === undefined || !Number.isFinite(priority)) {
    return 0;
  }

  return priority;
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "middleware";
}
