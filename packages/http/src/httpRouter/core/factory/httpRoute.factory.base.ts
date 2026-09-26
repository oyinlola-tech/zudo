/**
 * HTTP route factory base helpers.
 *
 * Internal normalization, validation, execution, and response utilities for
 * route creation and dispatch.
 */

import { isGuardResponse } from "@zudojs/middleware";

import type {
  HttpMethod,
  MatchedRoute,
  CompiledRoute,
  HttpRouterContext,
  HttpRouterRequestContext,
  RouterHandlerResult,
} from "../types/httpRouter.type.js";

import { HttpRouterError } from "../error/httpRouter.error.js";

import { formatAllowHeader } from "../../../httpMethods/http.methods.js";

import { matchCompiledRoute } from "../../matching/httpRoute.matcher.core.js";

import {
  HttpResponseContext,
  type HttpResponseContext as ResponseContext,
} from "../../../httpResponse/httpResponse.context.js";

import { bufferWebResponse } from "../../../httpResponse/httpResponse.fromWeb.js";

import { applyGuardResponse } from "../../../httpMiddleware/pipeline/httpPipeline.guardResponse.js";

/* -------------------------------------------------------------------------- */
/* Method Helpers                                                             */
/* -------------------------------------------------------------------------- */

export function normalizeMethod(method: string): HttpMethod | "*" {
  const normalized = method.toUpperCase();

  if (normalized === "*") {
    return "*";
  }

  if (!isHttpMethod(normalized)) {
    throw new HttpRouterError(`Unsupported HTTP method "${method}".`);
  }

  return normalized;
}

export function normalizeMethods(
  method: HttpMethod | readonly HttpMethod[] | "*",
): readonly (HttpMethod | "*")[] {
  const methods: readonly (HttpMethod | "*")[] =
    typeof method === "string" ? [method] : method;

  return methods.map(normalizeMethod);
}

export function isHttpMethod(value: string): value is HttpMethod {
  return (
    value === "GET" ||
    value === "HEAD" ||
    value === "POST" ||
    value === "PUT" ||
    value === "PATCH" ||
    value === "DELETE" ||
    value === "OPTIONS" ||
    value === "CONNECT" ||
    value === "TRACE"
  );
}

/**
 * Collects the methods registered for a path.
 *
 * @param routes - The compiled routes to consider.
 * @param path - The request path.
 * @param caseSensitive - The router's case sensitivity. This used to be
 *   hardcoded to `false`, so a case-sensitive router advertised `Allow`
 *   methods belonging to a route that only differed by case — a method the
 *   client would then get a 404 from, and a disclosure of the other route.
 * @returns The allowed methods, with `HEAD` implied by `GET`.
 */
export function collectAllowedMethods(
  routes: readonly CompiledRoute[],
  path: string,
  caseSensitive = false,
): HttpMethod[] {
  const methods = new Set<HttpMethod>();

  for (const route of routes) {
    if (!matchCompiledRoute(route, path, caseSensitive)) {
      continue;
    }

    if (isHttpMethod(route.definition.method)) {
      methods.add(route.definition.method);
    }
  }

  if (methods.has("GET") && !methods.has("HEAD")) {
    methods.add("HEAD");
  }

  return [...methods];
}

/* -------------------------------------------------------------------------- */
/* Route Identity                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extracts the monotonic registration sequence from a generated route id.
 *
 * Route ids are shaped `route:<sequence>`; ids that do not follow that shape
 * sort last, preserving a stable order.
 */
export function extractRouteSequence(id: string): number {
  const match = /^route:(\d+)$/.exec(id);

  const sequence = match?.[1];

  if (sequence === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number.parseInt(sequence, 10);
}

/**
 * Builds a placeholder route used when no route matched a request.
 */
export function createFallbackRoute(
  path: string,
  method: string,
): MatchedRoute {
  const fallback: MatchedRoute = {
    id: "route:unmatched",

    method: isHttpMethod(method.toUpperCase()) ? normalizeMethod(method) : "*",

    path,

    name: undefined,

    params: Object.freeze({}),

    metadata: Object.freeze({}),

    handler: () => undefined,

    middleware: Object.freeze([]),
  };

  return Object.freeze(fallback);
}

/* -------------------------------------------------------------------------- */
/* Response Helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Coerces a handler result into a response context: a response context or
 * web `Response` as built, `undefined`/`null` as `204`, and any other value
 * as a `200` JSON body, the way server handlers treat a plain value. A
 * plain object used to be dropped for an empty `204`.
 */
export async function normalizeResponse(
  value: RouterHandlerResult,
): Promise<ResponseContext> {
  if (value instanceof HttpResponseContext) {
    return value;
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    /*
     * `Object.fromEntries(headers.entries())` folded every `Set-Cookie` into
     * one comma-joined value, which browsers read as a single malformed
     * cookie. `bufferWebResponse` keeps each cookie separate.
     */
    return bufferWebResponse(value);
  }

  if (value === undefined || value === null) {
    return new HttpResponseContext({ status: 204 });
  }

  return new HttpResponseContext({ status: 200 }).json(value);
}

/**
 * Builds the automatic `OPTIONS` response for a matched path.
 */
export function createOptionsResponse(
  allowedMethods: readonly string[],
): ResponseContext {
  return new HttpResponseContext({
    status: 204,
    headers: {
      allow: formatAllowHeader(allowedMethods),
    },
  });
}

/**
 * Default handler used when no route matches a request.
 */
export function defaultNotFoundHandler(
  context: HttpRouterRequestContext,
): ResponseContext {
  return jsonErrorResponse(404, {
    error: "Not Found",
    code: "NOT_FOUND",
    method: context.method,
    path: context.path,
  });
}

/**
 * Default handler used when a path matches but the method does not.
 */
export function defaultMethodNotAllowedHandler(
  context: HttpRouterRequestContext,
  allowedMethods: readonly HttpMethod[],
): ResponseContext {
  return jsonErrorResponse(405, {
    error: "Method Not Allowed",
    code: "METHOD_NOT_ALLOWED",
    method: context.method,
    path: context.path,
    allowed: [...allowedMethods],
  }).setHeader("allow", formatAllowHeader(allowedMethods));
}

/**
 * Builds a default error response the same way `.json()` does, so its body
 * is the serialized string every other JSON response carries. The default
 * 404/405 used to keep a plain object as the body while a handler's
 * `.json()` produced a string, so `result.response.body` had two types.
 * Every framework-built error body carries `error` and `code`.
 */
function jsonErrorResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): ResponseContext {
  return new HttpResponseContext({ status })
    .json(body)
    .setHeader("content-type", "application/json; charset=utf-8");
}

/* -------------------------------------------------------------------------- */
/* Route Execution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Merges one response context into another.
 *
 * Status, status text, headers, cookies, metadata and body are all carried
 * over, so nothing a handler produced is lost.
 *
 * @param target - The response that stays authoritative.
 * @param source - The response to fold into it.
 * @returns The target response.
 */
function mergeRouteResponse(
  target: ResponseContext,
  source: ResponseContext,
): ResponseContext {
  if (source === target) {
    return target;
  }

  target.setStatus(source.status, source.statusText);

  target.headers_obj(source.headers);

  for (const cookie of source.cookies) {
    target.setCookie(cookie);
  }

  for (const [key, value] of Object.entries(source.metadata)) {
    target.setMetadata(key, value);
  }

  target.setBody(source.body);

  return target;
}

/**
 * Runs a matched route's middleware chain followed by its handler.
 *
 * Every result is folded into the ambient response context
 * (`context.middleware.response`), which is the object route middleware
 * writes to. Returning the handler's brand new response instead — as this
 * used to — silently discarded every header, cookie and status a route
 * middleware had set before calling `next()`.
 */
export async function executeRoute(
  route: MatchedRoute,
  context: HttpRouterContext,
): Promise<ResponseContext> {
  const layers = route.middleware;

  const ambient = context.middleware.response;

  let invoked = -1;

  const run = async (index: number): Promise<ResponseContext> => {
    if (index <= invoked) {
      throw new HttpRouterError(
        "Route middleware called next() more than once.",
      );
    }

    invoked = index;

    const layer = layers[index];

    if (layer === undefined) {
      return mergeRouteResponse(
        ambient,
        await normalizeResponse(await route.handler(context)),
      );
    }

    let downstream: ResponseContext | undefined;

    const result = await layer(context.middleware, async () => {
      downstream = await run(index + 1);

      return downstream;
    });

    if (result instanceof HttpResponseContext) {
      return mergeRouteResponse(ambient, result);
    }

    /*
     * A guard (permissions, tenancy) refusing the request. Before this was
     * honoured the returned object was ignored and the ambient 200 went out.
     */
    if (isGuardResponse(result)) {
      return applyGuardResponse(ambient, result);
    }

    if (typeof Response !== "undefined" && result instanceof Response) {
      return mergeRouteResponse(ambient, await normalizeResponse(result));
    }

    return downstream ?? ambient;
  };

  return run(0);
}
