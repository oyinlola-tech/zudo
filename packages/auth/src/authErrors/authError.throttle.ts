/**
 * Throttling errors: lockout and rate limit.
 *
 * Both carry `retryAfterSeconds` and a `Retry-After` header in `headers`.
 * `@zudojs/http` copies an error's `headers` onto the response it answers
 * the error with, so a client told `423 Locked` or `429 Too Many Requests`
 * also learns when to try again; the lockout used to go out without one.
 *
 * @module authErrors/authError.throttle
 */

import {
  AuthError,
  ErrorCategory,
  ErrorCode,
  type AuthErrorOptions,
} from "@zudojs/errors";

/** Options shared by the throttling errors. */
export type ThrottleErrorOptions = AuthErrorOptions & {
  /** Seconds until the client may retry. Rounded up; at least 1. */
  readonly retryAfterSeconds?: number;
};

function toRetryAfter(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.ceil(value));
}

function retryAfterHeaders(seconds: number): Readonly<Record<string, string>> {
  return Object.freeze({ "retry-after": String(seconds) });
}

/**
 * User account is locked (too many failed attempts).
 *
 * `423 Locked`, code `ERR_ACCOUNT_LOCKED`. `retryAfterSeconds` is the time
 * left on the lockout, and `headers` carries it as `Retry-After`.
 */
export class AccountLockedError extends AuthError {
  /** Seconds until the lockout lapses. */
  readonly retryAfterSeconds: number;
  /** Response headers for this error: `Retry-After`. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    message = "Account is locked due to too many failed attempts",
    options?: ThrottleErrorOptions,
  ) {
    const { retryAfterSeconds, metadata, ...rest } = options ?? {};
    const seconds = toRetryAfter(retryAfterSeconds, 900);
    super(message, {
      code: ErrorCode.ACCOUNT_LOCKED,
      category: ErrorCategory.RATE_LIMIT,
      statusCode: 423,
      ...rest,
      metadata: { retryAfterSeconds: seconds, ...metadata },
    });
    this.retryAfterSeconds = seconds;
    this.headers = retryAfterHeaders(seconds);
  }
}

/**
 * Rate limit exceeded for an auth endpoint.
 *
 * `429 Too Many Requests`; `headers` carries `Retry-After`.
 */
export class AuthRateLimitError extends AuthError {
  /** Seconds until the window resets. */
  readonly retryAfterSeconds: number;
  /** Response headers for this error: `Retry-After`. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    message = "Too many authentication attempts",
    options?: ThrottleErrorOptions,
  ) {
    const { retryAfterSeconds, metadata, ...rest } = options ?? {};
    const seconds = toRetryAfter(retryAfterSeconds, 60);
    super(message, {
      code: ErrorCode.RATE_LIMITED,
      category: ErrorCategory.RATE_LIMIT,
      statusCode: 429,
      ...rest,
      metadata: { retryAfterSeconds: seconds, ...metadata },
    });
    this.retryAfterSeconds = seconds;
    this.headers = retryAfterHeaders(seconds);
  }
}
