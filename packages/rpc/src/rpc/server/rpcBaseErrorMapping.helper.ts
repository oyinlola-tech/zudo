/**
 * Wire mapping for exposable `@zudojs/errors` errors that are not RPC
 * errors — a `NotFoundError` or `ConflictError` thrown by domain code a
 * procedure calls.
 */

import { isBaseError, RateLimitError, ValidationError } from "@zudojs/errors";

import type { RPCErrorPayload } from "../types/rpcResponse.type.js";

/** Wire code for each HTTP-style status an exposable error can carry. */
const STATUS_WIRE_CODES: ReadonlyMap<number, string> = new Map([
  [400, "RPC_VALIDATION_ERROR"],
  [401, "RPC_UNAUTHENTICATED"],
  [403, "RPC_FORBIDDEN"],
  [404, "RPC_NOT_FOUND"],
  [408, "RPC_TIMEOUT"],
  [409, "RPC_CONFLICT"],
  [422, "RPC_VALIDATION_ERROR"],
  [429, "RPC_RATE_LIMITED"],
  [503, "RPC_UNAVAILABLE"],
  [504, "RPC_TIMEOUT"],
]);

function validationDetails(error: ValidationError): unknown {
  if (error.issues.length === 0) {
    return undefined;
  }
  // The received `value` is dropped: a response never echoes caller input.
  return error.issues.map((issue) => ({
    path: (issue.path ?? (issue.field !== undefined ? [issue.field] : [])).map(String).join("."),
    code: issue.code ?? "invalid",
    message: issue.message,
  }));
}

/**
 * Maps a `@zudojs/errors` error built with `expose: true` onto a wire
 * payload: its status picks the RPC code (404 → `RPC_NOT_FOUND`, 409 →
 * `RPC_CONFLICT`, 401, 403, 422, 429 …; a `ValidationError` is always
 * `RPC_VALIDATION_ERROR`), and an unlisted status keeps the error's own
 * code. The message is the error's own, which `expose: true` declares
 * safe. Returns `undefined` for anything else, which stays internal.
 */
export function mapExposedBaseError(error: unknown): RPCErrorPayload | undefined {
  if (!isBaseError(error) || error.expose !== true) {
    return undefined;
  }

  const code =
    error instanceof ValidationError
      ? "RPC_VALIDATION_ERROR"
      : (STATUS_WIRE_CODES.get(error.statusCode) ?? String(error.code));

  const details =
    error instanceof ValidationError
      ? validationDetails(error)
      : error instanceof RateLimitError && error.retryAfterSeconds !== undefined
        ? { retryAfter: error.retryAfterSeconds }
        : undefined;

  return {
    code,
    message: error.message,
    ...(details !== undefined ? { details } : {}),
  };
}
