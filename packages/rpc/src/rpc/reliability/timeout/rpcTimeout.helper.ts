/**
 * @zudojs/rpc/reliability/timeout
 *
 * Timeout utilities for RPC operations.
 */

import { RPCTimeoutError } from "../../errors/rpc.errors.js";

import { MAX_TIMER_DELAY } from "../../constants/rpcConstants.core.js";

/**
 * Creates a timeout promise that rejects after the given duration.
 *
 * The returned `cancel` clears the underlying timer, and every caller in
 * this package cancels it as soon as the guarded work settles. The timer
 * is deliberately *not* unref'd: it guards pending work, and in a script
 * with no other handle an unref'd deadline let Node exit (code 13,
 * "unsettled top-level await") before the timeout could reject.
 */
export function createTimeout(
  duration: number,
  procedureName?: string,
): { readonly promise: Promise<never>; cancel(): void } {
  const delay = Math.min(Math.max(0, duration), MAX_TIMER_DELAY);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RPCTimeoutError(duration, procedureName));
    }, delay);
  });

  return {
    promise,
    cancel(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/**
 * Wraps a promise with a timeout.
 *
 * The timer is always cleared once the race settles, whichever side won.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  duration: number,
  procedureName?: string,
): Promise<T> {
  const timeout = createTimeout(duration, procedureName);

  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    timeout.cancel();
  }
}

/**
 * Runs an operation under a timeout, aborting it when the timeout wins.
 *
 * Unlike {@link withTimeout}, this gives the operation a signal so it can
 * stop its own work rather than continuing unobserved.
 */
export async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  duration: number,
  procedureName?: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = createTimeout(duration, procedureName);

  const onParentAbort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(parentSignal?.reason);
    }
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  try {
    return await Promise.race([
      operation(controller.signal),
      timeout.promise.catch((error: unknown) => {
        if (!controller.signal.aborted) {
          controller.abort(error);
        }
        throw error;
      }),
    ]);
  } finally {
    timeout.cancel();
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
