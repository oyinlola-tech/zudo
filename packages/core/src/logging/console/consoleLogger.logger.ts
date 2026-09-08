import {
  LogLevel,
  LogLevelPriority,
  isLogLevel,
  shouldLog,
  type LogLevel as LogLevelType,
} from "../core/logLevel.level.js";
import { InvalidArgumentError } from "../../errors/exceptions.js";
import type { LogEntry } from "../core/logEntry.entry.js";
import {
  safeLogStringify,
  sanitizeLogValue,
  serializeLogError,
} from "../core/logEntry.entry.js";
import type { LoggerContext } from "../core/loggerContext.context.js";
import { loggerContextFromExecution } from "../core/loggerContext.context.js";
import {
  DEFAULT_LOGGER_OPTIONS,
  type LoggerOptions,
} from "../core/loggerOptions.options.js";
import { BaseLogger, type LogContext } from "../core/logger.js";

/**
 * Logger implementation that writes structured log entries
 * to the Node.js console.
 *
 * This implementation is primarily intended for:
 *
 * Development
 * Testing
 * Local tooling
 *
 * Production applications can replace it with a dedicated
 * structured logging implementation such as a Pino adapter.
 */
export class ConsoleLogger extends BaseLogger {
  private readonly options: Required<
    Pick<
      LoggerOptions,
      "level" | "timestamps" | "structured" | "includeStackTrace"
    >
  > &
    Omit<
      LoggerOptions,
      "level" | "timestamps" | "structured" | "includeStackTrace"
    >;

  public constructor(options: LoggerOptions = {}, context: LoggerContext = {}) {
    super({
      ...options.context,
      ...context,
    });

    const level = options.level ?? DEFAULT_LOGGER_OPTIONS.level;

    /*
     * An unknown level would make every severity comparison false
     * and silently disable all logging, so it is rejected at
     * construction instead. Levels are case-sensitive.
     */
    if (!isLogLevel(level)) {
      throw new InvalidArgumentError(
        `Unknown log level "${String(level)}". Expected one of: ${Object.keys(LogLevelPriority).join(", ")}.`,
        { level },
      );
    }

    this.options = {
      ...DEFAULT_LOGGER_OPTIONS,
      ...options,
      level,
    };
  }

  /**
   * Writes a log entry to the console.
   *
   * The context received here has already been merged with the
   * logger's persistent context by BaseLogger. Fields of the
   * current execution context (when a ContextStorage is configured
   * and a context is active) are merged beneath it.
   */
  protected write(
    level: LogLevelType,
    message: string,
    context?: LogContext,
    error?: unknown,
  ): void {
    if (!shouldLog(level, this.options.level)) {
      return;
    }

    const redact = this.options.redact;
    context = this.withExecutionContext(context);

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context:
        context !== undefined && redact !== undefined
          ? (redact(sanitizeLogValue(context)) as LogContext)
          : context,
      ...(error !== undefined
        ? {
            error: serializeLogError(error, { redact }),
          }
        : {}),
    };

    if (this.options.structured) {
      this.writeStructured(entry);
      return;
    }

    this.writeHumanReadable(entry);
  }

  /**
   * Creates a child logger that inherits the current
   * logger configuration.
   *
   * The context received here is the fully merged context
   * (parent persistent context plus child additions) produced
   * by BaseLogger.child().
   */
  protected createChild(context: LogContext): ConsoleLogger {
    return new ConsoleLogger(
      {
        ...this.options,
        context: undefined,
      },
      context,
    );
  }

  /**
   * Merges the ambient execution context (if any) beneath the
   * supplied context. Never throws: a failing storage lookup leaves
   * the context untouched.
   */
  private withExecutionContext(context?: LogContext): LogContext | undefined {
    const storage = this.options.contextStorage;
    if (!storage) return context;

    let execution;
    try {
      execution = storage.get();
    } catch {
      return context;
    }
    if (!execution) return context;

    return {
      ...(loggerContextFromExecution(execution) as LogContext),
      ...context,
    };
  }

  /**
   * Writes the log entry as JSON.
   *
   * Serialization is crash-safe: circular references, BigInt
   * values, and throwing toJSON implementations degrade to
   * placeholder strings instead of throwing.
   */
  private writeStructured(entry: LogEntry): void {
    const output = {
      level: entry.level,
      message: entry.message,
      ...(this.options.service !== undefined
        ? { service: this.options.service }
        : {}),
      ...(this.options.version !== undefined
        ? { version: this.options.version }
        : {}),
      ...(this.options.environment !== undefined
        ? { environment: this.options.environment }
        : {}),
      ...(this.options.timestamps
        ? {
            timestamp: entry.timestamp.toISOString(),
          }
        : {}),
      ...(entry.context !== undefined
        ? {
            context: entry.context,
          }
        : {}),
      ...(entry.error !== undefined
        ? {
            error: this.options.includeStackTrace
              ? entry.error
              : this.removeStackTrace(entry.error),
          }
        : {}),
    };

    this.writeToConsole(entry.level, safeLogStringify(output));
  }

  /**
   * Writes a human-readable log entry.
   */
  private writeHumanReadable(entry: LogEntry): void {
    const timestamp = this.options.timestamps
      ? `[${entry.timestamp.toISOString()}] `
      : "";

    const level = entry.level.toUpperCase();

    const context =
      entry.context !== undefined
        ? ` ${this.formatContext(entry.context)}`
        : "";

    const error =
      entry.error !== undefined ? ` ${this.formatError(entry.error)}` : "";

    this.writeToConsole(
      entry.level,
      `${timestamp}${level}: ${entry.message}${context}${error}`,
    );
  }

  /**
   * Writes to the appropriate console method based on severity.
   */
  private writeToConsole(level: LogLevelType, message: string): void {
    switch (level) {
      case LogLevel.TRACE:
        /*
         * console.trace prints a stack trace for every call,
         * which makes trace-level logs unreadable. Trace output
         * goes through console.debug (console.log fallback).
         */
        (console.debug ?? console.log)(message);
        break;

      case LogLevel.DEBUG:
        console.debug(message);
        break;

      case LogLevel.INFO:
        console.info(message);
        break;

      case LogLevel.WARN:
        console.warn(message);
        break;

      case LogLevel.ERROR:
        console.error(message);
        break;

      case LogLevel.FATAL:
        console.error(message);
        break;

      default:
        console.log(message);
    }
  }

  /**
   * Formats structured context for human-readable output.
   */
  private formatContext(context: LoggerContext | LogContext): string {
    return Object.entries(context)
      .map(([key, value]) => {
        return `${key}=${this.stringifyValue(value)}`;
      })
      .join(" ");
  }

  /**
   * Formats a structured error for human-readable output.
   */
  private formatError(error: NonNullable<LogEntry["error"]>): string {
    const parts: string[] = [];

    if (error.name) {
      parts.push(error.name);
    }

    if (error.message) {
      parts.push(error.message);
    }

    if (this.options.includeStackTrace && error.stack) {
      parts.push(`\n${error.stack}`);
    }

    return parts.join(": ");
  }

  /**
   * Removes the stack trace from an error representation.
   */
  private removeStackTrace(
    error: NonNullable<LogEntry["error"]>,
  ): Omit<NonNullable<LogEntry["error"]>, "stack"> {
    const { stack: _stack, ...safeError } = error;

    return safeError;
  }

  /**
   * Safely converts arbitrary values into strings.
   */
  private stringifyValue(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(sanitizeLogValue(value));
    } catch {
      return "[unserializable]";
    }
  }
}
