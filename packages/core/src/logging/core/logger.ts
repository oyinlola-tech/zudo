import type { LogLevel } from "./logLevel.level.js";

/**
 * Structured metadata attached to a log entry.
 */
export type LogContext = Record<string, unknown>;

/**
 * Logger contract used throughout Zudojs.
 *
 * The core does not depend on a particular logging implementation.
 * Adapters can later connect this interface to Pino, Winston,
 * OpenTelemetry, cloud logging systems, or custom implementations.
 */
export interface Logger {
  /**
   * Logs a trace level message.
   */
  trace(message: string, context?: LogContext): void;

  /**
   * Logs a debug level message.
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Logs an informational message.
   */
  info(message: string, context?: LogContext): void;

  /**
   * Logs a warning.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Logs an error.
   */
  error(message: string, error?: unknown, context?: LogContext): void;

  /**
   * Logs a fatal error.
   */
  fatal(message: string, error?: unknown, context?: LogContext): void;

  /**
   * Creates a child logger with persistent context.
   */
  child(context: LogContext): Logger;
}

/**
 * Base logger implementation that provides common behavior
 * such as persistent child context.
 *
 * Concrete output implementations can extend this class.
 */
export abstract class BaseLogger implements Logger {
  private readonly persistentContext: LogContext;

  protected constructor(context: LogContext = {}) {
    this.persistentContext = {
      ...context,
    };
  }

  /**
   * Merges the persistent (constructor/child) context under the
   * per-call context. Per-call values win on key conflicts.
   *
   * Returns undefined only when there is no context at all, so
   * implementations can keep omitting empty context objects.
   */
  protected mergeCallContext(context?: LogContext): LogContext | undefined {
    const hasPersistent = Object.keys(this.persistentContext).length > 0;

    if (!hasPersistent) return context;
    if (context === undefined) return { ...this.persistentContext };

    return {
      ...this.persistentContext,
      ...context,
    };
  }

  /**
   * Returns a copy of the persistent context attached to this
   * logger.
   */
  protected getPersistentContext(): LogContext {
    return { ...this.persistentContext };
  }

  public trace(message: string, context?: LogContext): void {
    this.write("trace", message, this.mergeCallContext(context));
  }

  public debug(message: string, context?: LogContext): void {
    this.write("debug", message, this.mergeCallContext(context));
  }

  public info(message: string, context?: LogContext): void {
    this.write("info", message, this.mergeCallContext(context));
  }

  public warn(message: string, context?: LogContext): void {
    this.write("warn", message, this.mergeCallContext(context));
  }

  public error(message: string, error?: unknown, context?: LogContext): void {
    this.write("error", message, this.mergeCallContext(context), error);
  }

  public fatal(message: string, error?: unknown, context?: LogContext): void {
    this.write("fatal", message, this.mergeCallContext(context), error);
  }

  public child(context: LogContext): Logger {
    return this.createChild({
      ...this.persistentContext,
      ...context,
    });
  }

  /**
   * Writes a structured log entry.
   *
   * Concrete loggers decide where and how the entry is written.
   */
  protected abstract write(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown,
  ): void;

  /**
   * Creates a child logger.
   */
  protected abstract createChild(context: LogContext): Logger;
}
