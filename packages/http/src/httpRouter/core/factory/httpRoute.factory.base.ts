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

export function collectAllowedMethods(
  routes: readonly CompiledRoute[],
  path: string,
): HttpMethod[] {
  const methods = new Set<HttpMethod>();

  for (const route of routes) {
    if (!matchCompiledRoute(route, path, false)) {
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
 * Runs a matched route's middleware chain followed by its handler.
 */
export async function executeRoute(
  route: MatchedRoute,
  context: HttpRouterContext,
): Promise<ResponseContext> {
  const layers = route.middleware;

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
      return normalizeResponse(await route.handler(context));
    }

    let downstream: ResponseContext | undefined;

    const result = await layer(context.middleware, async () => {
      downstream = await run(index + 1);

      return downstream;
    });

    if (result instanceof HttpResponseContext) {
      return result;
    }

    if (typeof Response !== "undefined" && result instanceof Response) {
      return normalizeResponse(result);
    }

    return downstream ?? context.middleware.response;
  };

  return run(0);
}
