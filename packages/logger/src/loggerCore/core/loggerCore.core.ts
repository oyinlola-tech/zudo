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

/**
 * Logger implementation.
 */
export class ZudojsLogger implements Logger, ZudojsLoggerContext {
  private _configuration: LoggerConfiguration;
  private readonly _contextStorage: LoggerContextStorage;
  private _disposed = false;
  private readonly _pending = new Set<Promise<void>>();

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
    return closeLogger(this);
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
    // dispatchEntry routes its own failures through handleError, so a
    // rejection here is unexpected; swallow it to keep an unawaited log
    // call from crashing the process, and keep the entry drainable.
    const tracked = dispatch
      .catch(() => {})
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
  }
}

/**
 * Creates a Zudojs logger.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new ZudojsLogger(options);
}
