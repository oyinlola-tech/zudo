/**
 * Server HTTP error factory functions (5xx).
 *
 * @module httpErrors/factories/server
 */

import type { HttpErrorOptions } from "../httpError.type.js";

import { HttpError } from "../httpError.base.js";

/*
 * Every 5xx factory hides its message from the client by default.
 *
 * `serviceUnavailable("Down for maintenance until 04:00")` reaches the
 * client as the bare status text (`{"error":"Service Unavailable"}`) unless
 * `{ expose: true }` is passed, because a 5xx message is often a caught
 * exception's text (`serviceUnavailable(error.message)`) and must not leak.
 * The message is still logged and still on `error.message`. To show a
 * message on purpose:
 *
 *   throw serviceUnavailable("Down for maintenance until 04:00", { expose: true });
 */

/**
 * Creates a 500 Internal Server Error. The message is hidden from the client
 * unless `{ expose: true }` is passed.
 */
export function internalServerError(
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(500, message ?? "Internal Server Error", {
    ...options,
    code: options?.code ?? "INTERNAL_SERVER_ERROR",
  });
}

/**
 * Creates a 501 Not Implemented error. The message is hidden from the client
 * unless `{ expose: true }` is passed.
 */
export function notImplemented(
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(501, message ?? "Not Implemented", {
    ...options,
    code: options?.code ?? "NOT_IMPLEMENTED",
  });
}

/**
 * Creates a 502 Bad Gateway error. The message is hidden from the client
 * unless `{ expose: true }` is passed.
 */
export function badGateway(
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(502, message ?? "Bad Gateway", {
    ...options,
    code: options?.code ?? "BAD_GATEWAY",
  });
}

/**
 * Creates a 503 Service Unavailable error. The message is hidden from the
 * client unless `{ expose: true }` is passed (see the note above).
 */
export function serviceUnavailable(
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(503, message ?? "Service Unavailable", {
    ...options,
    code: options?.code ?? "SERVICE_UNAVAILABLE",
  });
}

/**
 * Creates a 504 Gateway Timeout error. The message is hidden from the client
 * unless `{ expose: true }` is passed.
 */
export function gatewayTimeout(
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(504, message ?? "Gateway Timeout", {
    ...options,
    code: options?.code ?? "GATEWAY_TIMEOUT",
  });
}
