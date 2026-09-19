/**
 * Base validation error and error codes.
 */

import type { ValidationIssue } from "../validationResult/validationResult.type.js";
import {
  formatIssues,
  toFieldErrors,
} from "../validationResult/validationResult.type.js";
import {
  ValidationError as SharedValidationError,
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

/**
 * Base error for validation failures.
 *
 * A thin subclass of `@zudojs/errors`' `ValidationError`, so a consumer that
 * catches the shared class (or calls its `isValidationError`) also catches
 * errors thrown by this package. It used to extend `BaseError` directly and
 * was an unrelated class with the same name.
 */
export class ValidationError extends SharedValidationError {
  public readonly validationCode: ValidationErrorCode;
  declare public readonly issues: readonly ValidationIssue[];
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
      issues,
    });

    this.name = "ValidationError";
    this.validationCode = options.code ?? ValidationErrorCode.UNKNOWN;
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

  /**
   * Serializes the error. `issues` and `context` come from the base
   * `toJSON()`, which redacts submitted issue values and sensitive metadata
   * keys; re-adding the raw fields here used to undo that redaction.
   */
  public override toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      name: this.name,
      validationCode: this.validationCode,
      message: this.message,
      ...(this.context ? { context: base.metadata } : {}),
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
