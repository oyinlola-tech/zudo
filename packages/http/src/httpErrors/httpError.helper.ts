/**
 * HTTP error helpers barrel.
 *
 * Factory functions, type guards, and utilities.
 *
 * @module httpErrors/helpers
 */

import type { HttpErrorOptions } from "./httpError.type.js";

import { HttpError } from "./httpError.base.js";

export * from "./factories/httpError.clientError.js";
export * from "./factories/httpError.serverError.js";
export * from "./httpError.typeGuard.js";
export * from "./httpError.invalidJson.js";
export * from "./httpError.util.js";

/**
 * Creates an HTTP error with the specified status code.
 */
export function httpError(
  status: number,
  message?: string,
  options?: HttpErrorOptions,
): HttpError {
  return new HttpError(status, message, options);
}
