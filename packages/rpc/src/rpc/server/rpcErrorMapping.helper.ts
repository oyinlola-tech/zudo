import type { RPCErrorPayload } from "../types/rpcResponse.type.js";

import {
  isRPCError,
  RPCAuthenticationError,
  RPCCancelledError,
  RPCDeadlineExceededError,
  RPCDeserializationError,
  RPCForbiddenError,
  RPCInternalError,
  RPCInvalidRequestError,
  RPCProcedureNotFoundError,
  RPCRateLimitedError,
  RPCSerializationError,
  RPCTimeoutError,
  RPCTransportError,
  RPCUnavailableError,
  RPCValidationError,
} from "../errors/rpc.errors.js";

import { INTERNAL_ERROR_MESSAGE } from "../constants/rpcConstants.core.js";

import { mapExposedBaseError } from "./rpcBaseErrorMapping.helper.js";

/**
 * Wire codes for the error types the server maps.
 *
 * Ordered most specific first; every entry is a type a caller can act
 * on, which is why they must not be collapsed into a generic internal
 * error. The third element marks a typed error whose message is server
 * detail: its code travels, its message goes to `onInternalError`.
 */
const ERROR_CODES: ReadonlyArray<
  readonly [new (...args: never[]) => Error, string, boolean?]
> = [
  [RPCProcedureNotFoundError, "RPC_PROCEDURE_NOT_FOUND"],
  [RPCValidationError, "RPC_VALIDATION_ERROR"],
  [RPCInvalidRequestError, "RPC_INVALID_REQUEST"],
  [RPCAuthenticationError, "RPC_UNAUTHENTICATED"],
  [RPCForbiddenError, "RPC_FORBIDDEN"],
  [RPCRateLimitedError, "RPC_RATE_LIMITED"],
  [RPCDeadlineExceededError, "RPC_DEADLINE_EXCEEDED"],
  [RPCTimeoutError, "RPC_TIMEOUT"],
  [RPCCancelledError, "RPC_CANCELLED"],
  [RPCUnavailableError, "RPC_UNAVAILABLE"],
  [RPCSerializationError, "RPC_SERIALIZATION_ERROR", true],
  [RPCDeserializationError, "RPC_DESERIALIZATION_ERROR"],
];

/**
 * An error mapped onto the wire.
 *
 * `internal` is `true` when the original error carried server detail that
 * was withheld from `payload`; transports hand the original error to their
 * `onInternalError` hook in that case so the failure stays diagnosable.
 */
export interface RPCMappedError {
  readonly payload: RPCErrorPayload;
  readonly internal: boolean;
}

/**
 * Maps any thrown value onto a wire-safe error payload.
 *
 * Typed RPC errors keep their wire code (and, for validation and rate
 * limiting, their `details`). A `@zudojs/errors` error built with
 * `expose: true` — `NotFoundError`, `ConflictError`, `ValidationError` … —
 * travels with its own message under the matching code (`RPC_NOT_FOUND`,
 * `RPC_CONFLICT`, `RPC_VALIDATION_ERROR` …). Anything not built to be
 * exposed — an `RPCInternalError`, a non-exposed custom `RPCError` or
 * `BaseError`, or any other error — is answered with
 * {@link INTERNAL_ERROR_MESSAGE}, so exception text, stack traces and
 * causes never reach the remote side.
 */
export function mapRPCError(error: unknown): RPCMappedError {
  if (error instanceof RPCInternalError || !(error instanceof Error)) {
    return internalFailure("RPC_INTERNAL_ERROR");
  }

  for (const [type, code, internal] of ERROR_CODES) {
    if (error instanceof type) {
      return internal === true
        ? internalFailure(code)
        : exposed(code, error.message, detailsOf(error));
    }
  }

  if (isRPCError(error)) {
    return error.expose === false
      ? internalFailure(error.code)
      : exposed(error.code, error.message, undefined);
  }

  const base = mapExposedBaseError(error);
  if (base !== undefined) {
    return { payload: base, internal: false };
  }

  return internalFailure("RPC_INTERNAL_ERROR");
}

/**
 * The wire code of a typed RPC error — `RPC_TIMEOUT` for an
 * `RPCTimeoutError`, and so on — or `undefined` for anything without one.
 * The client stamps it on every error it rejects with, so a caller
 * compares `error.code` against the same strings whether the failure was
 * reported by the server or raised locally (its own deadline, a cancel).
 */
export function rpcWireCodeOf(error: unknown): string | undefined {
  if (error instanceof RPCInternalError) {
    return "RPC_INTERNAL_ERROR";
  }
  if (error instanceof RPCTransportError) {
    return "RPC_TRANSPORT_ERROR";
  }
  return ERROR_CODES.find(([type]) => error instanceof type)?.[1];
}

function detailsOf(error: Error): unknown {
  if (
    error instanceof RPCValidationError &&
    error.issues !== undefined &&
    error.issues.length > 0
  ) {
    return error.issues;
  }
  if (error instanceof RPCRateLimitedError && error.retryAfter !== undefined) {
    return { retryAfter: error.retryAfter };
  }
  return undefined;
}

function exposed(code: string, message: string, details: unknown): RPCMappedError {
  return {
    payload: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    internal: false,
  };
}

function internalFailure(code: string): RPCMappedError {
  return { payload: { code, message: INTERNAL_ERROR_MESSAGE }, internal: true };
}
