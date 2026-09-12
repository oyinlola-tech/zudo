/**
 * Core logger implementation.
 */

import { LoggerLevel } from "../../loggerLevel/loggerLevel.type.js";

import type { LogMetadata } from "../../loggerEntry/loggerEntry.type.js";

import type {
  LoggerContext,
  LoggerContextStorage,
} from "../../loggerContext/loggerContext.core.js";

import { createLoggerContextStorage } from "../../loggerContext/loggerContextStorage.js";

import type {
  ChildLoggerOptions,
  LoggerConfiguration,
  LoggerOptions,
  LogOptions,
} from "../../loggerOptions/loggerOptions.type.js";

import { resolveLoggerOptions } from "../../loggerOptions/loggerOptions.type.js";

import type { Logger } from "./loggerCore.type.js";

import {
  normalizeConfiguration,
  assertActive as assertActiveHelper,
  assertMutable as assertMutableHelper,
  handleInfrastructureError as handleInfrastructureErrorHelper,
} from "../helpers/loggerCoreHelpers.js";

import {
  logAtLevel,
  childLogger,
  withContextLogger,
  setLoggerLevel,
  enableLogger,
  disableLogger,
  flushLogger,
  closeLogger,
} from "../helpers/loggerCoreMethods/index.js";

import {
  getLoggerName,
  getLoggerLevel,
  getLoggerEnabled,
} from "../helpers/loggerCoreMethods.loggerProps.js";

/**
 * Internal context passed to extracted methods.
 */
export interface ZudojsLoggerContext {
  readonly configuration: LoggerConfiguration;
  readonly contextStorage: LoggerContextStorage;
  assertActive(): void;
  assertMutable(): void;
  handleInfrastructureError(error: Error): void;
  isDisposed(): boolean;
  markDisposed(): void;
  updateConfiguration(config: LoggerConfiguration): void;
  createChildLogger(options: LoggerOptions): Logger;

  /** Registers an in-flight dispatch so it can be awaited later. */
  trackDispatch(dispatch: Promise<void>): void;

  /** Resolves once every registered dispatch has settled. */
  drainDispatches(): Promise<void>;
}

/** Upper bound on dispatch failures retained between two flushes. */
const MAX_RETAINED_DISPATCH_FAILURES = 32;

/**
 * Logger implementation.
 */
export class ZudojsLogger implements Logger, ZudojsLoggerContext {
  private _configuration: LoggerConfiguration;
  private readonly _contextStorage: LoggerContextStorage;
  private _disposed = false;
  private _closing: Promise<void> | undefined;
  private readonly _pending = new Set<Promise<void>>();
  private readonly _dispatchFailures: unknown[] = [];
  private _droppedFailures = 0;

  constructor(
    options: LoggerOptions = {},
    contextStorage?: LoggerContextStorage,
  ) {
    this._configuration = resolveLoggerOptions(options);
    this._contextStorage = contextStorage ?? createLoggerContextStorage();
    this._configuration = normalizeConfiguration(this._configuration);
  }

  get configuration(): LoggerConfiguration {
    return this._configuration;
  }
  get contextStorage(): LoggerContextStorage {
    return this._contextStorage;
  }
  get name(): string {
    return getLoggerName(this);
  }
  get level(): LoggerLevel {
    return getLoggerLevel(this);
  }
  get enabled(): boolean {
    return getLoggerEnabled(this);
  }

  fatal(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.FATAL, message, { metadata });
  }
  error(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.ERROR, message, { metadata });
  }
  warn(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.WARN, message, { metadata });
  }
  info(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.INFO, message, { metadata });
  }
  debug(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.DEBUG, message, { metadata });
  }
  trace(message: string, metadata?: LogMetadata): void {
    logAtLevel(this, LoggerLevel.TRACE, message, { metadata });
  }

  log(level: LoggerLevel, message: string, options: LogOptions = {}): void {
    logAtLevel(this, level, message, options);
  }

  child(options: ChildLoggerOptions = {}): Logger {
    return childLogger(this, options);
  }
  withContext(context: LoggerContext): Logger {
    return withContextLogger(this, context);
  }

  setLevel(level: LoggerLevel): void {
    setLoggerLevel(this, level);
  }
  enable(): void {
    enableLogger(this);
  }
  disable(): void {
    disableLogger(this);
  }
  flush(): Promise<void> {
    return flushLogger(this);
  }
  close(): Promise<void> {
    // Concurrent callers share one closure: two overlapping close() calls
    // used to drain and close every transport twice.
    if (this._closing) return this._closing;
    this._closing = closeLogger(this).finally(() => {
      this._closing = undefined;
    });
    return this._closing;
  }

  assertActive(): void {
    assertActiveHelper(this._disposed, this._configuration.name);
  }
  assertMutable(): void {
    assertMutableHelper(this._configuration.mutable);
  }
  handleInfrastructureError(error: Error): void {
    handleInfrastructureErrorHelper(
      this._configuration.throwTransportErrors,
      error,
    );
  }
  isDisposed(): boolean {
    return this._disposed;
  }
  markDisposed(): void {
    this._disposed = true;
  }

  updateConfiguration(config: LoggerConfiguration): void {
    this._configuration = Object.freeze(config);
  }

  createChildLogger(options: LoggerOptions): Logger {
    return new ZudojsLogger(options, this._contextStorage);
  }

  trackDispatch(dispatch: Promise<void>): void {
    // A dispatch rejects only when handleError threw — i.e. when
    // `throwTransportErrors` is on and an asynchronous transport failed.
    // Nothing can throw from the log call that started it, so the failure
    // is kept (bounded) and surfaced by the next flush()/close(); it was
    // previously swallowed outright, which made the option a no-op for
    // every asynchronous transport.
    const tracked = dispatch
      .then(
        () => {},
        (error: unknown) => {
          if (!this._configuration.throwTransportErrors) return;
          if (this._dispatchFailures.length < MAX_RETAINED_DISPATCH_FAILURES) {
            this._dispatchFailures.push(error);
          } else {
            this._droppedFailures += 1;
          }
        },
      )
      .finally(() => {
        this._pending.delete(tracked);
      });

    this._pending.add(tracked);
  }

  async drainDispatches(): Promise<void> {
    // A dispatch can start further dispatches (a transport that logs),
    // so drain until the set is genuinely empty.
    while (this._pending.size > 0) {
      await Promise.all([...this._pending]);
    }

    if (this._dispatchFailures.length === 0) return;

    const failures = this._dispatchFailures.splice(0);
    const dropped = this._droppedFailures;
    this._droppedFailures = 0;

    if (failures.length === 1 && dropped === 0) throw failures[0];
    throw new AggregateError(
      failures,
      `${failures.length + dropped} log dispatch(es) failed since the last flush.`,
    );
  }
}

/**
 * Creates a Zudojs logger.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new ZudojsLogger(options);
}
