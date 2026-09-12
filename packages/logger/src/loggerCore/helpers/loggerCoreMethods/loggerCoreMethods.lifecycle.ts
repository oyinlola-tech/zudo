/**
 * ZudojsLogger lifecycle methods.
 */

import { LoggerLevel } from "../../../loggerLevel/loggerLevel.type.js";

import { createLoggerTransport } from "../../../loggerTransport/loggerTransport.core.js";

import { isLoggerTransport } from "../../../loggerTransport/loggerTransportGuard.js";

import { LoggerConfigurationError } from "../../../loggerErrors/loggerError.base.js";

import type { ZudojsLoggerContext } from "../../core/loggerCore.core.js";

/**
 * Sets the logger level.
 */
export function setLoggerLevel(
  ctx: ZudojsLoggerContext,
  level: LoggerLevel,
): void {
  ctx.assertActive();

  if (
    !Number.isInteger(level) ||
    level < LoggerLevel.FATAL ||
    level > LoggerLevel.TRACE
  ) {
    throw new LoggerConfigurationError(
      `Invalid logger level: ${String(level)}.`,
    );
  }

  ctx.assertMutable();

  ctx.updateConfiguration({
    ...ctx.configuration,
    level,
  });
}

/**
 * Enables the logger.
 */
export function enableLogger(ctx: ZudojsLoggerContext): void {
  ctx.assertActive();
  ctx.assertMutable();

  ctx.updateConfiguration({
    ...ctx.configuration,
    enabled: true,
  });
}

/**
 * Disables the logger.
 */
export function disableLogger(ctx: ZudojsLoggerContext): void {
  ctx.assertActive();
  ctx.assertMutable();

  ctx.updateConfiguration({
    ...ctx.configuration,
    enabled: false,
  });
}

/**
 * Flushes all transport buffers.
 */
export async function flushLogger(ctx: ZudojsLoggerContext): Promise<void> {
  ctx.assertActive();

  // In-flight dispatches must land in the transports before those
  // transports are asked to flush, otherwise flush() is a no-op for
  // everything logged in the same tick. A dispatch failure (surfaced
  // when `throwTransportErrors` is on) is rethrown only after the
  // transports have still been flushed.
  let failure: unknown;
  let failed = false;
  try {
    await ctx.drainDispatches();
  } catch (error) {
    failure = error;
    failed = true;
  }

  for (const transport of ctx.configuration.transports) {
    if (!isLoggerTransport(transport)) {
      continue;
    }

    const registered = createLoggerTransport(transport);

    if (!registered.enabled) {
      continue;
    }

    if (registered.flush) {
      await registered.flush();
    }
  }

  if (failed) throw failure;
}

/**
 * Closes all transports and marks logger as disposed.
 */
export async function closeLogger(ctx: ZudojsLoggerContext): Promise<void> {
  if (ctx.isDisposed()) {
    return;
  }

  // Closing is terminal: transports are flushed and closed and the logger
  // is marked disposed even when a dispatch failed; the failure is rethrown
  // afterwards.
  let failure: unknown;
  let failed = false;
  try {
    await ctx.drainDispatches();
  } catch (error) {
    failure = error;
    failed = true;
  }

  for (const transport of ctx.configuration.transports) {
    if (!isLoggerTransport(transport)) {
      continue;
    }

    const registered = createLoggerTransport(transport);

    if (registered.flush) {
      await registered.flush();
    }

    if (registered.close) {
      await registered.close();
    }
  }

  ctx.markDisposed();

  if (failed) throw failure;
}
