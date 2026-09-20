/**
 * ZudojsLogger level methods.
 */

import {
  LoggerLevel,
  shouldLog,
} from "../../../loggerLevel/loggerLevel.type.js";

import type { LogOptions } from "../../../loggerOptions/loggerOptions.type.js";

import {
  InvalidLoggerEntryError,
  LoggerConfigurationError,
} from "../../../loggerErrors/loggerError.base.js";

import { toLoggerError } from "../../../loggerErrors/loggerError.helpers.js";

import { createEntry } from "./loggerCoreMethods.entry.js";

import { dispatchEntrySync } from "./loggerCoreMethods.dispatch.js";

import type { ZudojsLoggerContext } from "../../core/loggerCore.core.js";

/**
 * Level logging methods extracted from ZudojsLogger.
 */
export function logAtLevel(
  ctx: ZudojsLoggerContext,
  level: LoggerLevel,
  message: string,
  options: LogOptions = {},
): void {
  ctx.assertActive();

  if (
    !ctx.configuration.enabled ||
    !shouldLog(ctx.configuration.level, level)
  ) {
    return;
  }

  if (typeof message !== "string") {
    throw new LoggerConfigurationError("Logger message must be a string.");
  }

  // Entry construction reads caller-supplied metadata, including
  // getters. A throwing accessor used to propagate straight out of
  // logger.info(...) and abort the caller — and only when the level
  // let the call through, so the same code was a silent no-op at one
  // log level and a crash at another. The offending field becomes a
  // marker and the failure is reported like every other infrastructure
  // failure, AFTER the line has been dispatched.
  const metadataFailures: Error[] = [];

  let entry;

  try {
    entry = createEntry(
      ctx.configuration,
      ctx.contextStorage,
      level,
      message,
      options,
      (key: string, error: unknown) => {
        metadataFailures.push(
          new InvalidLoggerEntryError(
            `Failed to read log metadata field "${key}": ${toLoggerError(error).message}`,
            { cause: error },
          ),
        );
      },
    );
  } catch (error) {
    ctx.handleInfrastructureError(
      new InvalidLoggerEntryError(
        `Failed to build log entry: ${toLoggerError(error).message}`,
        { cause: error },
      ),
    );
    return;
  }

  // Dispatch is asynchronous. It used to be fired and forgotten, so
  // flush() and close() could return while entries were still in
  // flight — messages were lost on process exit. Registering the
  // promise lets the lifecycle methods drain it.
  const dispatch = dispatchEntrySync(ctx.configuration, entry, (error: Error) =>
    ctx.handleInfrastructureError(error),
  );

  if (dispatch) {
    ctx.trackDispatch(dispatch);
  }

  for (const failure of metadataFailures) {
    ctx.handleInfrastructureError(failure);
  }
}
