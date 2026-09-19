import { LoggerLevel } from "@zudojs/logger";
import type { Logger } from "@zudojs/logger";

const LEVEL_MAP: Record<LoggerLevel, string> = {
  [LoggerLevel.FATAL]: "fatal",
  [LoggerLevel.ERROR]: "error",
  [LoggerLevel.WARN]: "warn",
  [LoggerLevel.INFO]: "info",
  [LoggerLevel.DEBUG]: "debug",
  [LoggerLevel.TRACE]: "trace",
};

const LEVEL_ORDER: LoggerLevel[] = [
  LoggerLevel.TRACE,
  LoggerLevel.DEBUG,
  LoggerLevel.INFO,
  LoggerLevel.WARN,
  LoggerLevel.ERROR,
  LoggerLevel.FATAL,
];

/**
 * Creates a simple console-based logger for the enrollment service.
 * @param level - The minimum log level.
 * @returns A Logger instance.
 */
export function createAppLogger(level: LoggerLevel = LoggerLevel.INFO): Logger {
  const currentLevelIndex = LEVEL_ORDER.indexOf(level);

  const logMessage = (
    lvl: LoggerLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ) => {
    const levelIndex = LEVEL_ORDER.indexOf(lvl);
    if (levelIndex < currentLevelIndex) return;

    const timestamp = new Date().toISOString();
    const levelName = LEVEL_MAP[lvl] ?? "unknown";
    const meta = metadata ? ` ${JSON.stringify(metadata)}` : "";
    console.log(
      `[${timestamp}] [${levelName.toUpperCase()}] ${message}${meta}`,
    );
  };

  return {
    name: "app",
    level,
    enabled: true,
    fatal: (msg, meta) => logMessage(LoggerLevel.FATAL, msg, meta as any),
    error: (msg, meta) => logMessage(LoggerLevel.ERROR, msg, meta as any),
    warn: (msg, meta) => logMessage(LoggerLevel.WARN, msg, meta as any),
    info: (msg, meta) => logMessage(LoggerLevel.INFO, msg, meta as any),
    debug: (msg, meta) => logMessage(LoggerLevel.DEBUG, msg, meta as any),
    trace: (msg, meta) => logMessage(LoggerLevel.TRACE, msg, meta as any),
    log: (lvl, msg, _opts) => logMessage(lvl, msg),
    child: () => createAppLogger(level),
    withContext: () => createAppLogger(level),
    setLevel: () => {},
    enable: () => {},
    disable: () => {},
    flush: async () => {},
    close: async () => {},
  };
}
