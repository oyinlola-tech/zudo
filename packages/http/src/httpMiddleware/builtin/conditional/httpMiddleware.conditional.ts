/**
 * Conditional, path, method, and response middleware factories.
 *
 * @module httpMiddleware/builtin/conditional
 */

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../httpMiddleware.type.js";

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

import {
  getRequestMethod,
  getRequestUrl,
  extractPathname,
} from "../helpers/index.js";

import {
  isWebResponse,
  bufferWebResponse,
} from "../../../httpResponse/httpResponse.fromWeb.js";

export function createAsyncMiddleware(
  factory: (context: HttpMiddlewareContext) => Promise<HttpMiddleware>,
): HttpMiddleware {
  return async (context, next) => {
    const middleware = await factory(context);

    return middleware(context, next);
  };
}

export function createConditionalMiddleware(
  predicate: (context: HttpMiddlewareContext) => boolean | Promise<boolean>,
  middleware: HttpMiddleware,
): HttpMiddleware {
  return async (context, next) => {
    if (await predicate(context)) {
      return middleware(context, next);
    }

    return next();
  };
}

export function createPathMiddleware(
  path: string,
  middleware: HttpMiddleware,
): HttpMiddleware {
  const targetPath = extractPathname(path);

  return createConditionalMiddleware((context) => {
    const url = getRequestUrl(context.request);

    const pathname = extractPathname(url);

    return pathname === targetPath;
  }, middleware);
}

export function createMethodMiddleware(
  method: string,
  middleware: HttpMiddleware,
): HttpMiddleware {
  const targetMethod = method.toUpperCase();

  return createConditionalMiddleware((context) => {
    const requestMethod = getRequestMethod(context.request);

    return requestMethod === targetMethod;
  }, middleware);
}

/**
 * Builds a resolver that yields a fresh response context per request.
 *
 * A `Response` handed to one of these factories is a *single value reused for
 * every request*, and its body is a one-shot `ReadableStream`. Streaming it
 * straight through would serve the body once and hand the second request a
 * disturbed stream, so the body is read into memory once, on first use, and
 * each request receives a clone of the resulting context. Cloning also keeps
 * one request's mutations away from the next.
 */
function createResponseResolver(
  response: Response | ResponseContext,
): () => Promise<ResponseContext> {
  if (!isWebResponse(response)) {
    return async () => response.clone();
  }

  let buffered: Promise<ResponseContext> | undefined;

  return async () => {
    buffered ??= bufferWebResponse(response);

    return (await buffered).clone();
  };
}

export function createResponseMiddleware(
  response: Response | ResponseContext,
): HttpMiddleware {
  const resolve = createResponseResolver(response);

  return async () => resolve();
}

export function createShortCircuitMiddleware(
  predicate: (context: HttpMiddlewareContext) => boolean | Promise<boolean>,
  response: Response | ResponseContext,
): HttpMiddleware {
  const resolve = createResponseResolver(response);

  return async (context, next) => {
    if (await predicate(context)) {
      return resolve();
    }

    return next();
  };
}
