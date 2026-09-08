/**
 * API lifecycle error classes — rate limit, timeout, availability.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import {
  assertFiniteNonNegative,
  normalizeRetryAfterSeconds,
} from "../shared/domainError.helpers.js";
import { APIError } from "./apiError.base.js";

/**
 * Error thrown when an API rate limit is exceeded.
 *
 * `retryAfter` is expressed in seconds (as the HTTP `Retry-After` header);
 * fractional values are rounded up and the value is only recorded in
 * metadata (as `retryAfterSeconds`) when provided.
 */
export class APIRateLimitError extends APIError {
  /** Seconds to wait before retrying, if known. */
  public readonly retryAfterSeconds?: number;
  /** @deprecated Use `retryAfterSeconds`. */
  public readonly retryAfter?: number;

  constructor(
    message = "API rate limit exceeded.",
    retryAfter?: number,
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    const retryAfterSeconds =
      retryAfter !== undefined
        ? normalizeRetryAfterSeconds(retryAfter, "retryAfter")
        : undefined;
    super(message, {
      code: ErrorCode.API_RATE_LIMIT,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      metadata: retryAfterSeconds !== undefined ? { retryAfterSeconds } : {},
      statusCode: 429,
      expose: true,
    });
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryAfter = retryAfterSeconds;
  }
}

/** Error thrown when an API operation times out. */
export class APITimeoutError extends APIError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    assertFiniteNonNegative("timeoutMs", timeoutMs);
    super(`API operation timed out after ${timeoutMs}ms.`, {
      code: ErrorCode.API_TIMEOUT,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      metadata: { timeoutMs },
      statusCode: 504,
      expose: false,
    });
    this.timeoutMs = timeoutMs;
  }
}

/** Error thrown when an API service is unavailable. */
export class APIUnavailableError extends APIError {
  constructor(
    message = "API service is temporarily unavailable.",
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_UNAVAILABLE,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 503,
      expose: true,
    });
  }
}

/** Error thrown when an unexpected internal API error occurs. */
export class APIInternalError extends APIError {
  constructor(
    message = "An unexpected internal API error occurred.",
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_INTERNAL,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an API idempotency check fails. */
export class APIIdempotencyError extends APIError {
  constructor(
    message: string,
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_IDEMPOTENCY,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 409,
      expose: true,
    });
  }
}
