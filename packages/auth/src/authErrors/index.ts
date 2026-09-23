/**
 * Authentication and authorization error types.
 *
 * @module authErrors
 */

export {
  AuthError,
  type AuthErrorOptions,
  AuthConfigurationError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
  AccountDeactivatedError,
  AccessDeniedError,
  SessionExpiredError,
} from "./authError.base.js";
export {
  AccountLockedError,
  AuthRateLimitError,
  type ThrottleErrorOptions,
} from "./authError.throttle.js";
