/**
 * Severity levels used to classify application errors.
 *
 * Severity describes how seriously an error should be treated by
 * logging, monitoring, alerting, and operational tooling.
 */
export enum ErrorSeverity {
  /**
   * Informational error that does not require intervention.
   */
  INFO = "info",

  /**
   * Recoverable condition that may require attention.
   */
  WARNING = "warning",

  /**
   * An operation failed and requires investigation.
   */
  ERROR = "error",

  /**
   * A serious failure that may affect a major subsystem.
   */
  CRITICAL = "critical",

  /**
   * A catastrophic failure requiring immediate intervention.
   */
  FATAL = "fatal",
}

/**
 * Determines whether a value is a valid error severity.
 */
export function isErrorSeverity(value: unknown): value is ErrorSeverity {
  return typeof value === "string" && ERROR_SEVERITY_VALUES.has(value);
}

/** Precomputed set of every error severity value. */
const ERROR_SEVERITY_VALUES: ReadonlySet<string> = new Set<string>(
  Object.values(ErrorSeverity),
);

/**
 * Normalizes an unknown severity into a valid ErrorSeverity.
 */
export function normalizeErrorSeverity(
  value: unknown,
  fallback: ErrorSeverity = ErrorSeverity.ERROR,
): ErrorSeverity {
  if (isErrorSeverity(value)) {
    return value;
  }

  return fallback;
}

/**
 * Returns a numeric priority for a severity.
 *
 * Higher values represent more severe conditions.
 */
export function getErrorSeverityPriority(severity: ErrorSeverity): number {
  switch (severity) {
    case ErrorSeverity.INFO:
      return 10;

    case ErrorSeverity.WARNING:
      return 20;

    case ErrorSeverity.ERROR:
      return 30;

    case ErrorSeverity.CRITICAL:
      return 40;

    case ErrorSeverity.FATAL:
      return 50;

    default:
      return 30;
  }
}

/**
 * Compares two error severities.
 *
 * Returns a positive number when the first severity is more severe,
 * zero when they are equal, and a negative number when it is less severe.
 */
export function compareErrorSeverity(
  left: ErrorSeverity,
  right: ErrorSeverity,
): number {
  return getErrorSeverityPriority(left) - getErrorSeverityPriority(right);
}

/**
 * Returns whether a severity should trigger operational alerting.
 */
export function isAlertableSeverity(severity: ErrorSeverity): boolean {
  return (
    severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.FATAL
  );
}

/**
 * Returns whether a severity represents a failure.
 */
export function isFailureSeverity(severity: ErrorSeverity): boolean {
  return (
    severity === ErrorSeverity.ERROR ||
    severity === ErrorSeverity.CRITICAL ||
    severity === ErrorSeverity.FATAL
  );
}
