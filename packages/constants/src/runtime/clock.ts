/**
 * Injectable Clock interface for deterministic time in tests.
 *
 * @module runtime/clock
 */

/**
 * Provides deterministic time for testing.
 */
export interface Clock {
  /**
   * Returns current timestamp in milliseconds.
   */
  now(): number;

  /**
   * Returns current Date.
   *
   * Note: the capitalised method name is kept for backwards compatibility
   * (it mirrors the global `Date` constructor it wraps).
   */
  Date(): Date;
}

/**
 * A mock {@link Clock} whose time can be advanced or set explicitly.
 */
export interface MockClock extends Clock {
  /**
   * Advance the mock time by the given number of milliseconds.
   */
  advance(ms: number): void;

  /**
   * Set the mock time to an absolute point in time — either a timestamp in
   * milliseconds or a `Date`.
   */
  set(time: number | Date): void;
}

/**
 * Default clock using real system time.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
  Date: () => new Date(),
};

/**
 * Creates a mock clock with a controllable time.
 *
 * The clock starts at `fixedTime` and stays there until `advance(ms)` or
 * `set(time)` is called.
 */
export function createMockClock(fixedTime: number = 0): MockClock {
  let time = fixedTime;

  return {
    now: () => time,
    Date: () => new Date(time),
    advance: (ms) => {
      time += ms;
    },
    set: (newTime) => {
      time = typeof newTime === "number" ? newTime : newTime.getTime();
    },
  };
}
