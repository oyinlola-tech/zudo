import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import {
  HttpRouterError,
  type HttpRouterErrorOptions,
} from "./httpRouterError.base.js";

/**
 * Options for creating a route pattern error.
 */
export interface RoutePatternErrorOptions extends HttpRouterErrorOptions {
  readonly pattern?: string;
  readonly position?: number;
}

/**
 * Error thrown when a route pattern is invalid.
 *
 * Route patterns are authored by developers, not clients, so this is a
 * server-side configuration error: 500, not exposed, non-operational.
 * `InvalidRoutePatternError` (in `httpRouterError.types`) extends this class.
 */
export class RoutePatternError extends HttpRouterError {
  /**
   * The route pattern that caused the error.
   */
  public readonly pattern: string;

  /**
   * The position in the pattern where the error occurred.
   */
  public readonly position: number | undefined;

  constructor(message: string, options: RoutePatternErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_ROUTE_PATTERN,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? false,
      metadata: {
        ...options.metadata,
        ...(options.pattern !== undefined ? { pattern: options.pattern } : {}),
        ...(options.position !== undefined
          ? { position: options.position }
          : {}),
      },
    });

    this.pattern = options.pattern ?? "";

    this.position = options.position;
  }
}

/**
 * Error thrown when a duplicate parameter name is found in a route pattern.
 */
export class DuplicateRouteParameterError extends RoutePatternError {
  /**
   * The duplicate parameter name.
   */
  public readonly paramName: string;

  constructor(pattern: string, paramName: string) {
    super(`Duplicate parameter: ${paramName}`, {
      pattern,
      code: ErrorCode.HTTP_DUPLICATE_ROUTE_PARAM,
      metadata: {
        paramName,
      },
    });

    this.paramName = paramName;
  }
}

/**
 * Creates a route pattern error.
 */
export function createRoutePatternError(
  message: string,
  options: RoutePatternErrorOptions = {},
): RoutePatternError {
  return new RoutePatternError(message, options);
}

/**
 * Determines whether an unknown value is a RoutePatternError.
 */
export function isRoutePatternError(
  value: unknown,
): value is RoutePatternError {
  return value instanceof RoutePatternError;
}
