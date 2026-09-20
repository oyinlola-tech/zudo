import type { Logger } from "../loggerCore/core/loggerCore.type.js";
import { createLogger } from "../loggerCore/core/loggerCore.core.js";
import type {
  LoggerOptions,
  ChildLoggerOptions,
} from "../loggerOptions/loggerOptions.type.js";

/**
 * Factory responsible for creating and managing Zudojs loggers.
 *
 * The factory keeps logger creation consistent across the application
 * and provides a simple place for global logger defaults.
 */
export class LoggerFactory {
  private readonly defaults: LoggerOptions;
  private readonly loggers = new Map<string, Logger>();

  constructor(defaults: LoggerOptions = {}) {
    this.defaults = {
      ...defaults,
      metadata: { ...(defaults.metadata ?? {}) },
      transports: [...(defaults.transports ?? [])],
    };
  }

  /**
   * Creates a new logger.
   *
   * If a logger with the same name already exists, the existing
   * instance is returned unless `forceNew` is enabled.
   */
  create(name?: string, options: LoggerOptions = {}, forceNew = false): Logger {
    const loggerName = name ?? options.name ?? this.defaults.name ?? "zudojs";

    if (!forceNew && this.loggers.has(loggerName)) {
      return this.loggers.get(loggerName) as Logger;
    }

    const merged = this.mergeOptions({ ...options, name: loggerName });
    const logger = createLogger(merged);
    this.loggers.set(loggerName, logger);
    return logger;
  }

  /**
   * Registers an existing logger under its own name (or `name`).
   *
   * An adopted logger is then covered by `flushAll()`, `disposeAll()`,
   * `getAll()` and `size` exactly like one the factory created itself.
   */
  register(logger: Logger, name?: string): Logger {
    this.loggers.set(name ?? logger.name, logger);
    return logger;
  }

  /** Returns an existing logger. */
  get(name: string): Logger | undefined {
    return this.loggers.get(name);
  }

  /** Gets an existing logger or creates it. */
  getOrCreate(name: string, options: LoggerOptions = {}): Logger {
    return this.get(name) ?? this.create(name, options);
  }

  /** Creates a child logger from an existing logger. */
  child(parent: Logger, options: ChildLoggerOptions = {}): Logger {
    return parent.child(options);
  }

  /**
   * Removes a logger from the factory registry.
   *
   * The logger itself is not closed. Use `dispose` when the logger
   * should also release its resources.
   */
  remove(name: string): boolean {
    return this.loggers.delete(name);
  }

  /** Closes and removes a logger. */
  async dispose(name: string): Promise<boolean> {
    const logger = this.loggers.get(name);
    if (!logger) return false;
    await logger.close();
    this.loggers.delete(name);
    return true;
  }

  /** Closes every logger managed by the factory. */
  async disposeAll(): Promise<void> {
    const loggers = Array.from(this.loggers.values());
    this.loggers.clear();

    await Promise.all(
      loggers.map(async (logger) => {
        try {
          await logger.close();
        } catch {
          /* Disposal continues for the remaining loggers. */
        }
      }),
    );
  }

  /** Flushes every managed logger. */
  async flushAll(): Promise<void> {
    const loggers = Array.from(this.loggers.values());
    await Promise.all(loggers.map((logger) => logger.flush()));
  }

  /** Returns all currently registered loggers. */
  getAll(): readonly Logger[] {
    return Array.from(this.loggers.values());
  }

  /** Returns the number of managed loggers. */
  get size(): number {
    return this.loggers.size;
  }

  /** Checks whether a logger exists. */
  has(name: string): boolean {
    return this.loggers.has(name);
  }

  /** Creates a logger using the factory defaults without registering it. */
  createTransient(options: LoggerOptions = {}): Logger {
    return createLogger(this.mergeOptions(options));
  }

  /** Merges factory defaults with logger-specific options. */
  private mergeOptions(options: LoggerOptions): LoggerOptions {
    return {
      ...this.defaults,
      ...options,
      metadata: {
        ...(this.defaults.metadata ?? {}),
        ...(options.metadata ?? {}),
      },
      transports: options.transports ?? this.defaults.transports,
    };
  }
}

/** Creates a logger factory. */
export function createLoggerFactory(
  defaults: LoggerOptions = {},
): LoggerFactory {
  return new LoggerFactory(defaults);
}

/** Creates a standalone logger through a factory. */
export function createFactoryLogger(
  factory: LoggerFactory,
  name: string,
  options: LoggerOptions = {},
): Logger {
  return factory.create(name, options);
}

/** Returns a logger from a factory, creating it when necessary. */
export function getFactoryLogger(factory: LoggerFactory, name: string): Logger {
  return factory.getOrCreate(name);
}
