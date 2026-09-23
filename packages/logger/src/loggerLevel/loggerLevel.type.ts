/**
 * Log levels used throughout Zudojs.
 *
 * Lower numeric values represent more severe messages.
 * Higher numeric values represent more verbose messages.
 */

import { InvalidLoggerLevelError } from "../loggerErrors/loggerError.base.js";

export enum LoggerLevel {
  FATAL = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/** String representation of supported logger levels. */
export type LoggerLevelName =
  "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * A level as configuration accepts it: the enum value, or its name in any
 * case (`"error"`, `"ERROR"`). `"warning"` and `"information"` are accepted
 * at runtime as aliases of `"warn"` and `"info"`.
 */
export type LoggerLevelLike =
  LoggerLevel | LoggerLevelName | Uppercase<LoggerLevelName>;

/** Converts a logger level into its canonical name. */
export function loggerLevelToName(level: LoggerLevel): LoggerLevelName {
  switch (level) {
    case LoggerLevel.FATAL:
      return "fatal";
    case LoggerLevel.ERROR:
      return "error";
    case LoggerLevel.WARN:
      return "warn";
    case LoggerLevel.INFO:
      return "info";
    case LoggerLevel.DEBUG:
      return "debug";
    case LoggerLevel.TRACE:
      return "trace";
    default:
      throw new InvalidLoggerLevelError(level);
  }
}

/** Converts a logger level name into its enum value. */
export function loggerLevelFromName(
  name: LoggerLevelName | string,
): LoggerLevel {
  switch (name.toLowerCase()) {
    case "fatal":
      return LoggerLevel.FATAL;
    case "error":
      return LoggerLevel.ERROR;
    case "warn":
    case "warning":
      return LoggerLevel.WARN;
    case "info":
    case "information":
      return LoggerLevel.INFO;
    case "debug":
      return LoggerLevel.DEBUG;
    case "trace":
      return LoggerLevel.TRACE;
    default:
      throw new InvalidLoggerLevelError(name);
  }
}

/**
 * Resolves a configured level (enum value or case-insensitive name) to its
 * enum value.
 *
 * @throws InvalidLoggerLevelError when the value is neither.
 */
export function resolveLoggerLevel(level: LoggerLevelLike): LoggerLevel {
  const value: unknown = level;
  if (isLoggerLevel(value)) return value;
  if (typeof value === "string") return loggerLevelFromName(value.trim());
  throw new InvalidLoggerLevelError(value);
}

/** Checks whether a value is a valid LoggerLevel. */
export function isLoggerLevel(value: unknown): value is LoggerLevel {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LoggerLevel.FATAL &&
    value <= LoggerLevel.TRACE
  );
}

/** Checks whether a value is a valid logger level name. */
export function isLoggerLevelName(value: unknown): value is LoggerLevelName {
  if (typeof value !== "string") return false;
  switch (value.toLowerCase()) {
    case "fatal":
    case "error":
    case "warn":
    case "warning":
    case "info":
    case "information":
    case "debug":
    case "trace":
      return true;
    default:
      return false;
  }
}

/** Determines whether a message at `messageLevel` should be emitted when the logger threshold is `threshold`. */
export function shouldLog(
  threshold: LoggerLevel,
  messageLevel: LoggerLevel,
): boolean {
  return messageLevel <= threshold;
}

/** Returns all canonical logger levels. */
export function getLoggerLevels(): readonly LoggerLevel[] {
  return [
    LoggerLevel.FATAL,
    LoggerLevel.ERROR,
    LoggerLevel.WARN,
    LoggerLevel.INFO,
    LoggerLevel.DEBUG,
    LoggerLevel.TRACE,
  ];
}

/** Returns all canonical logger level names. */
export function getLoggerLevelNames(): readonly LoggerLevelName[] {
  return ["fatal", "error", "warn", "info", "debug", "trace"];
}
