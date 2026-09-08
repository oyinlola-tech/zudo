/**
 * @zudojs/observability — Log Record
 *
 * Factory functions for creating structured log records.
 */

import type { LogRecord, LogRecordError } from "../types.js";
import { LogLevel } from "../types.js";
import { logLevelToName } from "../logLevel/index.js";

/**
 * Serializes a thrown value into something a JSON transport can carry.
 *
 * `Error`'s own fields are non-enumerable, so an error placed in a log
 * context stringifies to `{}` — this is what turns it back into data.
 * `cause` chains are followed, with a depth cap so a self-referential cause
 * cannot recurse forever.
 */
export function serializeError(error: unknown, depth = 0): LogRecordError {
  if (error instanceof Error) {
    const cause =
      error.cause !== undefined && depth < 4
        ? serializeError(error.cause, depth + 1)
        : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause,
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const name = typeof record["name"] === "string" ? record["name"] : "Error";
    const message =
      typeof record["message"] === "string"
        ? record["message"]
        : safeStringify(error);
    return { name, message };
  }

  return { name: "Error", message: String(error) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Creates a structured log record. */
export function createLogRecord(options: {
  readonly level: LogLevel;
  readonly message: string;
  readonly loggerName: string;
  readonly context?: Record<string, unknown>;
  readonly error?: unknown;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly timestamp?: Date;
}): LogRecord {
  return {
    level: options.level,
    levelName: logLevelToName(options.level),
    message: options.message,
    timestamp: options.timestamp ?? new Date(),
    loggerName: options.loggerName,
    context: options.context,
    error:
      options.error === undefined ? undefined : serializeError(options.error),
    traceId: options.traceId,
    spanId: options.spanId,
  };
}

/** Creates a log record for an error. */
export function createErrorLogRecord(
  error: unknown,
  level: LogLevel,
  loggerName: string,
  context?: Record<string, unknown>,
): LogRecord {
  const serialized = serializeError(error);
  return createLogRecord({
    level,
    message: serialized.message,
    loggerName,
    context,
    error,
  });
}
