/**
 * Error type-checking utilities.
 */

import { isBaseError } from "../base/utils/baseError.utils.js";
import { ErrorCategory } from "../base/types/errorCategory.type.js";
import { ErrorSeverity } from "../base/types/errorSeverity.type.js";

/** Type guard for unknown error-like values. */
export function isErrorLike(value: unknown): value is {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** Returns whether an error is operational. */
export function isOperationalError(value: unknown): boolean {
  return isBaseError(value) && value.isOperational;
}

/** Returns whether an error is safe to expose to clients. */
export function isExposableError(value: unknown): boolean {
  return isBaseError(value) && value.expose;
}

/** Returns whether an error represents a server-side failure. */
export function isServerError(value: unknown): boolean {
  if (isBaseError(value)) {
    return value.statusCode >= 500;
  }
  return true;
}

/** Returns whether an error represents a client-side failure. */
export function isClientError(value: unknown): boolean {
  return (
    isBaseError(value) &&
    value.statusCode >= 400 &&
    value.statusCode < 500
  );
}

/** Returns whether an error belongs to a category. */
export function hasErrorCategory(
  value: unknown,
  category: ErrorCategory,
): boolean {
  return isBaseError(value) && value.category === category;
}

/** Returns whether an error has a specific severity. */
export function hasErrorSeverity(
  value: unknown,
  severity: ErrorSeverity,
): boolean {
  return isBaseError(value) && value.severity === severity;
}
