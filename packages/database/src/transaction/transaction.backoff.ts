/**
 * @zudojs/database — Transaction retry backoff.
 *
 * `retryDelayMs * 2^(attempt-1)` passes 2^31-1 ms by attempt 26 at the
 * default 100 ms base. `setTimeout` then warns and fires after 1 ms, so a
 * large retry budget turned exponential backoff into a tight retry storm
 * against a database that was already contended. The delay is clamped to a
 * configurable ceiling and, below that, to the timer maximum.
 */

/** Largest delay `setTimeout` honours (2^31-1 ms, about 24.8 days). */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Default ceiling for a single retry delay: 30 seconds. */
export const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

/** Inputs to {@link computeRetryDelay}. */
export interface RetryDelayOptions {
  /** Base delay, doubled each retry. */
  readonly retryDelayMs: number;
  /** Ceiling for any single delay. */
  readonly maxRetryDelayMs?: number;
  /** `"full"` picks uniformly in `[0, delay]` to spread contending retries. */
  readonly jitter?: "none" | "full";
  /** Random source in `[0, 1)`, injectable for tests. */
  readonly random?: () => number;
}

/**
 * Delay before retry number `attempt` (1-based).
 *
 * @param attempt - The retry about to be made, starting at 1.
 * @param options - Base delay, ceiling and jitter.
 * @returns A finite delay in `[0, min(maxRetryDelayMs, 2^31-1)]`.
 */
export function computeRetryDelay(
  attempt: number,
  options: RetryDelayOptions,
): number {
  const ceiling = Math.min(
    Math.max(0, options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS),
    MAX_TIMER_DELAY_MS,
  );
  const exponential = options.retryDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Number.isFinite(exponential)
    ? Math.min(exponential, ceiling)
    : ceiling;

  if (options.jitter !== "full") return capped;
  const random = options.random ?? Math.random;
  return Math.floor(random() * (capped + 1));
}
