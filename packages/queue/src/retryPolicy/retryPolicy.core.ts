import { BackoffType } from "../jobTypes/jobTypes.type.js";

import type { BackoffOptions } from "../jobOptions/jobOptions.type.js";

/**
 * Largest delay Node's timer subsystem accepts.
 *
 * A `setTimeout` delay above this overflows a signed 32-bit integer; Node
 * warns and clamps it to `1`, turning a long backoff into an immediate
 * retry. Every computed delay is clamped to this ceiling instead.
 */
export const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Backoff applied to a retryable job that declares no backoff of its own.
 *
 * Without this a job configured with `attempts > 1` and no `backoff` would
 * retry with a zero delay, hammering whatever dependency just failed.
 */
export const DEFAULT_RETRY_BACKOFF: BackoffOptions = Object.freeze({
  type: BackoffType.EXPONENTIAL,
  delay: 1_000,
  maxDelay: 30_000,
  multiplier: 2,
  jitter: "full",
});

/**
 * Clamps a delay to the range a timer can actually represent.
 */
function clampDelay(delay: number): number {
  if (!Number.isFinite(delay) || delay < 0) {
    return 0;
  }

  return Math.min(delay, MAX_TIMER_DELAY);
}

/**
 * Applies the configured jitter strategy to a computed delay.
 *
 * `full` spreads retries uniformly across `[0, delay]`; `equal` keeps half
 * the delay fixed and randomises the other half. Both break up the
 * synchronised retry waves that a purely deterministic backoff produces
 * when many jobs fail against the same dependency at the same moment.
 */
export function applyJitter(
  delay: number,
  jitter: BackoffOptions["jitter"],
  random: () => number = Math.random,
): number {
  if (delay <= 0) {
    return 0;
  }

  switch (jitter) {
    case "full":
      return Math.round(random() * delay);
    case "equal":
      return Math.round(delay / 2 + random() * (delay / 2));
    default:
      return delay;
  }
}

/**
 * Calculates the delay for the next retry attempt.
 *
 * The result is always a finite, non-negative number no greater than
 * {@link MAX_TIMER_DELAY}. Jitter is applied only when the backoff opts
 * into it, so a backoff without `jitter` stays deterministic.
 */
export function calculateRetryDelay(
  attempt: number,
  backoff?: BackoffOptions,
): number {
  if (!backoff) {
    return 0;
  }

  const { type, delay, maxDelay, multiplier, jitter } = backoff;

  const base = (): number => {
    switch (type) {
      case BackoffType.FIXED:
        return delay;

      case BackoffType.EXPONENTIAL: {
        const multiplierValue = multiplier ?? 2;
        const exponent = Math.max(0, attempt - 1);
        const calculatedDelay = delay * Math.pow(multiplierValue, exponent);
        return maxDelay ? Math.min(calculatedDelay, maxDelay) : calculatedDelay;
      }

      default:
        return delay;
    }
  };

  return clampDelay(applyJitter(clampDelay(base()), jitter));
}

/**
 * Resolves the backoff to use for a job.
 *
 * Falls back to {@link DEFAULT_RETRY_BACKOFF} so that a retryable job
 * never retries with a zero delay.
 */
export function resolveBackoff(backoff?: BackoffOptions): BackoffOptions {
  return backoff ?? DEFAULT_RETRY_BACKOFF;
}

/**
 * Checks if a job should be retried based on its state.
 */
export function shouldRetry(attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts;
}

/**
 * Creates a backoff options object.
 */
export function createBackoffOptions(
  type: BackoffType,
  delay: number,
  options?: {
    maxDelay?: number;
    multiplier?: number;
    jitter?: BackoffOptions["jitter"];
  },
): BackoffOptions {
  return {
    type,
    delay,
    maxDelay: options?.maxDelay,
    multiplier: options?.multiplier,
    jitter: options?.jitter,
  };
}

/**
 * Creates a fixed backoff options.
 */
export function createFixedBackoff(
  delay: number,
  options?: { jitter?: BackoffOptions["jitter"] },
): BackoffOptions {
  return createBackoffOptions(BackoffType.FIXED, delay, options);
}

/**
 * Creates an exponential backoff options.
 */
export function createExponentialBackoff(
  delay: number,
  options?: {
    maxDelay?: number;
    multiplier?: number;
    jitter?: BackoffOptions["jitter"];
  },
): BackoffOptions {
  return createBackoffOptions(BackoffType.EXPONENTIAL, delay, options);
}
