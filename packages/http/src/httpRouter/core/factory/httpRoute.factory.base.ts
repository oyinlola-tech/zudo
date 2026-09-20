/**
 * HTTP route factory base helpers.
 *
 * Internal normalization, validation, execution, and response utilities for
 * route creation and dispatch.
 */

import type {
  HttpMethod,
  MatchedRoute,
  CompiledRoute,
  HttpRouterContext,
  HttpRouterRequestContext,
} from "../types/httpRouter.type.js";

import { HttpRouterError } from "../error/httpRouter.error.js";

import { formatAllowHeader } from "../../../httpMethods/http.methods.js";

import { matchCompiledRoute } from "../../matching/httpRoute.matcher.core.js";

import {
  HttpResponseContext,
  type HttpResponseContext as ResponseContext,
} from "../../../httpResponse/httpResponse.context.js";

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
 * Coerces a handler result into a response context.
 */
export async function normalizeResponse(
  value: ResponseContext | Response | void,
): Promise<ResponseContext> {
  if (value instanceof HttpResponseContext) {
    return value;
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    const body =
      value.body === null
        ? undefined
        : new Uint8Array(await value.arrayBuffer());

    return new HttpResponseContext({
      status: value.status,
      statusText: value.statusText,
      headers: Object.fromEntries(value.headers.entries()),
      body,
    });
  }

  return new HttpResponseContext({ status: 204 });
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
  return new HttpResponseContext({
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: {
      error: "Not Found",
      method: context.method,
      path: context.path,
    },
  });
}

/**
 * Default handler used when a path matches but the method does not.
 */
export function defaultMethodNotAllowedHandler(
  context: HttpRouterRequestContext,
  allowedMethods: readonly HttpMethod[],
): ResponseContext {
  return new HttpResponseContext({
    status: 405,
    headers: {
      allow: formatAllowHeader(allowedMethods),
      "content-type": "application/json; charset=utf-8",
    },
    body: {
      error: "Method Not Allowed",
      method: context.method,
      path: context.path,
      allowed: [...allowedMethods],
    },
  });
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

    if (typeof Response !== "undefined" && result instanceof Response) {
      return mergeRouteResponse(ambient, await normalizeResponse(result));
    }

    return downstream ?? ambient;
  };

  return run(0);
}
