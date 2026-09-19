/**
 * HTTP middleware pipeline errors. Names, codes and constructors match the
 * classes `@zudojs/http` defined locally.
 */

import { BaseError } from "../../base/core/baseError.core.js";

/** Options accepted by {@link HttpMiddlewareError}. */
export interface HttpMiddlewareErrorOptions {
  readonly middlewareId?: string;
  readonly middlewareName?: string;
  readonly cause?: unknown;
}

/** Error raised by an HTTP middleware function (500, not exposed). */
export class HttpMiddlewareError extends BaseError {
  /** The unique identifier of the middleware. */
  readonly middlewareId: string | undefined;
  /** The name of the middleware. */
  readonly middlewareName: string | undefined;

  constructor(message: string, options: HttpMiddlewareErrorOptions = {}) {
    super(message, {
      code: "HTTP_MIDDLEWARE_ERROR",
      statusCode: 500,
      expose: false,
      cause: options.cause,
    });
    this.name = "HttpMiddlewareError";
    this.middlewareId = options.middlewareId;
    this.middlewareName = options.middlewareName;
  }
}

/** Error raised when the HTTP middleware pipeline fails. */
export class HttpMiddlewarePipelineError extends BaseError {
  /** The errors that occurred during pipeline execution. */
  readonly errors: readonly HttpMiddlewareError[];

  constructor(errors: readonly HttpMiddlewareError[]) {
    const message =
      errors.length === 1
        ? `HTTP middleware pipeline failed: ${errors[0]?.message ?? "Unknown error"}`
        : `HTTP middleware pipeline failed with ${errors.length} errors: ${errors
            .map((e) => e.message)
            .join(", ")}`;
    super(message, {
      code: "MIDDLEWARE_PIPELINE_ERROR",
      statusCode: 500,
      expose: false,
    });
    this.name = "HttpMiddlewarePipelineError";
    this.errors = Object.freeze([...errors]);
  }
}
