import { ErrorCode } from "../../base/types/errorCode.type.js";
import { RoutePatternError } from "./routePattern.error.js";
import { HttpRouterError } from "./httpRouterError.base.js";

/**
 * Error thrown when a route conflicts with an existing route.
 */
export class RouteConflictError extends HttpRouterError {
  /** The route path that conflicts. */
  public readonly path: string;

  /** The HTTP method that conflicts. */
  public readonly method: string;

  constructor(path: string, method: string) {
    super(`A route for ${method} ${path} is already registered.`, {
      code: ErrorCode.HTTP_ROUTE_CONFLICT,
      metadata: { path, method },
    });
    this.path = path;
    this.method = method;
  }
}

/**
 * Error thrown when a route pattern is invalid.
 *
 * Specialisation of `RoutePatternError` (same hierarchy, code
 * `ERR_HTTP_INVALID_ROUTE_PATTERN`).
 */
export class InvalidRoutePatternError extends RoutePatternError {
  constructor(pattern: string, message: string) {
    super(`Invalid route pattern "${pattern}": ${message}`, {
      code: ErrorCode.HTTP_INVALID_ROUTE_PATTERN,
      pattern,
    });
  }
}
