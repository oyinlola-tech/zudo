/**
 * @zudojs/core/logging/core
 *
 * Core logger types, levels, entries, context, and options.
 */

export { BaseLogger, type Logger, type LogContext } from "./logger.js";

export {
  LogLevel,
  LogLevelPriority,
  DEFAULT_LOG_LEVEL,
  shouldLog,
  isLogLevel,
  resolveLogLevel,
  type LogLevel as LogLevelType,
} from "./logLevel.level.js";

export {
  createLoggerContext,
  loggerContextFromExecution,
  type LoggerContext,
} from "./loggerContext.context.js";

export {
  serializeLogError,
  sanitizeLogValue,
  safeLogStringify,
  type LogEntry,
  type LogError,
  type LogErrorSerializationOptions,
} from "./logEntry.entry.js";

export {
  createLogRedactor,
  type LogRedactionHook,
  type LogRedactorOptions,
} from "./logRedaction.redaction.js";

export {
  DEFAULT_LOGGER_OPTIONS,
  type LoggerOptions,
  type LogLevelOption,
} from "./loggerOptions.options.js";
