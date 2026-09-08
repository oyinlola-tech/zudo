/**
 * Supported logging severity levels in Zudojs.
 *
 * Levels are ordered from least severe to most severe.
 */
export const LogLevel = {
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

/**
 * Union of all supported Zudojs log levels.
 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Numeric severity used when comparing log levels.
 *
 * Higher values represent more severe events.
 */
export const LogLevelPriority: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * The level used when a configured level is unknown.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.INFO;

/**
 * Checks whether a value is a known log level.
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && Object.hasOwn(LogLevelPriority, value);
}

/**
 * Resolves an arbitrary value to a known log level.
 *
 * Unknown values fall back to "info" so a configuration typo
 * can never silently disable all logging.
 */
export function resolveLogLevel(value: unknown): LogLevel {
  return isLogLevel(value) ? value : DEFAULT_LOG_LEVEL;
}

/**
 * Determines whether a log level should be emitted when
 * the configured minimum level is applied.
 *
 * Unknown minimum levels are treated as "info" instead of
 * silently disabling all logging.
 */
export function shouldLog(level: LogLevel, minimumLevel: LogLevel): boolean {
  const levelPriority =
    LogLevelPriority[level] ?? LogLevelPriority[DEFAULT_LOG_LEVEL];
  const minimumPriority =
    LogLevelPriority[minimumLevel] ?? LogLevelPriority[DEFAULT_LOG_LEVEL];
  return levelPriority >= minimumPriority;
}
