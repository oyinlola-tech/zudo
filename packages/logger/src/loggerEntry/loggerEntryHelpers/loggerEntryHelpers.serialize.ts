/**
 * Logger entry serialization helpers.
 */

import type { LoggerEntry } from "./loggerEntryHelpers.interfaces.js";

import {
  serializeLoggerError,
  serializeLoggerValue,
} from "./loggerEntryHelpers.valueSerialize.js";

/**
 * Returns a plain serializable representation of an entry.
 *
 * This intentionally does not call JSON.stringify itself, but every
 * caller-supplied value IS normalized first. Metadata and context used
 * to be embedded by reference, so a circular object or a BigInt made
 * the JSON formatter throw — and because dispatch swallows formatter
 * errors by default, the whole log line vanished silently.
 */
export function serializeLoggerEntry(
  entry: LoggerEntry,
): Record<string, unknown> {
  return {
    id: entry.id,

    level: entry.level,

    levelName: entry.levelName,

    message: entry.message,

    metadata: serializeLoggerValue(entry.metadata),

    context: serializeLoggerValue(entry.context),

    source: serializeLoggerValue(entry.source),

    error: entry.error ? serializeLoggerError(entry.error) : undefined,

    logger: entry.logger,

    timestamp: entry.timestamp.toISOString(),

    timestampMs: entry.timestampMs,

    pid: entry.pid,

    hostname: entry.hostname,

    environment: entry.environment,
  };
}

export {
  serializeLoggerError,
  serializeLoggerValue,
} from "./loggerEntryHelpers.valueSerialize.js";

/**
 * Fallback level-name mapping kept local to avoid introducing
 * a circular dependency into logger-entry.ts.
 */
export function loggerLevelNameFallback(
  level: import("../../loggerLevel/loggerLevel.type.js").LoggerLevel,
): import("../../loggerLevel/loggerLevel.type.js").LoggerLevelName {
  switch (level) {
    case 0:
      return "fatal";

    case 1:
      return "error";

    case 2:
      return "warn";

    case 3:
      return "info";

    case 4:
      return "debug";

    case 5:
      return "trace";

    default:
      throw new RangeError(`Unknown logger level: ${String(level)}`);
  }
}
