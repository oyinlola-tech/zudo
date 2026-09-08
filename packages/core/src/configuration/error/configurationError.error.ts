import { FrameworkError } from "../../errors/frameworkError.error.js";

import { ErrorCode } from "../../errors/errorCode.code.js";

import { ConfigurationRedactor } from "./configurationRedactor.redactor.js";

/**
 * Default redactor used to scrub raw cause text before it is
 * embedded in configuration error messages.
 */
const defaultErrorRedactor = new ConfigurationRedactor();

/**
 * Produces a redacted message from an unknown cause.
 */
export function describeConfigurationCause(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);

  return defaultErrorRedactor.redactText(message);
}

/**
 * Base error for all configuration related failures.
 *
 * This gives the configuration subsystem a common error type
 * while still allowing callers to handle more specific errors.
 */
export class ConfigurationError extends FrameworkError {
  /**
   * Configuration path associated with the error.
   */
  public readonly path?: string;

  /**
   * Original error that caused this failure.
   */

  public override name: string = "ConfigurationError";

  public constructor(
    code: ErrorCode,
    message: string,
    options: {
      readonly path?: string;
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, {
      code,
      details: {
        ...(options.details ?? {}),
        ...(options.path
          ? {
              path: options.path,
            }
          : {}),
      },
      cause: options.cause,
    });

    this.name = "ConfigurationError";

    this.path = options.path;
  }
}

/**
 * Thrown when configuration loading fails.
 */
export class ConfigurationSourceError extends ConfigurationError {
  /**
   * Name of the configuration source that failed.
   */
  public readonly sourceName: string;

  /**
   * Type of configuration source.
   */
  public readonly sourceType: string;

  public constructor(sourceName: string, sourceType: string, cause: unknown) {
    const causeMessage = describeConfigurationCause(cause);

    super(
      ErrorCode.CONFIGURATION_LOAD_FAILED,
      `Failed to load configuration source "${sourceName}": ${causeMessage}`,
      {
        cause,
        details: {
          sourceName,
          sourceType,
        },
      },
    );

    this.name = "ConfigurationSourceError";

    this.sourceName = sourceName;

    this.sourceType = sourceType;
  }
}

/**
 * Thrown when a required configuration value is missing.
 */
export class ConfigurationMissingError extends ConfigurationError {
  public constructor(path: string) {
    super(
      ErrorCode.CONFIGURATION_REQUIRED,
      `Required configuration "${path}" is not defined.`,
      {
        path,
      },
    );

    this.name = "ConfigurationMissingError";
  }
}

/**
 * Thrown when a configuration path is malformed: empty, containing
 * whitespace, or naming a forbidden segment such as "__proto__".
 */
export class ConfigurationPathError extends ConfigurationError {
  public constructor(path: string, reason: string) {
    super(
      ErrorCode.CONFIGURATION_INVALID,
      `Invalid configuration path "${path}": ${reason}`,
      {
        path,
        details: {
          reason,
        },
      },
    );

    this.name = "ConfigurationPathError";
  }
}

/**
 * Thrown when a configuration value has an invalid type
 * or otherwise cannot be interpreted correctly.
 */
export class ConfigurationTypeError extends ConfigurationError {
  /**
   * Expected configuration type.
   */
  public readonly expectedType: string;

  /**
   * Actual configuration type.
   */
  public readonly actualType: string;

  public constructor(path: string, expectedType: string, value: unknown) {
    const actualType = getValueType(value);

    super(
      ErrorCode.CONFIGURATION_INVALID_TYPE,
      `Configuration "${path}" must be of type ${expectedType}, received ${actualType}.`,
      {
        path,
        details: {
          expectedType,
          actualType,
        },
      },
    );

    this.name = "ConfigurationTypeError";

    this.expectedType = expectedType;

    this.actualType = actualType;
  }
}

/**
 * Thrown when a configuration value fails schema validation.
 */
export class ConfigurationSchemaError extends ConfigurationError {
  /**
   * Validation issues associated with the schema.
   */
  public readonly issues: readonly ConfigurationErrorIssue[];

  public constructor(path: string, issues: readonly ConfigurationErrorIssue[]) {
    super(
      ErrorCode.CONFIGURATION_VALIDATION_FAILED,
      createSchemaErrorMessage(path, issues),
      {
        path,
        details: {
          issues,
        },
      },
    );

    this.name = "ConfigurationSchemaError";

    this.issues = [...issues];
  }
}

/**
 * Represents a configuration-specific validation issue.
 */
export interface ConfigurationErrorIssue {
  /**
   * Configuration path.
   */
  readonly path: string;

  /**
   * Human-readable error message.
   */
  readonly message: string;

  /**
   * Optional validation code.
   */
  readonly code?: string;

  /**
   * Optional value that failed validation.
   *
   * Be careful not to include secrets here.
   */
  readonly value?: unknown;
}

/**
 * Thrown when a configuration source contains
 * duplicate or conflicting definitions that cannot
 * be resolved.
 */
export class ConfigurationConflictError extends ConfigurationError {
  /**
   * Configuration path where the conflict occurred.
   */
  public readonly conflictingPath: string;

  /**
   * Names of the conflicting sources.
   */
  public readonly sources: readonly string[];

  public constructor(path: string, sources: readonly string[]) {
    super(
      ErrorCode.CONFIGURATION_CONFLICT,
      `Configuration conflict detected for "${path}" between sources: ${sources.join(
        ", ",
      )}.`,
      {
        path,
        details: {
          sources,
        },
      },
    );

    this.name = "ConfigurationConflictError";

    this.conflictingPath = path;

    this.sources = [...sources];
  }
}

/**
 * Creates a safe representation of a configuration value's type.
 */
function getValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

/**
 * Formats schema validation issues.
 */
function createSchemaErrorMessage(
  path: string,
  issues: readonly ConfigurationErrorIssue[],
): string {
  if (issues.length === 0) {
    return `Configuration "${path}" failed schema validation.`;
  }

  const details = issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");

  return `Configuration "${path}" failed schema validation: ${details}`;
}
