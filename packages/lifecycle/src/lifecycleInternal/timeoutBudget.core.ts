/**
 * @zudojs/lifecycle/internal/timeout-budget
 *
 * Validation and normalisation for millisecond budgets handed to timers.
 */

/** Largest delay `setTimeout` can represent (2^31 - 1 ms). */
export const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Validates a millisecond budget.
 *
 * `Infinity` is accepted and means "no bound". NaN, negative values and
 * non-numbers are rejected up front: `setTimeout` silently turns them
 * (and `Infinity`) into a 1 ms timer, and `LifecycleTimeoutError`'s
 * constructor then threw inside that timer callback, which crashed the
 * process instead of failing the component.
 *
 * @param name - Option name, used in the error message.
 * @param value - The budget to check.
 * @throws RangeError when the value is not a non-negative number.
 */
export function assertTimeoutBudget(name: string, value: unknown): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative number of milliseconds (Infinity for no bound), got ${String(value)}.`,
    );
  }
}

/**
 * Whether a validated budget actually bounds anything.
 */
export function isBounded(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Clamps a finite budget to what a timer can represent.
 */
export function toTimerDelay(value: number): number {
  return Math.min(Math.max(0, value), MAX_TIMER_DELAY);
}
