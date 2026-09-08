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
  RouteConflictError,
  InvalidRoutePatternError,
} from "../error/httpRouter.error.js";

import { normalizePath } from "../util/httpRoute.util.js";

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
    path: normalizePath(definition.path),
    middleware: Object.freeze([...(definition.middleware ?? [])]),
    metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
  };
}

/**
 * Builds a route path from a pattern and parameters.
 */
export function buildRoutePath(
  pattern: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const normalized = normalizePath(pattern);

  return normalized
    .replace(
      /:([a-zA-Z_][a-zA-Z0-9_-]*)(\?)?/g,
      (_match: string, name: string, optional: string | undefined) => {
        const value = params[name];

        if (value === undefined || value === null) {
          if (optional) {
            return "";
          }
          throw new Error(`Missing route parameter "${name}".`);
        }

        return encodeURIComponent(String(value));
      },
    )
    .replace(/\/+/g, "/");
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
