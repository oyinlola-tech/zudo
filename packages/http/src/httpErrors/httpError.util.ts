/**
 * HTTP error utilities.
 *
 * Dependency-free helpers used by the base error class. Kept separate from
 * `httpError.helper.ts` so the base class does not import a module that
 * re-exports its own subclasses (which would form an initialization cycle).
 *
 * @module httpErrors/util
 */

import { getStatusText as lookupStatusText } from "../httpStatus/httpStatus.lookup.js";

/**
 * Normalizes header keys to lowercase.
 */
export function normalizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key.toLowerCase()] = value;
    }
  }

  return normalized;
}

/**
 * Returns the standard HTTP status text for a given status code.
 *
 * Delegates to the package's status-text table rather than keeping a partial
 * copy: the local map started at 400, so `new HttpError(301)` reported both
 * `statusText` and `message` as "Unknown Status".
 */
export function getStatusText(status: number): string {
  return lookupStatusText(status);
}
