/**
 * @zudojs/rpc/reliability/retry
 *
 * Retry utilities for RPC operations.
 */

import { RPCCancelledError } from "../../errors/rpc.errors.js";

import { MAX_TIMER_DELAY } from "../../constants/rpcConstants.core.js";

/**
 * Retry backoff strategies.
 */
export type RPCBackoff = "fixed" | "linear" | "exponential";

/**
 * Randomisation applied to a computed retry delay.
 */
export type RPCJitter = "none" | "full" | "equal";

/**
 * Retry options.
 */
export interface RPCRetryOptions {
  readonly attempts: number;

  readonly delay: number;

  readonly maxDelay?: number;

  readonly backoff?: RPCBackoff;

  /**
   * Randomisation applied to each delay. Defaults to `"full"`, which
   * spreads retries over `[0, delay]`. Without jitter every client
   * retrying the same failed dependency retries at the same instant.
   */
  readonly jitter?: RPCJitter;

  readonly retryIf?: (error: unknown) => boolean;

  /** Aborts the retry sequence, including while waiting between tries. */
  readonly signal?: AbortSignal;

  /** Invoked before each delay, for logging and metrics. */
  readonly onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: RPCRetryOptions = Object.freeze({
  attempts: 1,
  delay: 0,
});

/**
 * Applies the configured jitter strategy to a delay.
 */
function applyJitter(delay: number, jitter: RPCJitter): number {
  if (delay <= 0) {
    return 0;
  }

  switch (jitter) {
    case "full":
      return Math.round(Math.random() * delay);
    case "equal":
      return Math.round(delay / 2 + Math.random() * (delay / 2));
    default:
      return delay;
  }
}

/**
 * Calculates the delay for a retry attempt.
 *
 * The result is finite, non-negative, and no greater than a timer can
 * represent. Jitter defaults to `"none"` here so the calculation stays
 * predictable for callers that compose it; {@link retry} opts into
 * `"full"` jitter by default.
 */
export function calculateRetryDelay(
  attempt: number,
  options: RPCRetryOptions,
): number {
  const backoff = options.backoff ?? "fixed";
  const maxDelay = options.maxDelay ?? 30_000;

  let delay = options.delay;

  if (backoff === "linear") {
    delay = options.delay * attempt;
  } else if (backoff === "exponential") {
    delay = options.delay * 2 ** Math.max(0, attempt - 1);
  }

  if (!Number.isFinite(delay) || delay < 0) {
    delay = 0;
  }

  const capped = Math.min(delay, maxDelay, MAX_TIMER_DELAY);

  return Math.min(
    applyJitter(capped, options.jitter ?? "none"),
    MAX_TIMER_DELAY,
  );
}

/**
 * Sleeps for a duration, rejecting early if the signal aborts.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    timer.unref?.();

    function onAbort(): void {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new RPCCancelledError("Retry cancelled."),
      );
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Retries an asynchronous operation.
 *
 * Jitter defaults to `"full"` so concurrent callers retrying the same
 * failing dependency do not synchronise into a retry wave.
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RPCRetryOptions,
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts));
  const jittered: RPCRetryOptions = {
    ...options,
    jitter: options.jitter ?? "full",
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new RPCCancelledError("Retry cancelled.");
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts - 1) {
        throw error;
      }

      if (options.retryIf && !options.retryIf(error)) {
        throw error;
      }

      const delay = calculateRetryDelay(attempt + 1, jittered);
      options.onRetry?.(error, attempt + 1, delay);

      await sleep(delay, options.signal);
    }
  }

  // Unreachable while `attempts >= 1`, but throwing the last observed
  // error beats inventing a new one if that ever changes.
  throw lastError ?? new Error("Retry loop exited without running.");
}
