/**
 * @zudojs/validation — Validation step combinators.
 *
 * @module validationComposer/validationComposer.combinators
 */

import type {
  ValidationIssue,
  ValidationResult,
} from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import type { ValidationStep } from "./validationComposer.core.js";

/** The issue reported when no alternative accepted the value. */
function noValidatorSucceeded(): ValidationIssue {
  return {
    path: [],
    code: "no_validator_succeeded",
    message: "No validation rule accepted the value.",
  };
}

/** Combines validators using logical AND semantics. Every validator must succeed. */
export function all<T>(
  ...validators: readonly ValidationStep<T>[]
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    const issues: ValidationIssue[] = [];
    for (const validator of validators) {
      const result = validator(value);
      if (!result.success) issues.push(...result.issues);
    }
    return issues.length > 0 ? failure(issues) : success(value);
  };
}

/** Combines validators using logical OR semantics. Succeeds when at least one validator succeeds. */
export function any<T>(
  ...validators: readonly ValidationStep<T>[]
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    const issues: ValidationIssue[] = [];
    for (const validator of validators) {
      const result = validator(value);
      if (result.success) return result;
      issues.push(...result.issues);
    }
    return failure(
      issues.length > 0
        ? issues
        : [
            {
              path: [],
              code: "no_validator_succeeded",
              message: "No validation rule accepted the value.",
              received: value,
            },
          ],
    );
  };
}

/**
 * Runs validators sequentially and returns the first successful result.
 *
 * Unlike {@link any}, only the *last* failure is reported when none succeed:
 * a caller asking for the first match wants to know why the final fallback
 * did not apply, not to read every alternative's complaint.
 */
export function first<T>(
  ...validators: readonly ValidationStep<T>[]
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    let lastIssues: readonly ValidationIssue[] = [];

    for (const validator of validators) {
      const result = validator(value);
      if (result.success) return result;
      lastIssues = result.issues;
    }

    return failure(
      lastIssues.length > 0 ? lastIssues : [noValidatorSucceeded()],
    );
  };
}

/** Negates a validation step. */
export function negate<T>(validator: ValidationStep<T>): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    const result = validator(value);
    if (result.success) {
      return failure([
        {
          path: [],
          code: "negated_validation_failed",
          message: "Value must not satisfy the supplied validation rule.",
        },
      ]);
    }
    return success(value);
  };
}
