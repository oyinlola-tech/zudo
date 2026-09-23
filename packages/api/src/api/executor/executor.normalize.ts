import type { APIError } from "../errors/index.js";

import { APIInternalError, isAPIError } from "../errors/index.js";

/**
 * Error normalizer for converting unknown errors into APIError instances.
 *
 * APIErrors pass through untouched. Everything else is wrapped in an
 * `APIInternalError` (`expose: false`) carrying a generic message; the
 * original error is preserved on `cause` for logging.
 *
 * The wrapper's own message is deliberately *not* a copy of the original.
 * `BaseError.toJSON()` in `@zudojs/errors` 0.1.0 emits `message`, `stack`
 * and the serialized `cause` regardless of `expose`, so a transport doing
 * `res.json(result.error)` would otherwise ship the raw driver message
 * (connection strings, constraint names, file paths, tokens) to a client.
 */
export function normalizeAPIError(
  error: unknown,
  operationName?: string,
): APIError {
  if (isAPIError(error)) {
    return error;
  }

  const where =
    operationName !== undefined && operationName !== ""
      ? `operation "${operationName}"`
      : "an API operation";

  const wrapped =
    error instanceof Error
      ? new APIInternalError(
          `An unexpected internal error occurred in ${where}.`,
        )
      : new APIInternalError(
          `A non-error value (${describeValueType(error)}) was thrown in ${where}.`,
        );

  // `APIInternalError`'s subclass constructor forwards only
  // `{ endpoint, method }`, so `cause` cannot be passed through it.
  // `APIError` / `createAPIError` *do* accept `cause`, but constructing
  // through them would lose the `APIInternalError` class identity that
  // consumers match on. `cause` is a declared writable class field on
  // `BaseError`, so assigning it after construction is equivalent for
  // `toJSON()` and for `error.cause` reads; only the native `[[cause]]`
  // slot differs.
  (wrapped as { cause?: unknown }).cause = error;

  return wrapped;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
