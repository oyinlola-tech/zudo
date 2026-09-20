/**
 * @zudojs/adapters/adapter
 *
 * Retry support for adapter operations.
 *
 * `AdapterOperationOptions.retry` was part of the contract with nothing that
 * read it, so a caller asking for three attempts silently got one.
 */

import type { AdapterOperationOptions } from "../lifecycle/lifecycle.type.js";

/**
 * Total attempts requested, clamped to at least one.
 *
 * A missing, non-finite, fractional or non-positive `attempts` means a single
 * attempt: a retry policy nobody can express as "run fewer than once".
 */
export function retryAttempts(options: AdapterOperationOptions): number {
  const attempts = options.retry?.attempts;
  if (typeof attempts !== "number" || !Number.isFinite(attempts)) return 1;
  return Math.max(1, Math.floor(attempts));
}

/** Delay between attempts in milliseconds; negative and non-finite mean none. */
export function retryDelay(options: AdapterOperationOptions): number {
  const delay = options.retry?.delay;
  if (typeof delay !== "number" || !Number.isFinite(delay)) return 0;
  return Math.max(0, delay);
}

/** Waits `ms`, resolving early when `signal` aborts so a retry cannot outlive it. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    // A signal that aborted before the listener was attached never fires it.
    if (signal?.aborted === true) finish();
  });
}

/**
 * Runs `attempt` until `accept` approves its result or the attempt budget from
 * `options.retry` is spent, returning the last result either way.
 *
 * An aborted signal stops further attempts immediately — the caller has already
 * said it no longer wants the answer.
 *
 * @typeParam T - The attempt's result type.
 * @param attempt - The operation to run; it must not throw.
 * @param accept - Whether a result is final.
 * @param options - Operation options carrying the retry policy.
 * @returns The first accepted result, or the last one produced.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  accept: (result: T) => boolean,
  options: AdapterOperationOptions,
): Promise<T> {
  const attempts = retryAttempts(options);
  const delay = retryDelay(options);

  let result = await attempt();

  for (let remaining = attempts - 1; remaining > 0; remaining--) {
    if (accept(result)) return result;
    if (options.signal?.aborted === true) return result;
    if (delay > 0) await wait(delay, options.signal);
    if (options.signal?.aborted === true) return result;
    result = await attempt();
  }

  return result;
}
