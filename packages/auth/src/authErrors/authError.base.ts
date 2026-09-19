/**
 * Authentication and authorization error classes.
 *
 * @module authErrors
 *
 * Every error in this module carries an accurate HTTP `statusCode` and is
 * marked `expose: true`. The messages are deliberately generic (they never
 * name a user, a password, or an account state that the caller did not
 * already supply), so they are safe to return to a client verbatim.
 */

import {
  AuthError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  type AuthErrorOptions,
} from "@zudojs/errors";

/**
 * `AuthError` (the base of every class below) and `AuthErrorOptions` live
 * in `@zudojs/errors`; they are re-exported here so existing imports keep
 * working. Defaults: `401 Unauthorized`, category `authentication`,
 * `expose: true`; every default can be overridden.
 */
export { AuthError, type AuthErrorOptions };

/**
 * The package is misconfigured (missing/weak signing secret, missing
 * permission engine, …). Not caused by the request, so `500` and not exposed.
 */
export class AuthConfigurationError extends AuthError {
  constructor(message: string, options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.CONFIGURATION_INVALID,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      statusCode: 500,
      expose: false,
      isOperational: false,
      ...options,
    });
  }
}

/**
 * Invalid credentials (wrong password, unknown user).
 *
 * Deliberately identical for "no such user" and "wrong password" so the
 * login endpoint is not an account-existence oracle.
 */
export class InvalidCredentialsError extends AuthError {
  constructor(message = "Invalid credentials", options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.INVALID_CREDENTIALS,
      statusCode: 401,
      ...options,
    });
  }
}

/**
 * Token has expired.
 */
export class TokenExpiredError extends AuthError {
  constructor(message = "Token has expired", options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.TOKEN_EXPIRED,
      statusCode: 401,
      ...options,
    });
  }
}

/**
 * Token is invalid or malformed.
 */
export class TokenInvalidError extends AuthError {
  constructor(message = "Token is invalid", options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.TOKEN_INVALID,
      statusCode: 401,
      ...options,
    });
  }
}

/**
 * Token has been revoked.
 */
export class TokenRevokedError extends AuthError {
  constructor(message = "Token has been revoked", options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION,
      statusCode: 403,
      ...options,
    });
  }
}

/**
 * User account is locked (too many failed attempts).
 *
 * `423 Locked`; `metadata.retryAfterSeconds` is intended for a `Retry-After`
 * response header.
 */
export class AccountLockedError extends AuthError {
  constructor(
    message = "Account is locked due to too many failed attempts",
    options?: AuthErrorOptions & { readonly retryAfterSeconds?: number },
  ) {
    const { retryAfterSeconds, metadata, ...rest } = options ?? {};
    super(message, {
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.RATE_LIMIT,
      statusCode: 423,
      ...rest,
      metadata: {
        retryAfterSeconds: retryAfterSeconds ?? 900,
        ...metadata,
      },
    });
  }
}

/**
 * User account is deactivated.
 */
export class AccountDeactivatedError extends AuthError {
  constructor(
    message = "User account is deactivated",
    options?: AuthErrorOptions,
  ) {
    super(message, {
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION,
      statusCode: 403,
      ...options,
    });
  }
}

/**
 * Access denied (insufficient permissions).
 */
export class AccessDeniedError extends AuthError {
  constructor(
    message = "Access denied",
    options?: AuthErrorOptions & { readonly requiredPermission?: string },
  ) {
    const { requiredPermission, metadata, ...rest } = options ?? {};
    super(message, {
      code: ErrorCode.ACCESS_DENIED,
      category: ErrorCategory.AUTHORIZATION,
      statusCode: 403,
      ...rest,
      metadata: {
        ...(requiredPermission !== undefined ? { requiredPermission } : {}),
        ...metadata,
      },
    });
  }
}

/**
 * Session has expired or is invalid.
 */
export class SessionExpiredError extends AuthError {
  constructor(message = "Session has expired", options?: AuthErrorOptions) {
    super(message, {
      code: ErrorCode.SESSION_EXPIRED,
      statusCode: 401,
      ...options,
    });
  }
}

/**
 * Rate limit exceeded for an auth endpoint.
 */
export class AuthRateLimitError extends AuthError {
  constructor(
    message = "Too many authentication attempts",
    options?: AuthErrorOptions & { readonly retryAfterSeconds?: number },
  ) {
    const { retryAfterSeconds, metadata, ...rest } = options ?? {};
    super(message, {
      code: ErrorCode.RATE_LIMITED,
      category: ErrorCategory.RATE_LIMIT,
      statusCode: 429,
      ...rest,
      metadata: {
        retryAfterSeconds: retryAfterSeconds ?? 60,
        ...metadata,
      },
    });
  }
}
