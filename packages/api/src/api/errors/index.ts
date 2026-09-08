/**
 * @zudojs/api/errors
 *
 * API-specific error classes for the Zudojs framework.
 *
 * Re-exported from @zudojs/errors for convenience.
 */

export {
  APIError,
  APIValidationError,
  APIAuthenticationError,
  APIAuthorizationError,
  APINotFoundError,
  APIConflictError,
  APIRateLimitError,
  APITimeoutError,
  APIUnavailableError,
  APIInternalError,
  APIVersionError,
  APIOperationNotFoundError,
  APIDuplicateOperationError,
  APIIdempotencyError,
  createAPIError,
  isAPIError,
  ErrorCode,
} from "@zudojs/errors";

export type { APIErrorOptions } from "@zudojs/errors";
