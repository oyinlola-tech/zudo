/**
 * CORS middleware factory.
 *
 * @module httpMiddleware/builtin/cors
 */

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../httpMiddleware.type.js";


import { applyHeadersToResponse } from "../helpers/index.js";

export interface CorsMiddlewareOptions {
  /**
   * The allowed origin(s).
   *
   * - a string: an exact origin, or `"*"` for any origin (rejected when
   *   `credentials` is true).
   * - an array: the set of exact origins that are allowed.
   * - a function: called with the request origin; return `true` to allow it.
   */
  readonly allowOrigin?:
    | string
    | readonly string[]
    | ((origin: string, context: HttpMiddlewareContext) => boolean);

  readonly allowMethods?: string;

  readonly allowHeaders?: string;

  readonly exposeHeaders?: string;

  readonly credentials?: boolean;

  readonly maxAge?: number;

  /**
   * Status used to answer a preflight request. Defaults to 204.
   */
  readonly optionsSuccessStatus?: number;
}

function getRequestHeader(
  context: HttpMiddlewareContext,
  name: string,
): string | undefined {
  const headers = (
    context.request as unknown as {
      headers?: Record<string, string | string[] | undefined>;
    }
  ).headers;

  const value = headers?.[name];

  return Array.isArray(value) ? value[0] : value;
}

function getRequestMethod(context: HttpMiddlewareContext): string {
  return (
    (context.request as unknown as { method?: string }).method ?? "GET"
  ).toUpperCase();
}

/**
 * Decides whether an origin is allowed.
 *
 * The previous implementation ignored the request origin entirely and wrote
 * `Access-Control-Allow-Origin: *` on every response, so the documented
 * "reflect the origin" pattern allowed every origin on the internet.
 */
function resolveAllowedOrigin(
  origin: string,
  context: HttpMiddlewareContext,
  options: CorsMiddlewareOptions,
): string | undefined {
  const configured = options.allowOrigin ?? "*";

  if (typeof configured === "function") {
    return configured(origin, context) ? origin : undefined;
  }

  const list = typeof configured === "string" ? [configured] : configured;

  if (list.includes("*")) {
    if (options.credentials) {
      /*
       * A wildcard origin with credentials is forbidden by the spec, and
       * reflecting the request origin instead would authorise every origin
       * to read authenticated responses.
       */
      throw new TypeError(
        "CORS: a wildcard allowOrigin cannot be combined with credentials.",
      );
    }

    return "*";
  }

  return list.includes(origin) ? origin : undefined;
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get("vary");

  if (!existing) {
    headers.set("vary", value);

    return;
  }

  const present = existing
    .split(",")
    .map((entry) => entry.trim().toLowerCase());

  if (!present.includes(value.toLowerCase())) {
    headers.set("vary", `${existing}, ${value}`);
  }
}

export function createCorsMiddleware(
  options: CorsMiddlewareOptions = {},
): HttpMiddleware {
  return async (context, next) => {
    const origin = getRequestHeader(context, "origin");

    /*
     * A request without an Origin is not a CORS request. Emitting
     * Access-Control-* on it pollutes shared caches for no benefit.
     */
    if (!origin) {
      return next();
    }

    const allowed = resolveAllowedOrigin(origin, context, options);

    const isPreflight =
      getRequestMethod(context) === "OPTIONS" &&
      getRequestHeader(context, "access-control-request-method") !== undefined;

    const applyHeaders = (headers: Headers): void => {
      /*
       * `Vary: Origin` is mandatory whenever the response depends on the
       * request Origin. Without it a shared cache stores one origin's
       * Access-Control-Allow-Origin and serves it to everybody.
       */
      appendVary(headers, "Origin");

      if (isPreflight) {
        appendVary(headers, "Access-Control-Request-Method");
        appendVary(headers, "Access-Control-Request-Headers");
      }

      if (allowed === undefined) {
        return;
      }

      headers.set("access-control-allow-origin", allowed);

      if (options.credentials) {
        headers.set("access-control-allow-credentials", "true");
      }

      if (options.exposeHeaders) {
        headers.set("access-control-expose-headers", options.exposeHeaders);
      }

      if (!isPreflight) {
        return;
      }

      if (options.allowMethods) {
        headers.set("access-control-allow-methods", options.allowMethods);
      }

      const requestedHeaders =
        options.allowHeaders ??
        getRequestHeader(context, "access-control-request-headers");

      if (requestedHeaders) {
        headers.set("access-control-allow-headers", requestedHeaders);
      }

      if (options.maxAge !== undefined) {
        headers.set("access-control-max-age", String(options.maxAge));
      }
    };

    if (isPreflight) {
      /*
       * Preflights are answered here. Previously OPTIONS fell through to the
       * router, which returned a 404/405, so every legitimate cross-origin
       * call with a preflight failed.
       */
      const headers = new Headers();

      applyHeaders(headers);

      headers.set("content-length", "0");

      return applyHeadersToResponse(
        undefined,
        headers,
        options.optionsSuccessStatus ?? 204,
      );
    }

    const response = await next();

    const headers = new Headers(response.headers as Record<string, string>);

    applyHeaders(headers);

    return applyHeadersToResponse(response, headers);
  };
}
