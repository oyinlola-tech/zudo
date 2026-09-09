/**
 * ZudojsLogger property accessors.
 */

import { LoggerLevel } from "../../loggerLevel/loggerLevel.type.js";

import type { ZudojsLoggerContext } from "../core/loggerCore.core.js";

/**
 * Gets the logger name.
 */
export function getLoggerName(ctx: ZudojsLoggerContext): string {
  ctx.assertActive();
  return ctx.configuration.name;
}

/**
 * Gets the logger level.
 */
export function getLoggerLevel(ctx: ZudojsLoggerContext): LoggerLevel {
  ctx.assertActive();
  return ctx.configuration.level;
}

/**
 * Gets whether the logger is enabled.
 */
export function getLoggerEnabled(ctx: ZudojsLoggerContext): boolean {
  return !ctx.isDisposed() && ctx.configuration.enabled;
}
