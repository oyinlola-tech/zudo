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
 * @module httpAdapter/errorResponse
 */

import { getStatusText } from "../httpResponse/core/httpResponse.statusText.js";

import { isValidHeaderFieldValue } from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ResolvedErrorResponse {
  readonly status: number;

  readonly body: Readonly<Record<string, unknown>>;

  readonly headers: Readonly<Record<string, string>>;
}

interface StatusErrorLike {
  readonly statusCode: number;

  readonly message?: unknown;

  readonly expose?: unknown;

  readonly code?: unknown;

  readonly headers?: unknown;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How many levels of `cause` / `errors` nesting are inspected. Deep enough
 * for the pipeline's two wrappers plus a few application layers; bounded so a
 * cyclic `cause` chain cannot loop.
 */
const MAX_UNWRAP_DEPTH = 8;

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Locates the innermost error that carries an HTTP status.
 *
 * The innermost one wins because outer errors are wrappers added on the way
 * out (middleware, pipeline, adapter); the error the application actually
 * threw sits at the bottom of the chain.
 */
function findStatusError(
  error: unknown,
  depth: number,
  seen: Set<unknown>,
): StatusErrorLike | undefined {
  if (error === null || typeof error !== "object" || depth > MAX_UNWRAP_DEPTH) {
    return undefined;
  }

  if (seen.has(error)) {
    return undefined;
  }

  seen.add(error);

  const candidate = error as {
    readonly statusCode?: unknown;
    readonly cause?: unknown;
    readonly errors?: unknown;
  };

  const nested: unknown[] = [];

  if (Array.isArray(candidate.errors)) {
    nested.push(...candidate.errors);
  }

  if (candidate.cause !== undefined) {
    nested.push(candidate.cause);
  }

  for (const inner of nested) {
    const found = findStatusError(inner, depth + 1, seen);

    if (found) {
      return found;
    }
  }

  if (isHttpStatus(candidate.statusCode)) {
    return candidate as StatusErrorLike;
  }

  return undefined;
}

function isHttpStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  );
}

/**
 * Builds the default response for an unhandled error.
 *
 * - An error (or any error in its `cause` / `errors` chain) with a 4xx/5xx
 *   `statusCode` is answered with that status.
 * - Its `message` and `code` are included only when the error opts in with
 *   `expose: true` (the `@zudojs/errors` default for 4xx); otherwise the
 *   body carries the status text alone, so a 5xx never leaks internals.
 * - Its `headers` are applied when they are valid header values.
 * - Anything else is a generic `500 Internal Server Error`.
 */
export function resolveErrorResponse(error: unknown): ResolvedErrorResponse {
  const statusError = findStatusError(error, 0, new Set());

  if (!statusError) {
    return {
      status: 500,
      body: { error: "Internal Server Error" },
      headers: {},
    };
  }

  const status = statusError.statusCode;

  const expose = statusError.expose === true;

  const message =
    expose && typeof statusError.message === "string" && statusError.message
      ? statusError.message
      : getStatusText(status);

  const body: Record<string, unknown> = { error: message };

  if (expose && typeof statusError.code === "string" && statusError.code) {
    body.code = statusError.code;
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
