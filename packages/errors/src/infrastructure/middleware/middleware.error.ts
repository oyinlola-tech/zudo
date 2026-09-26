import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating a middleware error.
 */
export interface MiddlewareErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly middlewareName?: string;
}

/**
 * Error raised by a middleware function.
 */
export class MiddlewareError extends BaseError {
  public readonly middlewareName?: string;

  constructor(message: string, options: MiddlewareErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.MIDDLEWARE_EXECUTION,
      category: options.category ?? ErrorCategory.MIDDLEWARE,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });

    this.middlewareName = options.middlewareName;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.middlewareName !== undefined
        ? {
            middlewareName: this.middlewareName,
          }
        : {}),
    };
  }
}

/**
 * Creates a middleware error.
 */
export function createMiddlewareError(
  message: string,
  options: MiddlewareErrorOptions = {},
): MiddlewareError {
  return new MiddlewareError(message, options);
}

/**
 * Determines whether an unknown value is a MiddlewareError.
 */
export function isMiddlewareError(value: unknown): value is MiddlewareError {
  return value instanceof MiddlewareError;
}

/**
 * Error raised when a middleware function times out.
 */
export class MiddlewareTimeoutError extends MiddlewareError {
  public readonly timeoutMs: number;

  constructor(middlewareName: string, timeoutMs: number) {
    // A middleware that ran out of time is a gateway timeout to the client
    // (504), not an internal error (500). Message and code stay internal.
    super(`Middleware "${middlewareName}" timed out after ${timeoutMs}ms.`, {
      code: ErrorCode.MIDDLEWARE_TIMEOUT,
      middlewareName,
      statusCode: 504,
      metadata: { timeoutMs },
    });

    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error raised when next() is called multiple times in a middleware.
 */
export class MiddlewareNextCalledMultipleTimesError extends MiddlewareError {
  constructor(middlewareName: string) {
    super(`Middleware "${middlewareName}" called next() multiple times.`, {
      middlewareName,
      statusCode: 500,
      isOperational: false,
    });
  }
}
