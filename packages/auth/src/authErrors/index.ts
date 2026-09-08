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
  AccountLockedError,
  AccountDeactivatedError,
  AccessDeniedError,
  SessionExpiredError,
  AuthRateLimitError,
} from "./authError.base.js";
