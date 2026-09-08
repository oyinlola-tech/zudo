/**
 * Logging types for the observability package.
 */

/**
 * Numeric log level hierarchy. Higher = more severe.
 *
 * A record is emitted when its level is at or above the logger's threshold,
 * so a threshold of {@link LogLevel.OFF} silences everything.
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  OFF = 6,
}

/** Human-readable log level name. */
export type LogLevelName =
  "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "off";

/** A serialized view of a thrown value. */
export interface LogRecordError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: unknown;
}

/** A structured log record produced by a logger. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly levelName: LogLevelName;
  readonly message: string;
  readonly timestamp: Date;
  readonly loggerName: string;
  readonly context?: Record<string, unknown>;
  readonly error?: LogRecordError;
  /** Trace this record was emitted under, when a propagation context is active. */
  readonly traceId?: string;
  /** Span this record was emitted under, when a propagation context is active. */
  readonly spanId?: string;
}

/** Structured logger interface. */
export interface Logger {
  readonly name: string;
  /** Current threshold. Changes when {@link Logger.setLevel} is called. */
  readonly level: LogLevel;

  trace(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;
  debug(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;
  info(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;
  warn(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;
  error(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;
  fatal(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void;

  /** Creates a child logger with persistent context. */
  child(name: string, context?: Record<string, unknown>): Logger;

  /** Checks if a level would be logged. */
  isLevelEnabled(level: LogLevel): boolean;

  /**
   * Change the threshold at runtime. Child loggers created before the change
   * keep their own threshold.
   */
  setLevel(level: LogLevel): void;

  /** Flushes any buffered log records. */
  flush(): Promise<void>;
}

/** Options for creating a logger. */
export interface LoggerOptions {
  readonly name: string;
  readonly level?: LogLevel;
  readonly context?: Record<string, unknown>;
  readonly transport?: LogTransport;
  /**
   * Stamps `traceId` and `spanId` onto every record from the ambient
   * propagation context. Defaults to `true`.
   */
  readonly correlate?: boolean;
  /**
   * Redacts the merged context and the error before the record is written.
   * Applied by the logger, so every transport sees redacted records.
   */
  readonly redact?: (
    context: Record<string, unknown>,
  ) => Record<string, unknown>;
}

/** A log transport writes records to a destination. */
export interface LogTransport {
  readonly name: string;
  write(record: LogRecord): void | Promise<void>;
  /** Drains anything buffered. Optional: a direct transport has nothing to do. */
  flush?(): Promise<void>;
}

/** Exports log records to a backend. */
export interface LogExporter {
  export(records: readonly LogRecord[]): Promise<void>;
  shutdown(): Promise<void>;
}
