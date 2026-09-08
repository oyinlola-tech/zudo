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
  normalizeMiddlewareResult,
} from "../helpers/index.js";

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

export function createResponseMiddleware(
  response: Response | ResponseContext,
): HttpMiddleware {
  return async () => normalizeMiddlewareResult(response, undefined);
}

export function createShortCircuitMiddleware(
  predicate: (context: HttpMiddlewareContext) => boolean | Promise<boolean>,
  response: Response | ResponseContext,
): HttpMiddleware {
  return async (context, next) => {
    if (await predicate(context)) {
      return normalizeMiddlewareResult(response, context.response);
    }

    return next();
  };
}
