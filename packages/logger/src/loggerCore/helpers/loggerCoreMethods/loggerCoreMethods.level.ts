/**
 * ZudojsLogger level methods.
 */

import {
  LoggerLevel,
  shouldLog,
} from "../../../loggerLevel/loggerLevel.type.js";

import type { LogOptions } from "../../../loggerOptions/loggerOptions.type.js";

import { LoggerConfigurationError } from "../../../loggerErrors/loggerError.base.js";

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

  const entry = createEntry(
    ctx.configuration,
    ctx.contextStorage,
    level,
    message,
    options,
  );

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
}
