/**
 * Logger core types and interfaces.
 */

import type {
  LoggerLevel,
  LoggerLevelLike,
} from "../../loggerLevel/loggerLevel.type.js";

import type { LogMetadata } from "../../loggerEntry/loggerEntry.type.js";

import type { LoggerContext } from "../../loggerContext/loggerContext.core.js";

import type {
  ChildLoggerOptions,
  LogOptions,
} from "../../loggerOptions/loggerOptions.type.js";

/**
 * Main Zudojs logger contract.
 */
export interface Logger {
  // Level methods keep a single metadata-only signature so custom loggers
  // implementing this interface, and structural logger types
  // (`{ warn(message, context?) }`), keep working. At runtime an Error passed
  // as the second argument is logged as the entry's error with its stack;
  // the typed way to log one is `log(level, message, { error, metadata })`.
  readonly name: string;
  readonly level: LoggerLevel;
  readonly enabled: boolean;

  fatal(message: string, metadata?: LogMetadata): void;

  error(message: string, metadata?: LogMetadata): void;

  warn(message: string, metadata?: LogMetadata): void;

  info(message: string, metadata?: LogMetadata): void;

  debug(message: string, metadata?: LogMetadata): void;

  trace(message: string, metadata?: LogMetadata): void;

  log(level: LoggerLevel, message: string, options?: LogOptions): void;

  child(options?: ChildLoggerOptions): Logger;

  withContext(context: LoggerContext): Logger;

  /**
   * Sets the threshold. Accepts `LoggerLevel.ERROR` or a name such as
   * `"error"` (any case). An implementation declared with a `LoggerLevel`
   * parameter still satisfies this interface.
   */
  setLevel(level: LoggerLevelLike): void;

  enable(): void;

  disable(): void;

  flush(): Promise<void>;

  close(): Promise<void>;
}
