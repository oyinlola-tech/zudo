/**
 * Error category helper functions.
 */

import { ErrorCategory } from "./errorCategory.enum.js";

/** Precomputed set of every error category value. */
const ERROR_CATEGORY_VALUES: ReadonlySet<string> = new Set<string>(
  Object.values(ErrorCategory),
);

/** Determines whether a value is a valid error category. */
export function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === "string" && ERROR_CATEGORY_VALUES.has(value);
}

/** Converts an unknown value into a valid error category. */
export function normalizeErrorCategory(
  value: unknown,
  fallback: ErrorCategory = ErrorCategory.UNKNOWN,
): ErrorCategory {
  if (isErrorCategory(value)) return value;
  return fallback;
}

/** Returns whether the category represents a client-side problem. */
export function isClientErrorCategory(category: ErrorCategory): boolean {
  switch (category) {
    case ErrorCategory.VALIDATION:
    case ErrorCategory.INPUT:
    case ErrorCategory.AUTHENTICATION:
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.PERMISSION:
    case ErrorCategory.RESOURCE:
    case ErrorCategory.CONFLICT:
    case ErrorCategory.RATE_LIMIT:
    case ErrorCategory.TIMEOUT:
      return true;
    default:
      return false;
  }
}

/** Returns whether the category represents an infrastructure problem. */
export function isInfrastructureErrorCategory(
  category: ErrorCategory,
): boolean {
  switch (category) {
    case ErrorCategory.DATABASE:
    case ErrorCategory.CACHE:
    case ErrorCategory.STORAGE:
    case ErrorCategory.NETWORK:
    case ErrorCategory.EXTERNAL_SERVICE:
    case ErrorCategory.FILE_SYSTEM:
    case ErrorCategory.CONFIGURATION:
    case ErrorCategory.SYSTEM:
    case ErrorCategory.INTERNAL:
      return true;
    default:
      return false;
  }
}

/** Returns whether the category is related to security. */
export function isSecurityErrorCategory(category: ErrorCategory): boolean {
  switch (category) {
    case ErrorCategory.AUTHENTICATION:
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.PERMISSION:
    case ErrorCategory.CRYPTOGRAPHY:
      return true;
    default:
      return false;
  }
}

/** Returns whether the category is normally safe to expose directly to an API consumer. */
export function isPublicErrorCategory(category: ErrorCategory): boolean {
  switch (category) {
    case ErrorCategory.VALIDATION:
    case ErrorCategory.INPUT:
    case ErrorCategory.AUTHENTICATION:
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.PERMISSION:
    case ErrorCategory.RESOURCE:
    case ErrorCategory.CONFLICT:
    case ErrorCategory.RATE_LIMIT:
    case ErrorCategory.TIMEOUT:
    case ErrorCategory.BUSINESS:
      return true;
    default:
      return false;
  }
}
