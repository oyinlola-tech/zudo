/**
 * Validation result types and helpers.
 */

import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
} from "@zudojs/errors";

/** A single validation issue. */
export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
  readonly expected?: unknown;
  readonly received?: unknown;
}

/** Formats validation issues into a human-readable string. */
export function formatIssues(issues: readonly ValidationIssue[]): string {
  if (issues.length === 0) return "";
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/**
 * Groups validation issues by their first path segment.
 *
 * Built on a null-prototype object and probed with `Object.hasOwn`. Using `in`
 * against a plain literal reported `constructor`, `toString` and `valueOf` as
 * already present, so a field with one of those names produced no entry and
 * the user saw a rejected form with nothing marked.
 */
export function toFieldErrors(
  issues: readonly ValidationIssue[],
): Readonly<Record<string, string>> {
  const result = Object.create(null) as Record<string, string>;

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    if (Object.hasOwn(result, field)) continue;

    Object.defineProperty(result, field, {
      value: issue.message,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }

  return Object.freeze(result);
}

/** A successful validation result. */
export interface ValidationSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly issues?: readonly ValidationIssue[];
}

/** A failed validation result. */
export interface ValidationFailure {
  readonly success: false;
  readonly data?: unknown;
  readonly issues: readonly ValidationIssue[];
}

/** Union type for validation results. */
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/** Creates a successful validation result. */
export function success<T>(data: T): ValidationSuccess<T> {
  return Object.freeze({
    success: true as const,
    data,
    issues: [] as readonly ValidationIssue[],
  } as ValidationSuccess<T>);
}

/** Creates a failed validation result. */
export function failure(issues: readonly ValidationIssue[]): ValidationFailure {
  if (issues.length === 0)
    throw new Error("A failure must contain at least one issue.");
  return Object.freeze({
    success: false as const,
    issues: Object.freeze([...issues]),
  });
}

/** Checks whether a result is successful. */
export function isValidationSuccess<T>(
  result: ValidationResult<T>,
): result is ValidationSuccess<T> {
  return result.success;
}

/** Checks whether a result is a failure. */
export function isValidationFailure<T>(
  result: ValidationResult<T>,
): result is ValidationFailure {
  return !result.success;
}

/** Unwraps a successful result or throws a ValidationResultError. */
export function unwrapValidation<T>(result: ValidationResult<T>): T {
  if (result.success) return result.data;
  throw new ValidationResultError(result.issues);
}

/** Creates a single validation issue. */
export function issue(
  message: string,
  options?: {
    readonly path?: readonly (string | number)[];
    readonly code?: string;
    readonly expected?: unknown;
    readonly received?: unknown;
  },
): ValidationIssue {
  return Object.freeze({
    path: options?.path ?? [],
    code: options?.code ?? "VALIDATION_ERROR",
    message,
    ...(options?.expected !== undefined ? { expected: options.expected } : {}),
    ...(options?.received !== undefined ? { received: options.received } : {}),
  });
}

/** Transforms the data in a successful result. */
export function map<T, U>(
  result: ValidationResult<T>,
  fn: (data: T) => U,
): ValidationResult<U> {
  if (result.success) return success(fn(result.data));
  return result;
}

/** Combines multiple validation results. Returns the first failure, or a success with all data. */
export function combine<T extends readonly unknown[]>(results: {
  [K in keyof T]: ValidationResult<T[K]>;
}): ValidationResult<T> {
  const failures: ValidationIssue[] = [];
  const data: unknown[] = [];

  for (const result of results) {
    if (result.success) {
      data.push(result.data);
    } else {
      failures.push(...result.issues);
    }
  }

  return failures.length > 0
    ? failure(failures)
    : success(data as unknown as T);
}

/** Error thrown when attempting to unwrap a failed validation result. */
export class ValidationResultError extends BaseError {
  public readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(formatIssues(issues) || "Validation failed.", {
      code: ErrorCode.VALIDATION_FAILED,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.WARNING,
      statusCode: 400,
      expose: true,
      metadata: { issueCount: issues.length },
    });

    this.name = "ValidationResultError";
    this.issues = Object.freeze([...issues]);
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      message: this.message,
      issues: this.issues,
    };
  }
}
