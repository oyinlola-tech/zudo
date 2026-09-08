/**
 * Deterministic test clock.
 *
 * Provides control over time in tests for testing JWT expiration,
 * sessions, cache TTL, queue retry delays, timeouts, and rate limits
 * without actually waiting.
 */

/**
 * A fake timer that can be advanced or set to a specific time.
 */
export interface TestClock {
  readonly now: Date;
  readonly timestamp: number;

  /**
   * Set the clock to a specific date.
   */
  set: (date: Date | string | number) => void;

  /**
   * Advance the clock by a given number of milliseconds.
   */
  advance: (ms: number) => void;

  /**
   * Move the clock forward by the given duration.
   */
  add: (duration: {
    seconds?: number;
    minutes?: number;
    hours?: number;
    days?: number;
  }) => void;

  /**
   * Reset the clock to the real current time.
   */
  reset: () => void;
}

/**
 * Creates a deterministic test clock.
 *
 * @param initialTime - Optional initial time. Defaults to current time.
 * @returns A TestClock instance.
 *
 * @example
 * ```ts
 * const clock = createTestClock();
 *
 * clock.set("2026-01-01T00:00:00Z");
 * expect(clock.now.toISOString()).toBe("2026-01-01T00:00:00.000Z");
 *
 * clock.advance(60_000);
 * expect(clock.now.toISOString()).toBe("2026-01-01T00:01:00.000Z");
 * ```
 */
export function createTestClock(
  initialTime?: Date | string | number,
): TestClock {
  /**
   * Resolve a caller-supplied instant.
   *
   * Tested against `undefined`, not truthiness: epoch 0 is the natural choice
   * for a deterministic test, and treating it as "not supplied" silently
   * handed back the real clock in the one place determinism was requested.
   */
  const toTimestamp = (value: Date | string | number): number => {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      throw new TypeError(
        `Invalid test clock time: ${JSON.stringify(value)} is not a valid date.`,
      );
    }
    return timestamp;
  };

  let currentTime =
    initialTime === undefined ? Date.now() : toTimestamp(initialTime);

  const now = (): Date => new Date(currentTime);

  const set = (date: Date | string | number): void => {
    currentTime = toTimestamp(date);
  };

  const advance = (ms: number): void => {
    if (!Number.isFinite(ms)) {
      throw new TypeError(`Cannot advance the clock by ${String(ms)}.`);
    }
    currentTime += ms;
  };

  const add = (duration: {
    seconds?: number;
    minutes?: number;
    hours?: number;
    days?: number;
  }): void => {
    const ms =
      (duration.seconds ?? 0) * 1000 +
      (duration.minutes ?? 0) * 60_000 +
      (duration.hours ?? 0) * 3_600_000 +
      (duration.days ?? 0) * 86_400_000;

    currentTime += ms;
  };

  const reset = (): void => {
    currentTime = Date.now();
  };

  return {
    get now(): Date {
      return now();
    },
    get timestamp(): number {
      return currentTime;
    },
    set,
    advance,
    add,
    reset,
  };
}
