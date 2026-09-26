/**
 * Locating the error whose status answers a request.
 *
 * @module httpAdapter/errorResponse/locate
 */

import {
  HttpMiddlewareError,
  HttpMiddlewarePipelineError,
} from "../../httpMiddleware/httpMiddleware.error.js";

/**
 * An error carrying an HTTP status, as {@link findStatusError} reports it.
 */
export interface StatusErrorLike {
  readonly statusCode: number;

  readonly message?: unknown;

  readonly expose?: unknown;

  readonly code?: unknown;

  readonly headers?: unknown;

  readonly issues?: unknown;
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
 * Whether `error` is one of the pipeline's own wrappers. These are added by
 * the framework on the way out and always report 500, so they are looked
 * through; nothing else is.
 */
function isFrameworkWrapper(error: object): boolean {
  return (
    error instanceof HttpMiddlewareError ||
    error instanceof HttpMiddlewarePipelineError
  );
}

/**
 * Locates the error whose status answers the request.
 *
 * The **outermost** error that carries a status wins. Only the framework's
 * own wrappers (`HttpMiddlewareError`, `HttpMiddlewarePipelineError`) are
 * unwrapped. An application that throws
 * `new HttpError(502, "Bad Gateway", { cause: upstream401 })` is mapping an
 * upstream failure on purpose; taking the innermost status sent the client
 * the upstream's 401, its message and its `WWW-Authenticate` header.
 * An error that is neither a wrapper nor carries a status ends the search
 * (generic 500), so a `cause` the application attached is never exposed.
 */
export function findStatusError(
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

  if (!isFrameworkWrapper(error)) {
    return isHttpStatus(candidate.statusCode)
      ? (candidate as StatusErrorLike)
      : undefined;
  }

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
