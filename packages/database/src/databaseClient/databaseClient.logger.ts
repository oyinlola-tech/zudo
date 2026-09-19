/**
 * @zudojs/database — Default Logger
 *
 * Fallback logger for environments where no application logger has been
 * configured yet. It writes through `@zudojs/logger` (console transport,
 * secret-name redaction) instead of calling `console.*` directly.
 */

import { createLogger, LoggerLevel } from "@zudojs/logger";
import type { Logger, LogOptions } from "@zudojs/logger";

import type { DatabaseLogger } from "../databaseType/databaseType.type.js";

/** Logger name used by the database fallback logger. */
export const DEFAULT_DATABASE_LOGGER_NAME = "@zudojs/database";

type Metadata = Readonly<Record<string, unknown>> | undefined;

function isVerboseEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function toOptions(metadata: Metadata, error?: unknown): LogOptions {
  if (error === undefined) {
    return metadata === undefined ? {} : { metadata };
  }
  if (error instanceof Error) {
    return metadata === undefined ? { error } : { metadata, error };
  }
  return { metadata: { ...(metadata ?? {}), error } };
}

/**
 * Adapts a `@zudojs/logger` {@link Logger} to the {@link DatabaseLogger}
 * contract. `debug`/`info` are dropped when `NODE_ENV` is `"production"`,
 * checked per call as before; `warn`/`error` are always written.
 */
export function createDatabaseLoggerAdapter(logger: Logger): DatabaseLogger {
  return Object.freeze({
    debug: (message: string, metadata?: Readonly<Record<string, unknown>>) => {
      if (isVerboseEnabled()) {
        logger.log(LoggerLevel.DEBUG, message, toOptions(metadata));
      }
    },
    info: (message: string, metadata?: Readonly<Record<string, unknown>>) => {
      if (isVerboseEnabled()) {
        logger.log(LoggerLevel.INFO, message, toOptions(metadata));
      }
    },
    warn: (message: string, metadata?: Readonly<Record<string, unknown>>) => {
      logger.log(LoggerLevel.WARN, message, toOptions(metadata));
    },
    error: (
      message: string,
      error?: unknown,
      metadata?: Readonly<Record<string, unknown>>,
    ) => {
      logger.log(LoggerLevel.ERROR, message, toOptions(metadata, error));
    },
  });
}

/** Creates the fallback database logger, backed by `@zudojs/logger`. */
export function createDefaultLogger(): DatabaseLogger {
  return createDatabaseLoggerAdapter(
    createLogger({
      name: DEFAULT_DATABASE_LOGGER_NAME,
      level: LoggerLevel.DEBUG,
    }),
  );
}
