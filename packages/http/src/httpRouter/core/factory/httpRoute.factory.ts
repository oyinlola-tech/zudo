/**
 * HTTP router factory functions and type guards.
 */

import type {
  RouteDefinition,
  RouterOptions,
} from "../types/httpRouter.type.js";

import { HttpRouter } from "../register/httpRouter.register.js";

import { HttpRouterGroup } from "../group/httpRouterGroup.core.js";

import {
  HttpRouterError,
  RouteConflictError,
  InvalidRoutePatternError,
} from "../error/httpRouter.error.js";

import { normalizeRoutePattern } from "../util/httpRoute.util.js";

/**
 * Creates a new HTTP router instance.
 */
export function createRouter(options: RouterOptions = {}): HttpRouter {
  return new HttpRouter(options);
}

/**
 * Creates a normalized route definition.
 */
export function createRoute(definition: RouteDefinition): RouteDefinition {
  return {
    ...definition,
    path: normalizeRoutePattern(definition.path),
    middleware: Object.freeze([...(definition.middleware ?? [])]),
    metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
  };
}

/**
 * Builds a route path from a pattern and parameters.
 *
 * Handles every parameter spelling the router accepts — `:id`, `:id?`,
 * `:id(\\d+)`, `{name}`, `{name?:\\w+}` and a trailing `*rest` — and
 * percent-encodes each value (a wildcard value segment by segment). An
 * omitted optional parameter no longer leaves a trailing slash
 * (`/reports/2026/`), and a missing required parameter throws
 * {@link HttpRouterError} rather than a plain `Error`.
 */
export function buildRoutePath(
  pattern: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const normalized = normalizeRoutePattern(pattern);

  const segments = normalized
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => buildSegment(segment, params))
    .filter((segment) => segment !== undefined);

  return `/${segments.join("/")}`;
}

const COLON_PARAMETER = /^:([a-zA-Z_][a-zA-Z0-9_-]*)(?:\(.*\))?(\?)?$/;

const BRACE_PARAMETER = /^\{([a-zA-Z_][a-zA-Z0-9_-]*)(\?)?(?::.+)?\}$/;

function buildSegment(
  segment: string,
  params: Readonly<Record<string, string | number>>,
): string | undefined {
  if (segment.startsWith("*")) {
    const value = params[segment.slice(1) || "*"];

    return value === undefined
      ? undefined
      : String(value).split("/").map(encodeURIComponent).join("/");
  }

  const match = COLON_PARAMETER.exec(segment) ?? BRACE_PARAMETER.exec(segment);

  if (!match) {
    return segment;
  }

  const [, name, optional] = match;

  const value = name === undefined ? undefined : params[name];

  if (value === undefined || value === null) {
    if (optional) {
      return undefined;
    }

    throw new HttpRouterError(`Missing route parameter "${name}".`);
  }

  return encodeURIComponent(String(value));
}

/**
 * Type guard for HttpRouter instances.
 */
export function isHttpRouter(value: unknown): value is HttpRouter {
  return value instanceof HttpRouter;
}

/**
 * Type guard for HttpRouterGroup instances.
 */
export function isHttpRouterGroup(value: unknown): value is HttpRouterGroup {
  return value instanceof HttpRouterGroup;
}

/**
 * Type guard for RouteConflictError instances.
 */
export function isRouteConflictError(
  value: unknown,
): value is RouteConflictError {
  return value instanceof RouteConflictError;
}

/**
 * Type guard for InvalidRoutePatternError instances.
 */
export function isInvalidRoutePatternError(
  value: unknown,
): value is InvalidRoutePatternError {
  return value instanceof InvalidRoutePatternError;
}
