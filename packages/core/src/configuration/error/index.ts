/**
 * @zudojs/core/configuration/error
 *
 * Configuration errors and redaction.
 */

export {
  ConfigurationError,
  ConfigurationSourceError,
  ConfigurationMissingError,
  ConfigurationPathError,
  ConfigurationTypeError,
  ConfigurationSchemaError,
  ConfigurationConflictError,
} from "./configurationError.error.js";

export { describeConfigurationCause } from "./configurationError.error.js";

export type { ConfigurationErrorIssue } from "./configurationError.error.js";

export {
  ConfigurationRedactor,
  createConfigurationRedactor,
  redactConfiguration,
  DEFAULT_SENSITIVE_PATTERNS,
  DEFAULT_REDACTION_VALUE,
} from "./configurationRedactor.redactor.js";

export type {
  ConfigurationRedactorOptions,
  ConfigurationSensitivity,
  RedactedConfiguration,
} from "./configurationRedactor.redactor.js";
