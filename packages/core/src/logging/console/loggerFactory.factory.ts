import type { LoggerContext } from "../core/loggerContext.context.js";
import { ConsoleLogger } from "./consoleLogger.logger.js";
import type { Logger, LogContext } from "../core/logger.js";
import type { LoggerOptions } from "../core/loggerOptions.options.js";

/**
 * Supported logger implementations.
 *
 * Additional implementations can be added later without changing
 * the Logger contract.
 */
export type LoggerImplementation = "console";

/**
 * Configuration used when creating a logger.
 */
export interface LoggerFactoryOptions extends LoggerOptions {
  /**
   * Logger implementation to use.
   *
   * Defaults to "console".
   *
   * The type is deliberately widened to accept arbitrary
   * strings because this value frequently arrives from
   * configuration files; unknown implementations fail with a
   * descriptive error at creation time.
   */
  readonly implementation?: LoggerImplementation | (string & {});
}

/**
 * Creates and configures Zudojs logger instances.
 *
 * The factory keeps logger selection separate from the rest
 * of the framework.
 */
export class LoggerFactory {
  /**
   * Creates a logger using the supplied options.
   */
  public create(
    options: LoggerFactoryOptions = {},
    context: LoggerContext = {},
  ): Logger {
    const implementation = options.implementation ?? "console";

    switch (implementation) {
      case "console":
        return new ConsoleLogger(options, context);

      default:
        throw new Error(
          `Unsupported logger implementation: ${String(implementation)}`,
        );
    }
  }

  /**
   * Creates a child logger from an existing logger.
   *
   * This is useful when framework components need to add
   * module-specific or operation-specific context.
   */
  public child(logger: Logger, context: LoggerContext): Logger {
    return logger.child(context as LogContext);
  }
}
