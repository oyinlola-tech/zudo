/**
 * Logger entry creation from input.
 */

import type { LoggerEntry, LoggerEntryInput } from "./loggerEntry.type.js";

import { createLoggerEntryId } from "./loggerEntry.core.js";

import { loggerLevelNameFallback } from "./loggerEntryHelpers/loggerEntryHelpers.serialize.js";

/**
 * Creates a normalized LoggerEntry.
 */
export function createLoggerEntry(input: LoggerEntryInput): LoggerEntry {
  const timestamp = input.timestamp ?? new Date();
  const timestampMs = timestamp.getTime();

  if (!Number.isFinite(timestampMs)) {
    throw new RangeError("Logger entry timestamp must be a valid date.");
  }

  const levelName = input.levelName ?? loggerLevelNameFallback(input.level);

  return Object.freeze({
    id: input.id ?? createLoggerEntryId(),
    level: input.level,
    levelName,
    message: input.message,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    context: input.context
      ? Object.freeze({
          ...input.context,
          metadata: input.context.metadata
            ? Object.freeze({ ...input.context.metadata })
            : undefined,
        })
      : undefined,
    source: input.source ? Object.freeze({ ...input.source }) : undefined,
    error: input.error,
    logger: input.logger,
    timestamp,
    timestampMs,
    pid: input.pid,
    hostname: input.hostname,
    environment: input.environment,
  });
}
