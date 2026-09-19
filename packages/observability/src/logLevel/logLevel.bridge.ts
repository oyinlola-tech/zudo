/**
 * @zudojs/observability — Level bridge to @zudojs/logger
 *
 * The two packages number their levels in opposite directions: here a higher
 * value is more severe (`TRACE = 0 … FATAL = 5`), in `@zudojs/logger` a lower
 * value is more severe (`FATAL = 0 … TRACE = 5`). Passing a raw number from
 * one to the other inverts filtering, so convert explicitly with these.
 */

import { LogLevel } from "../types.js";

/** The most verbose `@zudojs/logger` `LoggerLevel` value (`TRACE`). */
const LOGGER_TRACE = 5;

/**
 * Converts an observability {@link LogLevel} to the numeric value of the
 * same-named `@zudojs/logger` `LoggerLevel`.
 *
 * Returns `undefined` for {@link LogLevel.OFF}, which has no logger
 * counterpart, and for any value outside the enum.
 */
export function toLoggerLevel(level: LogLevel): number | undefined {
  if (!Number.isInteger(level) || level < LogLevel.TRACE) return undefined;
  if (level > LogLevel.FATAL) return undefined;
  return LOGGER_TRACE - level;
}

/**
 * Converts a numeric `@zudojs/logger` `LoggerLevel` to the same-named
 * observability {@link LogLevel}.
 *
 * Returns `undefined` for a value outside `LoggerLevel` (`0`–`5`).
 */
export function fromLoggerLevel(level: number): LogLevel | undefined {
  if (!Number.isInteger(level) || level < 0 || level > LOGGER_TRACE) {
    return undefined;
  }
  return (LOGGER_TRACE - level) as LogLevel;
}
