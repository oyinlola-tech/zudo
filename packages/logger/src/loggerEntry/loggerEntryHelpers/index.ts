/**
 * @zudojs/logger/loggerEntry/loggerEntryHelpers
 *
 * Logger entry helper types and utilities.
 */

export type {
  LogValue,
  LogMetadata,
  LoggerSource,
  LoggerEntryContext,
} from "./loggerEntryHelpers.types.js";

export type {
  LoggerEntry,
  LoggerEntryInput,
} from "./loggerEntryHelpers.interfaces.js";

export {
  serializeLoggerEntry,
  serializeLoggerError,
  serializeLoggerValue,
  loggerLevelNameFallback,
} from "./loggerEntryHelpers.serialize.js";

export {
  LOGGER_ERROR_VALUE,
  LOGGER_REDACTION_TOKEN,
  LOGGER_UNREADABLE_TOKEN,
  DEFAULT_LOGGER_SECRET_PATTERN,
  escapeLogText,
  hasLogControlCharacters,
  createSecretMatcher,
  isLogErrorValue,
  redactLogValue,
} from "./loggerEntryHelpers.sanitize.js";

export type {
  LogErrorValue,
  LoggerRedactionOptions,
} from "./loggerEntryHelpers.sanitize.js";
