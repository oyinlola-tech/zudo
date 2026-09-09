/**
 * ZudojsLogger child and context methods.
 */

import type { LoggerContext } from "../../../loggerContext/loggerContext.core.js";

import type { ChildLoggerOptions } from "../../../loggerOptions/loggerOptions.type.js";

import { createChildLoggerOptions } from "../../../loggerOptions/loggerOptions.type.js";

import type { Logger } from "../../core/loggerCore.type.js";

import { ContextLogger } from "../../core/loggerCore.context.js";

import type { ZudojsLoggerContext } from "../../core/loggerCore.core.js";

/**
 * Creates a child logger.
 */
export function childLogger(
  ctx: ZudojsLoggerContext,
  options: ChildLoggerOptions = {},
): Logger {
  ctx.assertActive();

  const childOptions = createChildLoggerOptions(ctx.configuration, options);

  return ctx.createChildLogger(childOptions);
}

/**
 * Creates a logger with scoped context.
 */
export function withContextLogger(
  ctx: ZudojsLoggerContext,
  context: LoggerContext,
): Logger {
  ctx.assertActive();

  const child = childLogger(ctx);

  // The child shares the parent's context storage, so the wrapper must
  // scope THAT storage for the context to reach created entries.
  return new ContextLogger(child, context, ctx.contextStorage);
}
