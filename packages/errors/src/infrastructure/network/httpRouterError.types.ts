import { ErrorCode } from "../../base/types/errorCode.type.js";
import { RoutePatternError } from "./routePattern.error.js";
import { HttpRouterError } from "./httpRouterError.base.js";

/** Options for {@link RouteConflictError}. */
export interface RouteConflictErrorOptions {
  /**
   * Replaces the default "A route for METHOD /path is already registered."
   * message entirely, for a conflict that is not a duplicate registration.
   */
  readonly message?: string;
  /**
   * Why the route conflicts, e.g. `"shadowed by GET /users/:id"`. Recorded
   * in `metadata.reason` and, unless `message` is given, reported as
   * "A route for METHOD /path conflicts with an existing route: <reason>".
   */
  readonly reason?: string;
  readonly cause?: unknown;
}

/**
 * Error thrown when a route conflicts with an existing route.
 *
 * The default message describes a duplicate registration; pass `reason` or
 * `message` for other conflicts (an unreachable route shadowed by an earlier
 * pattern, say). The code stays `ERR_HTTP_ROUTE_CONFLICT` either way.
 */
export class RouteConflictError extends HttpRouterError {
  /** The route path that conflicts. */
  public readonly path: string;

  /** The HTTP method that conflicts. */
  public readonly method: string;

  /** Why the route conflicts, when the caller said. */
  public readonly reason?: string;

  constructor(
    path: string,
    method: string,
    options: RouteConflictErrorOptions = {},
  ) {
    super(conflictMessage(path, method, options), {
      code: ErrorCode.HTTP_ROUTE_CONFLICT,
      metadata: {
        path,
        method,
        ...(options.reason !== undefined ? { reason: options.reason } : {}),
      },
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    });
    this.path = path;
    this.method = method;
    this.reason = options.reason;
  }
}

/** Builds the RouteConflictError message from the caller's options. */
function conflictMessage(
  path: string,
  method: string,
  options: RouteConflictErrorOptions,
): string {
  if (options.message !== undefined) return options.message;
  if (options.reason !== undefined) {
    return `A route for ${method} ${path} conflicts with an existing route: ${options.reason}`;
  }
  return `A route for ${method} ${path} is already registered.`;
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
