/**
 * @zudojs/observability — Logger Core
 *
 * Structured logger implementation with level filtering, transport support,
 * child loggers, persistent context, trace correlation and redaction.
 */

import type { Logger, LoggerOptions, LogTransport } from "../types.js";
import { LogLevel } from "../types.js";
import { shouldLog } from "../logLevel/index.js";
import { createLogRecord } from "../logRecord/index.js";
import { getCurrentContext } from "../propagation/index.js";

/** Default no-op transport that discards all records. */
const noopTransport: LogTransport = {
  name: "noop",
  write: () => {},
};

/**
 * Core structured logger with level filtering, child loggers,
 * persistent context, and transport support.
 *
 * Every record is stamped with the ambient `traceId`/`spanId` when a
 * propagation context is active, so logs and traces line up without the
 * caller threading IDs through by hand.
 */
export class StructuredLogger implements Logger {
  readonly name: string;

  private currentLevel: LogLevel;
  private readonly context: Record<string, unknown>;
  private readonly transport: LogTransport;
  private readonly correlate: boolean;
  private readonly redact?: (
    context: Record<string, unknown>,
  ) => Record<string, unknown>;

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.currentLevel = options.level ?? LogLevel.INFO;
    this.context = { ...(options.context ?? {}) };
    this.transport = options.transport ?? noopTransport;
    this.correlate = options.correlate ?? true;
    this.redact = options.redact;
  }

  get level(): LogLevel {
    return this.currentLevel;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  trace(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.TRACE, message, context, error);
  }

  debug(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.DEBUG, message, context, error);
  }

  info(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.INFO, message, context, error);
  }

  warn(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  fatal(
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  child(name: string, context?: Record<string, unknown>): Logger {
    const childName = `${this.name}.${name}`;
    const childContext = { ...this.context, ...(context ?? {}) };
    return new StructuredLogger({
      name: childName,
      level: this.currentLevel,
      context: childContext,
      transport: this.transport,
      correlate: this.correlate,
      redact: this.redact,
    });
  }

  isLevelEnabled(level: LogLevel): boolean {
    return shouldLog(this.currentLevel, level);
  }

  async flush(): Promise<void> {
    await this.transport.flush?.();
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (!this.isLevelEnabled(level)) return;

    const merged = { ...this.context, ...(context ?? {}) };
    const redacted = this.redact ? this.redact(merged) : merged;
    const propagation = this.correlate ? getCurrentContext() : undefined;

    const record = createLogRecord({
      level,
      message,
      loggerName: this.name,
      context: Object.keys(redacted).length > 0 ? redacted : undefined,
      error,
      traceId: propagation?.traceId,
      spanId: propagation?.spanId,
    });

    // A transport must never take the caller down with it. A failing sink is
    // reported through the transport's own channel, not raised here.
    try {
      const written = this.transport.write(record);
      if (written instanceof Promise) written.catch(() => {});
    } catch {
      // Intentionally swallowed: logging is not allowed to throw.
    }
  }
}

/** Creates a structured logger. */
export function createStructuredLogger(
  options: LoggerOptions,
): StructuredLogger {
  return new StructuredLogger(options);
}
