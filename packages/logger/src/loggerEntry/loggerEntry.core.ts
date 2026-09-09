/**
 * Core logger entry creation functions.
 */

import type { LoggerLevel } from "../loggerLevel/loggerLevel.type.js";

import type { LogMetadata, LoggerEntry } from "./loggerEntry.type.js";

import { createLoggerEntry } from "./loggerEntryCreate.js";

/**
 * Creates a unique log entry identifier.
 */
export function createLoggerEntryId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `log:${crypto.randomUUID()}`;
  }

  return [
    "log",
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join(":");
}

export { createLoggerEntry } from "./loggerEntryCreate.js";

/**
 * Converts an unknown value into logger metadata.
 */
export function normalizeLogMetadata(value: unknown): LogMetadata {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { value: value as import("./loggerEntry.type.js").LogValue };
  }

  return {
    ...(value as Record<string, import("./loggerEntry.type.js").LogValue>),
  };
}

/**
 * Creates a LoggerEntry from an Error.
 */
export function createErrorLoggerEntry(
  error: Error,
  level: LoggerLevel,
  message?: string,
  metadata?: LogMetadata,
): LoggerEntry {
  return createLoggerEntry({
    level,
    message: message ?? error.message,
    metadata,
    error,
  });
}
