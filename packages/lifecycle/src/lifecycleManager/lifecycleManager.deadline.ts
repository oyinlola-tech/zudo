/**
 * @zudojs/lifecycle/manager/deadline
 *
 * Global shutdown deadline: races a phase against the remaining budget
 * and reports expiry instead of letting it pass silently.
 */

import type { LifecyclePhase } from "@zudojs/constants";
import { LifecycleTimeoutError } from "@zudojs/errors";
import { isBounded, toTimerDelay } from "../lifecycleInternal/index.js";
import type { ExecutionResult } from "../lifecycleExecutor/index.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";
import {
  emitComponentFailed,
  failComponent,
  recordResult,
} from "./lifecycleManager.context.js";

/**
 * Resolves when the phase finishes or the shutdown budget runs out.
 *
 * On expiry {@link expireShutdown} runs, so the deadline is never
 * silent, and the timer is always cleared so it can never hold the
 * event loop open. The abandoned phase promise never surfaces as an
 * unhandled rejection once the race has been decided.
 */
export async function raceDeadline(
  ctx: LifecycleManagerContext,
  phase: LifecyclePhase,
  work: Promise<void>,
  remainingMs: number,
): Promise<void> {
  // An unbounded budget (shutdownTimeout: Infinity) waits for the work.
  // Handing Infinity to setTimeout fired after 1 ms and abandoned every
  // stop()/dispose() while reporting the application DISPOSED.
  if (!isBounded(remainingMs)) {
    await work.catch(() => {});
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expireShutdown(ctx, phase);
      resolve();
    }, toTimerDelay(remainingMs));
  });

  try {
    await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }

  void work.catch(() => {});
}

/**
 * Records that the shutdown deadline has expired. Idempotent.
 *
 * The run's AbortController is aborted so in-flight hooks observing
 * `context.signal` unwind; every component whose hook was still
 * running is recorded as FAILED with a LifecycleTimeoutError (its
 * status used to stay STOPPING forever); and one
 * `application:shutdown-timeout` event is emitted. Shutdown itself
 * still resolves — a signal handler awaiting it must not crash the
 * process — and `LifecycleManager.shutdownTimedOut` reports the outcome.
 */
export function expireShutdown(
  ctx: LifecycleManagerContext,
  phase: LifecyclePhase,
): void {
  if (ctx.shutdownTimedOut) return;
  ctx.shutdownTimedOut = true;

  const error = new LifecycleTimeoutError(
    "application",
    phase,
    ctx.shutdownTimeout,
  );
  ctx.controller.abort(error);

  const now = Date.now();
  for (const [id, startedAt] of ctx.shutdownInFlight ?? []) {
    const result: ExecutionResult = {
      id,
      phase,
      duration: now - startedAt,
      success: false,
      timedOut: true,
      error: new LifecycleTimeoutError(id, phase, ctx.shutdownTimeout),
    };
    recordResult(ctx, result);
    failComponent(ctx, id);
    emitComponentFailed(ctx, result);
  }
  ctx.shutdownInFlight = undefined;

  ctx.events.emit("application:shutdown-timeout", {
    error,
    duration: now - ctx.startTime,
  });
}
