/**
 * Middleware-specific error classes.
 *
 * @module middlewareErrors
 */

import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
} from "@zudojs/errors";

/**
 * Error thrown when a middleware pipeline fails.
 */
export class MiddlewareError extends BaseError {
  constructor(
    message: string,
    options?: {
      readonly middlewareName?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      code: ErrorCode.OPERATION_FAILED,
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.ERROR,
      metadata: {
        middlewareName: options?.middlewareName,
      },
      cause: options?.cause,
    });
  }
}

/**
 * Error thrown when a middleware exceeds its timeout.
 */
export class MiddlewareTimeoutError extends MiddlewareError {
  constructor(middlewareName: string, timeoutMs: number) {
    super(`Middleware "${middlewareName}" timed out after ${timeoutMs}ms`, {
      middlewareName,
    });
  }
}

/**
 * Error thrown when a middleware calls next() multiple times.
 */
export class MiddlewareNextCalledMultipleTimesError extends MiddlewareError {
  constructor(middlewareName: string) {
    super(`Middleware "${middlewareName}" called next() multiple times`, {
      middlewareName,
    });
  }
}

/**
 * Error thrown when a pipeline is configured with more middleware than allowed.
 */
export class MiddlewareLimitExceededError extends MiddlewareError {
  constructor(count: number, maximum: number) {
    super(
      `Pipeline has ${count} middleware, exceeding the maximum of ${maximum}`,
    );
  }
}

/**
 * Error thrown when the middleware chain nests deeper than the allowed limit.
 */
export class MiddlewareDepthExceededError extends MiddlewareError {
  constructor(maxDepth: number) {
    super(`Middleware chain exceeded the maximum depth of ${maxDepth}`);
  }
}

/**
 * Error thrown when a rate limit is exceeded.
 *
 * `retryAfterMs` tells the caller how long to wait before retrying, which is
 * what an HTTP adapter needs to emit a `Retry-After` header alongside a 429.
 */
export class MiddlewareRateLimitError extends MiddlewareError {
  readonly retryAfterMs: number;
  readonly limit: number;
  readonly windowMs: number;

  constructor(limit: number, windowMs: number, retryAfterMs: number) {
    super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, {
      middlewareName: "rate-limit",
    });
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
    this.windowMs = windowMs;
  }
}

/**
 * Error thrown when a pipeline is aborted through its `AbortSignal`.
 */
export class MiddlewareAbortedError extends MiddlewareError {
  constructor(reason?: unknown) {
    super("Middleware pipeline aborted", { cause: reason });
  }
}
