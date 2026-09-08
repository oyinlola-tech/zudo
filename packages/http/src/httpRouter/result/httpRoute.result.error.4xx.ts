/**
 * Zudojs HTTP route result 4xx error factory functions.
 */

import { HttpRouteResult } from "./httpRoute.result.class.js";

import type { RouteResultBody } from "./httpRoute.result.type.js";

import { formatAllowHeader } from "../../httpMethods/http.methods.js";

/* -------------------------------------------------------------------------- */
/* 4xx Error Results                                                          */
/* -------------------------------------------------------------------------- */

export function badRequest(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 400,
    body: body ?? {
      error: "Bad Request",
    },
  });
}

export function unauthorized(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 401,
    body: body ?? {
      error: "Unauthorized",
    },
  });
}

export function forbidden(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 403,
    body: body ?? {
      error: "Forbidden",
    },
  });
}

export function notFound(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 404,
    body: body ?? {
      error: "Not Found",
    },
  });
}

export function methodNotAllowed(
  methods: readonly string[],
  body?: RouteResultBody,
): HttpRouteResult {
  return new HttpRouteResult({
    status: 405,
    headers: {
      Allow: formatAllowHeader(methods),
    },
    body: body ?? {
      error: "Method Not Allowed",
    },
  });
}

export function conflict(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 409,
    body: body ?? {
      error: "Conflict",
    },
  });
}

export function unprocessableEntity(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 422,
    body: body ?? {
      error: "Unprocessable Entity",
    },
  });
}

export function tooManyRequests(body?: RouteResultBody): HttpRouteResult {
  return new HttpRouteResult({
    status: 429,
    body: body ?? {
      error: "Too Many Requests",
    },
  });
}
