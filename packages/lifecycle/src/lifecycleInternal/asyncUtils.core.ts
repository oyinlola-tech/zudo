/**
 * @zudojs/lifecycle/internal/async-utils
 *
 * Async utilities for timeout, abort, and concurrency control.
 */

import { LifecycleTimeoutError } from "@zudojs/errors";

/**
 * Executes an async operation with a timeout.
 * Throws LifecycleTimeoutError if the timeout is exceeded.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  componentId: string,
  phase: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LifecycleTimeoutError(componentId, phase, timeoutMs));
    }, timeoutMs);

    // The timer must be cleared on EVERY exit path. A synchronously
    // throwing `fn` used to escape before `.catch` was attached,
    // leaving an armed timer that kept the event loop alive for the
    // whole timeout after the operation had already failed.
    let operation: Promise<T>;

    try {
      operation = fn();
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }

    operation.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Executes an async operation with abort signal support.
 */
export async function withAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw new Error("Operation aborted");
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error("Operation aborted"));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    // A synchronously throwing `fn` rejected via the Promise executor
    // but skipped both `.then` branches, so its abort listener was
    // never removed and accumulated on a long-lived signal.
    let operation: Promise<T>;

    try {
      operation = fn(signal);
    } catch (error) {
      signal.removeEventListener("abort", onAbort);
      reject(error);
      return;
    }

    operation
      .then((result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      })
      .catch((error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}

/**
 * Executes async operations with a concurrency limit.
 */
export async function withConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit =
    Number.isFinite(concurrency) && concurrency > 0
      ? Math.floor(concurrency)
      : 1;

  const executing = new Set<Promise<void>>();

  // Every scheduled task is settled before this function returns, and
  // the FIRST failure is rethrown afterwards. The previous version
  // removed a task from `executing` only on success, so one rejection
  // left a permanently-rejected promise in the race set, abandoned the
  // remaining items, and produced an unhandled rejection for every
  // task still in flight.
  const settled: Promise<void>[] = [];

  let firstError: unknown;
  let failed = false;

  // `entries()` yields the element typed as T, so no non-null
  // assertion is needed to satisfy noUncheckedIndexedAccess.
  for (const [index, item] of items.entries()) {
    const task = fn(item, index).catch((error: unknown) => {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    });

    const tracked = task.then(() => {
      executing.delete(tracked);
    });

    executing.add(tracked);
    settled.push(tracked);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(settled);

  if (failed) {
    throw firstError;
  }
}
