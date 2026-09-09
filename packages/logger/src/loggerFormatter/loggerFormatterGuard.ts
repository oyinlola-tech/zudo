/**
 * Logger formatter type guards and ID generation.
 */

import type {
  LoggerFormatter,
  LoggerFormatterFunction,
  LoggerFormatterLike,
} from "./loggerFormatter.type.js";

/**
 * Creates a formatter identifier.
 */
export function createLoggerFormatterId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `formatter:${crypto.randomUUID()}`;
  }

  return [
    "formatter",
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join(":");
}

/**
 * Determines whether a formatter is function-based.
 */
export function isLoggerFormatterFunction(
  value: unknown,
): value is LoggerFormatterFunction {
  return typeof value === "function";
}

/**
 * Determines whether a formatter is object-based.
 */
export function isLoggerFormatterObject(
  value: unknown,
): value is LoggerFormatter {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    name?: unknown;

    format?: unknown;
  };

  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    typeof candidate.format === "function"
  );
}

/**
 * Determines whether a value is a valid formatter.
 */
export function isLoggerFormatter(
  value: unknown,
): value is LoggerFormatterLike {
  return (
    typeof value === "string" ||
    isLoggerFormatterFunction(value) ||
    isLoggerFormatterObject(value)
  );
}
