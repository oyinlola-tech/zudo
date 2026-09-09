/**
 * Logger helper functions.
 */

import { LoggerLevel } from "../../loggerLevel/loggerLevel.type.js";

import type { LogMetadata } from "../../loggerEntry/loggerEntry.type.js";

import type { LoggerContext } from "../../loggerContext/loggerContext.core.js";

import { createTextLoggerFormatter } from "../../loggerFormatter/loggerFormatterFormatters/loggerFormatterFormatters.text.js";

import { createConsoleLoggerTransport } from "../../loggerTransport/loggerTransport.registry.js";

import type { ChildLoggerOptions } from "../../loggerOptions/loggerOptions.type.js";

import type { Logger } from "../core/loggerCore.type.js";

import { createLogger } from "../core/loggerCore.core.js";

/**
 * Creates a child logger.
 */
export function createChildLogger(
  parent: Logger,
  options: ChildLoggerOptions = {},
): Logger {
  return parent.child(options);
}

/**
 * Creates a logger specifically for an error.
 */
export function logError(
  logger: Logger,
  error: Error,
  message?: string,
  metadata?: LogMetadata,
): void {
  if (!logger.enabled) {
    return;
  }

  logger.log(LoggerLevel.ERROR, message ?? error.message, {
    metadata,
    error,
  });
}

/**
 * Creates a context-scoped logger and runs a callback with it.
 *
 * The scoped logger is passed to the callback. Both branches of the
 * previous implementation were identical and simply discarded the
 * scoped logger, so the context never applied to anything the callback
 * logged.
 */
export function withLoggerContext<T>(
  logger: Logger,
  context: LoggerContext,
  callback: (scoped: Logger) => T,
): T {
  return callback(logger.withContext(context));
}

/**
 * Creates a default application logger.
 */
export function createDefaultLogger(name = "zudojs"): Logger {
  return createLogger({
    name,
    level: LoggerLevel.INFO,
    formatter: createTextLoggerFormatter(),
    transports: [createConsoleLoggerTransport()],
  });
}
