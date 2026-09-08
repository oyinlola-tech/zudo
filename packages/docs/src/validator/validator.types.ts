/**
 * Type definitions for document validation.
 */

/**
 * A single validation issue found in documentation.
 */
export interface ValidationIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly documentId?: string;
}

/**
 * Result of validating documentation.
 *
 * `valid` is `false` only when at least one issue has severity
 * `"error"`; warnings never make a result invalid.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Builds a `ValidationResult` from a list of issues using the single
 * rule shared by every validator in this package.
 */
export function toValidationResult(
  issues: readonly ValidationIssue[],
): ValidationResult {
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
