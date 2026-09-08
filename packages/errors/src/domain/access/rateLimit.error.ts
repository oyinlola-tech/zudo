import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { normalizeRetryAfterSeconds } from "../shared/domainError.helpers.js";

/**
 * Options for creating a rate-limit error.
 */
export interface RateLimitErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  /**
   * Number of seconds the client should wait before retrying.
   *
   * Must be a finite non-negative number; fractional values are rounded up
   * because the HTTP `Retry-After` header requires an integer.
   */
  readonly retryAfterSeconds?: number;
}

/**
 * Error raised when a client exceeds an allowed request or operation rate.
 */
export class RateLimitError extends BaseError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message = "Too many requests. Please try again later.",
    options: RateLimitErrorOptions = {},
  ) {
    const retryAfterSeconds =
      options.retryAfterSeconds !== undefined
        ? normalizeRetryAfterSeconds(options.retryAfterSeconds)
        : undefined;
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.RATE_LIMITED,
      category: options.category ?? ErrorCategory.RATE_LIMIT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 429,
      expose: options.expose ?? true,
      isOperational: options.isOperational ?? true,
      metadata: {
        ...options.metadata,
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      },
    });

    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  /** Returns the retry-after value in seconds. */
  public getRetryAfterSeconds(): number | undefined {
    return this.retryAfterSeconds;
  }

  /** Returns the retry-after value in milliseconds. */
  public getRetryAfterMilliseconds(): number | undefined {
    if (this.retryAfterSeconds === undefined) return undefined;
    return this.retryAfterSeconds * 1000;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: this.retryAfterSeconds }
        : {}),
    };
  }
}

/** Creates a rate-limit error. */
export function createRateLimitError(
  retryAfterSeconds?: number,
  message = "Too many requests. Please try again later.",
): RateLimitError {
  return new RateLimitError(message, { retryAfterSeconds });
}

/** Determines whether an unknown value is a RateLimitError. */
export function isRateLimitError(value: unknown): value is RateLimitError {
  return value instanceof RateLimitError;
}

/** Creates a rate-limit error that asks the client to retry after the specified number of seconds. */
export function retryAfterError(retryAfterSeconds: number): RateLimitError {
  return new RateLimitError("Too many requests. Please try again later.", {
    retryAfterSeconds,
  });
}
