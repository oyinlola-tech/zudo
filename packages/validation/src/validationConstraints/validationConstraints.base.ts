import type { ValidationIssue } from "../validationResult/validationResult.type.js";

import {
  failure,
  success,
  type ValidationResult,
} from "../validationResult/validationResult.type.js";

/**
 * A reusable validation constraint.
 */
export interface ValidationConstraint<T> {
  readonly name: string;
  readonly validate: (value: T) => boolean;
  readonly message: string;
  readonly code: string;
  /**
   * Narrows an arbitrary value to the type `validate` expects.
   *
   * Constraints are frequently handed values straight off a trust boundary,
   * where the declared type parameter guarantees nothing. Without a guard,
   * `everyItem(...)` called on a number throws a raw `TypeError` out of the
   * validator, turning a 400 into a 500.
   */
  readonly guard?: (value: unknown) => value is T;
}

/**
 * Options for creating a validation constraint.
 */
export interface ConstraintOptions<T = unknown> {
  readonly name?: string;
  readonly code?: string;
  readonly message?: string;
  readonly guard?: (value: unknown) => value is T;
}

/**
 * Creates a reusable validation constraint.
 */
export function createConstraint<T>(
  validate: (value: T) => boolean,
  options: ConstraintOptions<T> = {},
): ValidationConstraint<T> {
  const guard = options.guard;

  /**
   * `validate` is public, so it is called directly as often as it is called
   * through `checkConstraints`. Applying the guard here rather than only at
   * the call site means no entry point can be handed a wrong-typed value and
   * throw a raw `TypeError` back at a trust boundary.
   */
  const guarded = guard
    ? (value: T): boolean => guard(value) && validate(value)
    : validate;

  return Object.freeze({
    name: options.name ?? "custom",
    validate: guarded,
    message: options.message ?? "Validation constraint failed.",
    code: options.code ?? "constraint_failed",
    ...(guard ? { guard } : {}),
  });
}

/**
 * Run a constraint against a value of unknown type.
 *
 * Returns false rather than throwing when the value is the wrong shape, so a
 * mistyped field reports as a validation failure instead of escaping as an
 * unhandled error.
 */
function runConstraint<T>(
  constraint: ValidationConstraint<T>,
  value: unknown,
): boolean {
  if (constraint.guard && !constraint.guard(value)) return false;

  try {
    return constraint.validate(value as T);
  } catch {
    return false;
  }
}

/** Builds the issue describing a failed constraint. */
function toIssue<T>(
  constraint: ValidationConstraint<T>,
  path: readonly (string | number)[],
): ValidationIssue {
  return {
    path: [...path],
    code: constraint.code,
    message: constraint.message,
  };
}

/**
 * Executes a constraint against a value.
 *
 * The rejected value is deliberately *not* attached to the issue. Issues flow
 * into `ValidationError`, which is exposed with a 400, so echoing the input
 * would return rejected passwords, tokens and PII to the caller and write them
 * to any log that serializes the error.
 */
export function checkConstraint<T>(
  constraint: ValidationConstraint<T>,
  value: T,
  path: readonly (string | number)[] = [],
): ValidationResult<T> {
  if (runConstraint(constraint, value)) return success(value);
  return failure([toIssue(constraint, path)]);
}

/**
 * Executes multiple constraints against a value.
 */
export function checkConstraints<T>(
  constraints: readonly ValidationConstraint<T>[],
  value: T,
  path: readonly (string | number)[] = [],
): ValidationResult<T> {
  const issues: ValidationIssue[] = [];

  for (const constraint of constraints) {
    if (!runConstraint(constraint, value)) {
      issues.push(toIssue(constraint, path));
    }
  }

  if (issues.length > 0) return failure(issues);
  return success(value);
}

/**
 * Combines constraints into a single constraint.
 */
export function combineConstraints<T>(
  ...constraints: readonly ValidationConstraint<T>[]
): ValidationConstraint<T> {
  return createConstraint<T>(
    (value) =>
      constraints.every((constraint) => runConstraint(constraint, value)),
    {
      name:
        constraints.map((constraint) => constraint.name).join("_and_") ||
        "combined",
      code: "combined_constraint_failed",
      message: "One or more validation constraints failed.",
    },
  );
}

/**
 * Creates a negated constraint.
 */
export function not<T>(
  constraint: ValidationConstraint<T>,
  options: ConstraintOptions<T> = {},
): ValidationConstraint<T> {
  return createConstraint<T>((value) => !runConstraint(constraint, value), {
    name: options.name ?? `not_${constraint.name}`,
    code: options.code ?? "negated_constraint_failed",
    message: options.message ?? `Value must not satisfy ${constraint.name}.`,
  });
}

/**
 * Requires a value to be defined.
 */
export const required = createConstraint<unknown>(
  (value) => value !== undefined && value !== null,
  {
    name: "required",
    code: "required",
    message: "Value is required.",
  },
);

/**
 * Asserts that a value is a non-negative integer.
 */
export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}
