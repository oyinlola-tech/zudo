import {
  ErrorCode,
  RPCAuthenticationError,
  RPCCancelledError,
  RPCError,
  RPCForbiddenError,
  RPCInternalError,
  RPCRateLimitedError,
  RPCTimeoutError,
  RPCUnavailableError,
  RPCValidationError,
} from "@zudojs/errors";

import type { APIError } from "../../errors/index.js";

import { API_INTERNAL_ERROR_MESSAGE } from "../shared/apiWireResult.helper.js";

import {
  APIRateLimitError,
  APITimeoutError,
  APIValidationError,
} from "../../errors/index.js";

/**
 * Converts an operation's `APIError` into the RPC error the RPC server
 * maps onto the wire.
 *
 * Errors with an RPC equivalent become it, so a remote caller sees the
 * same wire codes (`RPC_VALIDATION_ERROR` with issue `details`,
 * `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`, `RPC_RATE_LIMITED`,
 * `RPC_TIMEOUT`, `RPC_CANCELLED`, `RPC_UNAVAILABLE`) as for a native
 * procedure. Anything else — `APIConflictError`, `APINotFoundError`, a
 * custom `createAPIError` — becomes an `RPCError` that keeps the API
 * error's `code`, `statusCode` and `expose` flag, so a domain code such as
 * `ERR_API_CONFLICT` survives the trip while a non-exposed message is
 * still withheld. A typed error built with `expose: false` keeps its code
 * but travels with the generic internal message, exactly as over HTTP.
 * The original error is kept as `cause` for `onInternalError`.
 */
export function apiErrorToRPCError(error: APIError, procedure: string): RPCError {
  return withCause(translate(error, procedure), error);
}

function translate(error: APIError, procedure: string): RPCError {
  // The RPC server sends the message of every typed error below, so an
  // error built with `expose: false` must not hand its message over: the
  // HTTP, CLI and queue bindings all replace it with the generic text.
  const exposed = error.expose === true;
  const message = exposed ? error.message : API_INTERNAL_ERROR_MESSAGE;

  switch (error.code) {
    case ErrorCode.API_VALIDATION:
      return new RPCValidationError(
        message,
        exposed && error instanceof APIValidationError ? error.issues : [],
        procedure,
      );
    case ErrorCode.API_AUTHENTICATION:
      return new RPCAuthenticationError(message, procedure);
    case ErrorCode.API_AUTHORIZATION:
      return new RPCForbiddenError(message, procedure);
    case ErrorCode.API_RATE_LIMIT:
      return new RPCRateLimitedError(
        message,
        error instanceof APIRateLimitError ? error.retryAfterSeconds : undefined,
        procedure,
      );
    case ErrorCode.API_TIMEOUT:
      return new RPCTimeoutError(
        error instanceof APITimeoutError ? error.timeoutMs : 0,
        procedure,
      );
    case ErrorCode.OPERATION_CANCELLED:
      return new RPCCancelledError(message, procedure);
    case ErrorCode.API_UNAVAILABLE:
      return new RPCUnavailableError(message, procedure);
    case ErrorCode.API_INTERNAL:
      return new RPCInternalError(message, procedure);
    default:
      return new RPCError(message, {
        code: error.code,
        statusCode: error.statusCode,
        expose: error.expose,
        procedureName: procedure,
      });
  }
}

function withCause(error: RPCError, cause: APIError): RPCError {
  Object.defineProperty(error, "cause", {
    value: cause,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}
