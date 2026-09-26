/**
 * Pipeline-guard middleware errors. Constructors and defaults match the
 * wrappers `@zudojs/middleware` defines over the shared `MiddlewareError`.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { MiddlewareError } from "./middleware.error.js";

/**
 * `Retry-After` in whole seconds, never below 1: a client told to retry
 * after 0 seconds retries immediately and is refused again.
 */
function retryAfterSeconds(retryAfterMs: number): number {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

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
 * Error thrown when a rate limit is exceeded.
 *
 * Reaches HTTP clients as a 429 with `ERR_RATE_LIMITED`, an exposed message
 * and a `Retry-After` header (`headers`), which `@zudojs/http` copies onto
 * the response. It used to be a generic, unexposed 500 with the middleware
 * execution code, so the documented 429 never happened.
 */
export class MiddlewareRateLimitError extends MiddlewareError {
  readonly retryAfterMs: number;
  readonly limit: number;
  readonly windowMs: number;
  /** Response headers for an HTTP adapter: `retry-after` in whole seconds. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(limit: number, windowMs: number, retryAfterMs: number) {
    super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, {
      middlewareName: "rate-limit",
      code: ErrorCode.RATE_LIMITED,
      statusCode: 429,
      expose: true,
      severity: ErrorSeverity.WARNING,
      metadata: { middlewareName: "rate-limit", limit, windowMs, retryAfterMs },
    });
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
    this.windowMs = windowMs;
    this.headers = Object.freeze({
      "retry-after": String(retryAfterSeconds(retryAfterMs)),
    });
  }
}

/** Error thrown when a pipeline is aborted through its `AbortSignal`. */
export class MiddlewareAbortedError extends MiddlewareError {
  constructor(reason?: unknown) {
    super("Middleware pipeline aborted", { cause: reason });
  }
}
