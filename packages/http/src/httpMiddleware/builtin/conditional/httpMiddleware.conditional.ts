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

import { normalizePath } from "../../../httpRouter/core/util/httpRoute.util.js";

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

/**
 * Options for {@link createPathMiddleware}.
 */
export interface PathMiddlewareOptions {
  /**
   * Match the path case-sensitively. Defaults to `false`, the router's
   * default, so a guard scoped to `/admin` also covers `/Admin`, which the
   * router would dispatch to the same route.
   */
  readonly caseSensitive?: boolean;
}

/**
 * Runs `middleware` only for requests addressed to `path`.
 *
 * The request path is normalised exactly as the router normalises it before
 * matching: it is read with the canonical request-target parser, repeated
 * slashes are collapsed, a trailing slash is ignored and (by default) case is
 * ignored. An exact, case-sensitive comparison let `/Admin`, `/admin/` and
 * `/admin//` skip a guard on `/admin` while the router still served the
 * protected route.
 */
export function createPathMiddleware(
  path: string,
  middleware: HttpMiddleware,
  options: PathMiddlewareOptions = {},
): HttpMiddleware {
  const caseSensitive = options.caseSensitive === true;

  const canonical = (value: string): string => {
    const normalized = normalizePath(value);

    return caseSensitive ? normalized : normalized.toLowerCase();
  };

  const targetPath = canonical(extractPathname(path));

  return createConditionalMiddleware((context) => {
    const url = getRequestUrl(context.request);

    return canonical(extractPathname(url)) === targetPath;
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
