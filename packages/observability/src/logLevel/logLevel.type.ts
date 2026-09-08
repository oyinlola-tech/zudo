/**
 * @zudojs/observability — Log Level
 *
 * The single source of truth for the level↔name mapping, and the filtering
 * predicate every logger uses.
 */

import { LogLevel, type LogLevelName } from "../types.js";

const LEVEL_TO_NAME: ReadonlyMap<LogLevel, LogLevelName> = new Map([
  [LogLevel.TRACE, "trace"],
  [LogLevel.DEBUG, "debug"],
  [LogLevel.INFO, "info"],
  [LogLevel.WARN, "warn"],
  [LogLevel.ERROR, "error"],
  [LogLevel.FATAL, "fatal"],
  [LogLevel.OFF, "off"],
]);

const NAME_TO_LEVEL: ReadonlyMap<LogLevelName, LogLevel> = new Map(
  [...LEVEL_TO_NAME].map(([level, name]) => [name, level]),
);

const LEVEL_NAMES: readonly LogLevelName[] = [...LEVEL_TO_NAME.values()];

/** Converts a numeric level to its name. */
export function logLevelToName(level: LogLevel): LogLevelName {
  return LEVEL_TO_NAME.get(level) ?? "off";
}

/** Converts a level name to its numeric value. */
export function logLevelFromName(name: LogLevelName): LogLevel {
  return NAME_TO_LEVEL.get(name) ?? LogLevel.OFF;
}

/**
 * Parses an arbitrary string — an environment variable, a config file entry —
 * into a level, returning `undefined` when it names no level. Use this at a
 * trust boundary; {@link logLevelFromName} assumes the name is already valid.
 */
export function parseLogLevel(value: string): LogLevel | undefined {
  return NAME_TO_LEVEL.get(value.trim().toLowerCase() as LogLevelName);
}

/** Returns true if a message at `messageLevel` should pass the `threshold`. */
export function shouldLog(
  threshold: LogLevel,
  messageLevel: LogLevel,
): boolean {
  if (threshold >= LogLevel.OFF) return false;
  return messageLevel >= threshold;
}

/** Returns all log level names. */
export function getLogLevelNames(): readonly LogLevelName[] {
  return LEVEL_NAMES;
}
