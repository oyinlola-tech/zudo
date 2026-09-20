import type { Logger } from "../loggerCore/core/loggerCore.type.js";
import { LoggerDisposedError } from "../loggerErrors/loggerError.base.js";
import { createLogger } from "../loggerCore/core/loggerCore.core.js";
import { createDefaultLogger } from "../loggerCore/helpers/loggerCore.helper.js";
import type { LoggerFactory } from "../loggerFactory/loggerFactory.core.js";
import { createLoggerFactory } from "../loggerFactory/loggerFactory.core.js";
import type { LoggerOptions } from "../loggerOptions/loggerOptions.type.js";

/**
 * Manages application-wide loggers.
 *
 * LoggerFactory handles logger creation and registry operations.
 * LoggerManager provides the higher-level lifecycle and global
 * application logger behavior.
 */
export class LoggerManager {
  private readonly factory: LoggerFactory;
  private defaultLogger?: Logger;
  private initialized = false;
  private closed = false;

  constructor(options: LoggerOptions = {}) {
    this.factory = createLoggerFactory(options);
  }

  /** Initializes the logger manager. Initialization is idempotent. */
  initialize(options: LoggerOptions = {}): Logger {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    if (this.initialized && this.defaultLogger) return this.defaultLogger;

    const logger = this.factory.create(options.name ?? "zudojs", options);
    this.defaultLogger = logger;
    this.initialized = true;
    return logger;
  }

  /**
   * Adopts an existing logger as the manager's default logger.
   *
   * The logger is REGISTERED with the underlying factory, so it is
   * covered by flush(), close(), getAll() and size. Assigning it to the
   * private default field alone (as createLoggerManagerFromLogger used
   * to) left the registry empty, making flush()/close() no-ops for the
   * only logger the manager owned.
   */
  adopt(logger: Logger): Logger {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    this.factory.register(logger);
    this.defaultLogger = logger;
    this.initialized = true;
    return logger;
  }

  /** Returns the default application logger. Lazily initializes when necessary. */
  getLogger(): Logger {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    if (!this.defaultLogger) return this.initialize();
    return this.defaultLogger;
  }

  /** Returns a named logger. Named loggers are managed by the underlying factory. */
  get(name: string, options: LoggerOptions = {}): Logger {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    return this.factory.getOrCreate(name, options);
  }

  /** Creates a new logger even when another logger with the same name already exists. */
  create(name: string, options: LoggerOptions = {}): Logger {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    return this.factory.create(name, options, true);
  }

  /** Checks whether a named logger exists. */
  has(name: string): boolean {
    if (this.closed) return false;
    return this.factory.has(name);
  }

  /** Removes a named logger without closing it. */
  remove(name: string): boolean {
    if (this.closed) return false;
    if (this.defaultLogger?.name === name) this.defaultLogger = undefined;
    return this.factory.remove(name);
  }

  /** Flushes all managed loggers. */
  async flush(): Promise<void> {
    if (this.closed) return;
    await this.factory.flushAll();
  }

  /** Closes all managed loggers. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.initialized = false;
    this.defaultLogger = undefined;
    await this.factory.disposeAll();
  }

  /** Returns all managed loggers. */
  getAll(): readonly Logger[] {
    if (this.closed) return [];
    return this.factory.getAll();
  }

  /** Returns the number of managed loggers. */
  get size(): number {
    if (this.closed) return 0;
    return this.factory.size;
  }

  /** Returns whether the manager has been initialized. */
  get isInitialized(): boolean {
    return this.initialized && !this.closed;
  }

  /** Returns whether the manager has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Provides direct access to the underlying factory. */
  getFactory(): LoggerFactory {
    if (this.closed) throw new LoggerDisposedError("LoggerManager");
    return this.factory;
  }
}

/** Creates a LoggerManager. */
export function createLoggerManager(
  options: LoggerOptions = {},
): LoggerManager {
  return new LoggerManager(options);
}

/** Creates and initializes a LoggerManager. */
export function initializeLoggerManager(
  options: LoggerOptions = {},
): LoggerManager {
  const manager = createLoggerManager(options);
  manager.initialize(options);
  return manager;
}

/** Creates the default application logger. */
export function createManagedDefaultLogger(name = "zudojs"): Logger {
  return createDefaultLogger(name);
}

/** Creates a logger manager from an existing logger. */
export function createLoggerManagerFromLogger(logger: Logger): LoggerManager {
  const manager = new LoggerManager();
  manager.adopt(logger);
  return manager;
}

/** Returns a logger from a manager or creates a fallback logger when no manager is supplied. */
export function resolveManagedLogger(
  manager?: LoggerManager,
  name = "zudojs",
): Logger {
  if (manager) return manager.get(name);
  return createLogger({ name });
}
