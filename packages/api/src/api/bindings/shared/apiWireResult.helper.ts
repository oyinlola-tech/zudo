import type { APIResult } from "../../result/apiResult.type.js";

import type { APIError } from "../../errors/index.js";

import { APIValidationError } from "../../errors/index.js";

/**
 * Message sent in place of any error that was not built to be exposed.
 */
export const API_INTERNAL_ERROR_MESSAGE = "An internal error occurred.";

/**
 * The client-safe form of an `APIError`, identical across bindings: the
 * HTTP body, the CLI's stderr, and what a queue records all carry it.
 *
 * `message` is the error's own message only when the error is
 * `expose: true`; otherwise it is {@link API_INTERNAL_ERROR_MESSAGE}.
 * `issues` appears only on validation failures and holds the executor's
 * already-redacted `"<path>: invalid"` entries. Stack traces, causes and
 * metadata are never included.
 */
export interface APIWireError {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly requestId: string;
  readonly issues?: readonly string[];
}

/**
 * The client-safe form of an `APIResult`.
 */
export type APIWireResult<T = unknown> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: APIWireError };

/**
 * The HTTP-style status of an error: its `statusCode` when that is an
 * integer in 400–599, otherwise 500.
 */
export function apiErrorStatus(error: APIError): number {
  const status = error.statusCode;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

/**
 * Converts an `APIError` into its client-safe {@link APIWireError}.
 */
export function toApiWireError(error: APIError, requestId: string): APIWireError {
  const exposed = error.expose === true;
  const issues =
    exposed && error instanceof APIValidationError && error.issues.length > 0
      ? error.issues
      : undefined;

  return Object.freeze({
    code: String(error.code),
    message: exposed ? error.message : API_INTERNAL_ERROR_MESSAGE,
    statusCode: apiErrorStatus(error),
    requestId,
    ...(issues !== undefined ? { issues } : {}),
  });
}

/**
 * Converts an executor result into its client-safe {@link APIWireResult}.
 */
export function toApiWireResult<T>(result: APIResult<T>, requestId: string): APIWireResult<T> {
  return result.ok
    ? Object.freeze({ ok: true as const, data: result.data })
    : Object.freeze({ ok: false as const, error: toApiWireError(result.error, requestId) });
}
