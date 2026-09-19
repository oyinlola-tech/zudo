/**
 * ZudojsLogger lifecycle methods.
 */

import { LoggerLevel } from "../../../loggerLevel/loggerLevel.type.js";

import { createLoggerTransport } from "../../../loggerTransport/loggerTransport.core.js";

import { isLoggerTransport } from "../../../loggerTransport/loggerTransportGuard.js";

import { LoggerConfigurationError } from "../../../loggerErrors/loggerError.base.js";

import { throwCollectedFailures } from "../../../loggerErrors/loggerError.helpers.js";

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
 * Flushes (and optionally closes) every configured transport, isolating
 * each one: a failing sink is collected and the walk continues, so one
 * bad transport cannot leave every later transport unflushed/unclosed.
 */
async function settleTransports(
  ctx: ZudojsLoggerContext,
  close: boolean,
  failures: unknown[],
): Promise<void> {
  for (const transport of ctx.configuration.transports) {
    if (!isLoggerTransport(transport)) continue;
    const registered = createLoggerTransport(transport);
    if (!close && !registered.enabled) continue;
    const steps = close
      ? [() => registered.flush?.(), () => registered.close?.()]
      : [() => registered.flush?.()];
    for (const step of steps) {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    }
  }
}

/** Drains in-flight dispatches, collecting (not throwing) a failure. */
async function drainInto(
  ctx: ZudojsLoggerContext,
  failures: unknown[],
): Promise<void> {
  try {
    await ctx.drainDispatches();
  } catch (error) {
    failures.push(error);
  }
}

/**
 * Flushes all transport buffers.
 *
 * In-flight dispatches land in the transports before they are flushed.
 * Every transport is flushed even when a dispatch or another transport
 * failed; the failures are rethrown afterwards (several as one
 * AggregateError).
 */
export async function flushLogger(ctx: ZudojsLoggerContext): Promise<void> {
  ctx.assertActive();
  const failures: unknown[] = [];
  await drainInto(ctx, failures);
  await settleTransports(ctx, false, failures);
  throwCollectedFailures(failures, "Logger flush failed.");
}

/**
 * Closes all transports and marks logger as disposed.
 *
 * Closing is terminal: every transport is flushed and closed and the
 * logger is marked disposed even when a dispatch or a transport failed;
 * the failures are rethrown afterwards.
 */
export async function closeLogger(ctx: ZudojsLoggerContext): Promise<void> {
  if (ctx.isDisposed()) {
    return;
  }
  const failures: unknown[] = [];
  try {
    await drainInto(ctx, failures);
    await settleTransports(ctx, true, failures);
  } finally {
    ctx.markDisposed();
  }
  throwCollectedFailures(failures, "Logger close failed.");
}
