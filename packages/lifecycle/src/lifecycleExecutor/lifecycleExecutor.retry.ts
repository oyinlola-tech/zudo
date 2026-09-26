/**
 * @zudojs/lifecycle/executor/retry
 *
 * Retry delay, cancellable sleep and priority batching for the executor.
 */

import type {
  LifecycleRegistration,
  LifecycleRetryOptions,
} from "../lifecycleComponent/lifecycleComponent.type.js";

/**
 * Calculates the delay before retry number `attempt + 1`.
 *
 * `attempt` is 0 for the first retry. Exponential backoff doubles the
 * base delay per retry and is capped at `maxDelay`; fixed backoff
 * always waits `delay`.
 */
export function calculateDelay(
  config: LifecycleRetryOptions,
  attempt: number,
): number {
  const base = config.delay ?? 500;
  const max = config.maxDelay ?? 10_000;
  const backoff = config.backoff ?? "exponential";

  if (backoff === "exponential") {
    return Math.min(base * 2 ** attempt, max);
  }
  return base;
}

/**
 * Sleeps for the given duration, waking early when the run is aborted.
 *
 * An unconditional timer would keep the process alive for a full retry
 * backoff after shutdown had already been requested.
 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Splits an already-ordered stage into runs of equal priority.
 *
 * Consecutive grouping preserves whatever order the execution plan
 * produced, so a caller that does not care about priority (every
 * component at the default 0) still gets a single fully concurrent
 * batch.
 */
export function groupByPriority(
  registrations: readonly LifecycleRegistration[],
): readonly (readonly LifecycleRegistration[])[] {
  const batches: LifecycleRegistration[][] = [];
  let current: LifecycleRegistration[] | undefined;
  let currentPriority: number | undefined;

  for (const reg of registrations) {
    if (current === undefined || reg.priority !== currentPriority) {
      current = [];
      currentPriority = reg.priority;
      batches.push(current);
    }
    current.push(reg);
  }

  return batches;
}
