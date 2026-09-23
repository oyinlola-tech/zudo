/**
 * Abort-signal helpers.
 *
 * @module utils/utils.signal
 */

/**
 * Resolves or rejects with `work`, or rejects with `signal.reason` as soon
 * as `signal` aborts, whichever happens first.
 *
 * The abandoned `work` promise keeps running (JavaScript cannot cancel it);
 * its eventual rejection is observed so it never surfaces as an unhandled
 * rejection. Cooperative code should watch the same signal and stop.
 */
export function raceSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      work.catch(() => undefined);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
