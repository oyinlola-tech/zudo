import type { RPCErrorPayload } from "../types/rpcResponse.type.js";

import {
  RPCAuthenticationError,
  RPCCancelledError,
  RPCError,
  RPCForbiddenError,
  RPCInvalidRequestError,
  RPCProcedureNotFoundError,
  RPCRateLimitedError,
  RPCTimeoutError,
  RPCUnavailableError,
  RPCValidationError,
} from "../errors/rpc.errors.js";

type ValidationIssues = ConstructorParameters<typeof RPCValidationError>[1];

/**
 * Rebuilds a typed error from an error response's payload.
 *
 * The wire code drives the class, so a caller can tell a validation
 * failure from an authentication failure or a timeout with `instanceof`
 * rather than string matching. Every rebuilt error carries the server's
 * wire `code` (`error.code === "RPC_TIMEOUT"`, `"RPC_VALIDATION_ERROR"`,
 * `"RPC_NOT_FOUND"` …) and its `details`.
 */
export function rpcErrorFromWire(
  payload: RPCErrorPayload | undefined,
  procedure: string,
): RPCError {
  const message = payload?.message ?? "RPC call failed.";
  const code = payload?.code;
  const details = payload?.details;

  switch (code) {
    case "RPC_TIMEOUT":
      return withWire(withMessage(new RPCTimeoutError(0, procedure), message), code, details);
    case "RPC_CANCELLED":
      return withWire(new RPCCancelledError(message, procedure), code, details);
    case "RPC_UNAVAILABLE":
      return withWire(new RPCUnavailableError(message, procedure), code, details);
    case "RPC_PROCEDURE_NOT_FOUND":
      return withWire(
        withMessage(new RPCProcedureNotFoundError(procedure), message),
        code,
        details,
      );
    case "RPC_VALIDATION_ERROR":
      return withWire(
        new RPCValidationError(
          message,
          (Array.isArray(details) ? details : []) as ValidationIssues,
          procedure,
        ),
        code,
        details,
      );
    case "RPC_INVALID_REQUEST":
      return withWire(new RPCInvalidRequestError(message, procedure), code, details);
    case "RPC_UNAUTHENTICATED":
      return withWire(new RPCAuthenticationError(message, procedure), code, details);
    case "RPC_FORBIDDEN":
      return withWire(new RPCForbiddenError(message, procedure), code, details);
    case "RPC_RATE_LIMITED":
      return withWire(
        new RPCRateLimitedError(message, retryAfterOf(details), procedure),
        code,
        details,
      );
    default:
      return withWire(
        new RPCError(message, { procedureName: procedure }),
        code,
        details,
      );
  }
}

function retryAfterOf(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null) {
    return undefined;
  }
  const value = (details as { retryAfter?: unknown }).retryAfter;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function withMessage<T extends Error>(error: T, message: string): T {
  Object.defineProperty(error, "message", {
    value: message,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}

function withWire<T extends RPCError>(
  error: T,
  code: string | undefined,
  details: unknown,
): T {
  Object.defineProperty(error, "code", {
    value: code ?? error.code,
    enumerable: true,
    configurable: true,
  });

  if (details !== undefined) {
    Object.defineProperty(error, "details", {
      value: details,
      enumerable: true,
      configurable: true,
    });
  }

  return error;
}
