/**
 * Pipeline-guard middleware errors. Constructors and defaults match the
 * wrappers `@zudojs/middleware` defines over the shared `MiddlewareError`.
 */

import { MiddlewareError } from "./middleware.error.js";

/** Error thrown when a pipeline is configured with more middleware than allowed. */
export class MiddlewareLimitExceededError extends MiddlewareError {
  constructor(count: number, maximum: number) {
    super(
      `Pipeline has ${count} middleware, exceeding the maximum of ${maximum}`,
      { metadata: { count, maximum } },
    );
  }
}

/** Error thrown when the middleware chain nests deeper than the allowed limit. */
export class MiddlewareDepthExceededError extends MiddlewareError {
  constructor(maxDepth: number) {
    super(`Middleware chain exceeded the maximum depth of ${maxDepth}`, {
      metadata: { maxDepth },
    });
  }
}

/**
 * Error thrown when a rate limit is exceeded. `retryAfterMs` feeds a
 * `Retry-After` header.
 */
export class MiddlewareRateLimitError extends MiddlewareError {
  readonly retryAfterMs: number;
  readonly limit: number;
  readonly windowMs: number;

  constructor(limit: number, windowMs: number, retryAfterMs: number) {
    super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, {
      middlewareName: "rate-limit",
      metadata: { middlewareName: "rate-limit" },
    });
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
    this.windowMs = windowMs;
  }
}

/** Error thrown when a pipeline is aborted through its `AbortSignal`. */
export class MiddlewareAbortedError extends MiddlewareError {
  constructor(reason?: unknown) {
    super("Middleware pipeline aborted", { cause: reason });
  }
}
