/**
 * Base validation error and error codes.
 */

import type { ValidationIssue } from "../validationResult/validationResult.type.js";
import {
  formatIssues,
  toFieldErrors,
} from "../validationResult/validationResult.type.js";
import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  type ErrorMetadata,
} from "@zudojs/errors";

/**
 * Maps a package-specific validation code to the shared error registry code.
 *
 * `ValidationErrorCode` and `ErrorCode` are different enums. Casting one into
 * the other put a value on `BaseError.code` that the errors package does not
 * recognise, so any status mapping or registry lookup keyed on it missed.
 */
function toErrorCode(code: ValidationErrorCode | undefined): ErrorCode {
  switch (code) {
    case ValidationErrorCode.REQUIRED:
      return ErrorCode.MISSING_FIELD;
    case ValidationErrorCode.INVALID_TYPE:
      return ErrorCode.INVALID_FIELD;
    case ValidationErrorCode.INVALID_FORMAT:
      return ErrorCode.INVALID_FORMAT;
    case ValidationErrorCode.INVALID_VALUE:
      return ErrorCode.INVALID_VALUE;
    case ValidationErrorCode.INVALID_INPUT:
      return ErrorCode.INVALID_INPUT;
    case ValidationErrorCode.SCHEMA_FAILED:
      return ErrorCode.SCHEMA_VALIDATION;
    case ValidationErrorCode.CONSTRAINT_FAILED:
    case ValidationErrorCode.UNKNOWN:
    default:
      return ErrorCode.VALIDATION_FAILED;
  }
}

/** Error codes used by the validation package. */
export enum ValidationErrorCode {
  INVALID_INPUT = "VALIDATION_INVALID_INPUT",
  REQUIRED = "VALIDATION_REQUIRED",
  INVALID_TYPE = "VALIDATION_INVALID_TYPE",
  INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",
  INVALID_VALUE = "VALIDATION_INVALID_VALUE",
  CONSTRAINT_FAILED = "VALIDATION_CONSTRAINT_FAILED",
  SCHEMA_FAILED = "VALIDATION_SCHEMA_FAILED",
  UNKNOWN = "VALIDATION_UNKNOWN",
}

/** Options used when constructing a validation error. */
export interface ValidationErrorOptions {
  readonly code?: ValidationErrorCode;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
}

/** Base error for validation failures. */
export class ValidationError extends BaseError {
  public readonly validationCode: ValidationErrorCode;
  public readonly issues: readonly ValidationIssue[];
  public readonly context?: Readonly<Record<string, unknown>>;
  public readonly timestamp: number;

  constructor(
    message: string,
    issues: readonly ValidationIssue[] = [],
    options: ValidationErrorOptions = {},
  ) {
    super(message, {
      code: toErrorCode(options.code),
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.WARNING,
      statusCode: 400,
      expose: true,
      cause: options.cause,
      metadata: { ...(options.context as ErrorMetadata | undefined) },
    });

    this.name = "ValidationError";
    this.validationCode = options.code ?? ValidationErrorCode.UNKNOWN;
    this.issues = Object.freeze([...issues]);
    this.context = options.context;
    this.timestamp = Date.now();
  }

  /** Returns validation errors grouped by field. */
  public get fieldErrors(): Readonly<Record<string, string>> {
    return toFieldErrors(this.issues);
  }

  /** Returns a formatted representation of all issues. */
  public get formattedIssues(): string {
    return formatIssues(this.issues);
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      validationCode: this.validationCode,
      message: this.message,
      issues: this.issues,
      ...(this.context ? { context: this.context } : {}),
      timestamp: this.timestamp,
    };
  }
}

/** Converts an unknown error into a ValidationError. */
export function toValidationError(
  error: unknown,
  fallbackMessage = "Validation failed.",
  options: ValidationErrorOptions = {},
): ValidationError {
  if (error instanceof ValidationError) return error;
  if (error instanceof Error)
    return new ValidationError(error.message || fallbackMessage, [], {
      ...options,
      cause: error,
    });
  return new ValidationError(fallbackMessage, [], { ...options, cause: error });
}

/** Returns whether an unknown value is a ValidationError. */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/** Returns whether a validation error has a specific code. */
export function hasValidationErrorCode(
  error: unknown,
  code: ValidationErrorCode,
): boolean {
  return isValidationError(error) && error.validationCode === code;
}

/** Creates a validation error from a collection of issues. */
export function createValidationError(
  issues: readonly ValidationIssue[],
  options: ValidationErrorOptions = {},
): ValidationError {
  return new ValidationError(
    formatIssues(issues) || "Validation failed.",
    issues,
    options,
  );
}
