import { ErrorCategory } from "../types/errorCategory.type.js";
import { ErrorCode } from "../types/errorCode.type.js";
import { ErrorSeverity } from "../types/errorSeverity.type.js";
import { BaseError, BASE_ERROR_BRAND } from "../core/baseError.core.js";
import type { BaseErrorOptions } from "../types/baseError.type.js";

/**
 * Determines whether an unknown value is a BaseError.
 *
 * Uses `instanceof` as the fast path and falls back to the package brand plus
 * a structural check, so errors produced by another installed copy of
 * `@zudojs/errors` are still recognised.
 */
export function isBaseError(value: unknown): value is BaseError {
  if (value instanceof BaseError) return true;
  if (value === null || typeof value !== "object") return false;
  if (!(value instanceof Error)) return false;

  const candidate = value as Partial<BaseError> & Record<PropertyKey, unknown>;
  return (
    candidate[BASE_ERROR_BRAND] === true &&
    typeof candidate.code === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.severity === "string" &&
    typeof candidate.statusCode === "number" &&
    typeof candidate.expose === "boolean" &&
    typeof candidate.isOperational === "boolean" &&
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    typeof candidate.toJSON === "function"
  );
}

/** Default message used when an unknown value is converted into a BaseError. */
export const UNKNOWN_ERROR_MESSAGE = "An unexpected error occurred.";

/**
 * Converts an unknown thrown value into a BaseError.
 *
 * This is the single normalization routine shared by `toBaseError`,
 * `normalizeToBaseError`, `normalizeUnknownError` and `ErrorHandler.normalize`.
 * Unknown values are classified as non-operational internal errors
 * (`ERR_INTERNAL_ERROR`, 500, not exposed) and the original value is kept as
 * `cause`; a plain string is used as the message.
 */
export function normalizeUnknownToBaseError(
  value: unknown,
  options: BaseErrorOptions = {},
): BaseError {
  if (isBaseError(value)) return value;

  const defaults: BaseErrorOptions = {
    code: ErrorCode.INTERNAL_ERROR,
    category: ErrorCategory.SYSTEM,
    severity: ErrorSeverity.ERROR,
    statusCode: 500,
    expose: false,
    isOperational: false,
  };

  if (value instanceof Error) {
    return new BaseError(
      options.message ?? (value.message || UNKNOWN_ERROR_MESSAGE),
      {
        ...defaults,
        ...options,
        cause: options.cause ?? value,
      },
    );
  }

  const message =
    options.message ??
    (typeof value === "string" && value.length > 0
      ? value
      : UNKNOWN_ERROR_MESSAGE);

  return new BaseError(message, {
    ...defaults,
    ...options,
    metadata: { originalType: typeof value, ...options.metadata },
    cause: options.cause ?? value,
  });
}

/**
 * Converts an unknown thrown value into a BaseError.
 */
export function toBaseError(
  error: unknown,
  options: BaseErrorOptions = {},
): BaseError {
  return normalizeUnknownToBaseError(error, options);
}

/**
 * Extracts an error code from an unknown error.
 */
export function getErrorCode(error: unknown): ErrorCode | string {
  if (isBaseError(error)) return error.code;
  return ErrorCode.UNKNOWN;
}

/**
 * Extracts an error category from an unknown error.
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  if (isBaseError(error)) return error.category;
  return ErrorCategory.UNKNOWN;
}

/**
 * Extracts an error severity from an unknown error.
 */
export function getErrorSeverity(error: unknown): ErrorSeverity {
  if (isBaseError(error)) return error.severity;
  return ErrorSeverity.ERROR;
}

/**
 * Extracts a status code from an unknown error.
 */
export function getErrorStatusCode(error: unknown): number {
  if (isBaseError(error)) return error.statusCode;
  return 500;
}

/**
 * Determines whether an unknown error is safe to expose.
 */
export function isErrorExposable(error: unknown): boolean {
  if (isBaseError(error)) return error.expose;
  return false;
}

/**
 * Determines whether an unknown value represents an Error.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
