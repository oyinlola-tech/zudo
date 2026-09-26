/**
 * Default error-to-response mapping shared by the adapters.
 *
 * An error thrown from a handler used to be answered with a generic 500 no
 * matter what it was, so `throw notFound()` — the documented way to fail a
 * request — reached the client as `500 Internal Server Error` with the
 * error's status, message and headers (`WWW-Authenticate`, `Allow`,
 * `Retry-After`) all discarded. Middleware wrappers made it worse: the
 * pipeline wraps every failure in `HttpMiddlewareError` /
 * `HttpMiddlewarePipelineError`, both of which report status 500, so the
 * original error's status was hidden even from a custom error handler that
 * only looked one level deep.
 *
 * This module is deliberately internal: it is not part of the public API.
 *
 * @module httpAdapter/errorResponse/response
 */

import { getStatusText } from "../../httpResponse/core/httpResponse.statusText.js";

import { statusName } from "../../httpStatus/httpStatus.name.js";

import { isValidHeaderFieldValue } from "../../httpHeaders/security/index.js";

import { findStatusError } from "./httpAdapterError.locate.js";

import { publicIssues } from "./httpAdapterError.issues.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ResolvedErrorResponse {
  readonly status: number;

  readonly body: Readonly<Record<string, unknown>>;

  readonly headers: Readonly<Record<string, string>>;
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds the default response for an unhandled error.
 *
 * - The outermost error with a 4xx/5xx `statusCode` (looking through the
 *   pipeline's own wrappers only) is answered with that status.
 * - Its `message`, `code` and validation `issues` are included only when
 *   the error opts in with `expose: true` (the `@zudojs/errors` default for
 *   4xx); otherwise the body carries the status text and the status's
 *   symbolic name as `code`, so a 5xx never leaks internals.
 * - Its `headers` are applied when they are valid header values.
 * - Anything else is a generic `500 Internal Server Error`.
 *
 * Every body has the same shape, `{ error, code, issues? }`: `code` used to
 * be present only on exposed errors, and a thrown validation error lost its
 * issues, so a client saw `{"error":"Validation failed"}` with nothing to
 * act on.
 */
export function resolveErrorResponse(error: unknown): ResolvedErrorResponse {
  const statusError = findStatusError(error, 0, new Set());

  if (!statusError) {
    return {
      status: 500,
      body: { error: "Internal Server Error", code: "INTERNAL_SERVER_ERROR" },
      headers: {},
    };
  }

  const status = statusError.statusCode;

  const expose = statusError.expose === true;

  const message =
    expose && typeof statusError.message === "string" && statusError.message
      ? statusError.message
      : getStatusText(status);

  const code =
    expose && typeof statusError.code === "string" && statusError.code
      ? statusError.code
      : statusName(status);

  const body: Record<string, unknown> = { error: message, code };

  const issues = expose ? publicIssues(statusError.issues) : undefined;

  if (issues !== undefined) {
    body.issues = issues;
  }

  return {
    status,
    body,
    headers: collectHeaders(statusError.headers),
  };
}

function collectHeaders(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== "object") {
    return {};
  }

  const headers: Record<string, string> = {};

  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string" || !isValidHeaderFieldValue(entry)) {
      continue;
    }

    headers[name] = entry;
  }

  return headers;
}
