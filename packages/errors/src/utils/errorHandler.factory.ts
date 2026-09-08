/**
 * Error handler factory functions.
 */

import type { BaseError } from "../base/core/baseError.core.js";
import { isBaseError } from "../base/utils/baseError.utils.js";
import { ErrorHandler } from "./errorHandler.core.js";
import type { ErrorHandlerOptions } from "./errorHandler.types.js";

/** Creates a default error handler. */
export function createErrorHandler(
  options: ErrorHandlerOptions = {},
): ErrorHandler {
  return new ErrorHandler(options);
}

/** Normalizes an unknown error using a default handler. */
export function normalizeError(value: unknown): BaseError {
  return new ErrorHandler().normalize(value).error;
}

/** Determines whether an unknown value is a supported BaseError. */
export function isHandledError(value: unknown): value is BaseError {
  return isBaseError(value);
}
