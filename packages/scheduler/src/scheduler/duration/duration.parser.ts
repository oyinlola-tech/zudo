import { InvalidDurationError } from "../errors/scheduler.errors.js";

/**
 * Largest duration that can safely be added to "now" and still produce a valid
 * Date. Beyond this the result is an Invalid Date whose `getTime()` is `NaN`,
 * and every heap comparison against `NaN` is false — so the entry never sinks
 * and parks itself at the head of the queue, blocking everything behind it.
 */
const MAX_DURATION_MS = 100 * 365 * 24 * 60 * 60 * 1000; // ~100 years

/** Milliseconds per supported unit. */
const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Parses a human-readable duration string into milliseconds.
 *
 * Supported units: `ms`, `s`, `m`, `h`, `d`, `w`. Components may be combined
 * (`"1h30m"`), and each must be a non-negative integer. The total must be
 * greater than zero — a zero duration would schedule a job that fires
 * continuously — and within roughly a century.
 *
 * @example
 * parseDuration("5s")     // 5000
 * parseDuration("1h30m")  // 5400000
 * parseDuration("250ms")  // 250
 *
 * @param duration - The duration string.
 * @returns The duration in milliseconds.
 * @throws {InvalidDurationError} when the string is malformed or out of range.
 */
export function parseDuration(duration: string): number {
  const trimmed = duration.trim();

  if (trimmed.length === 0) {
    throw new InvalidDurationError(duration);
  }

  // Each component is digits followed by a unit. `ms` is matched before `m`.
  // Sticky, not global: a failed component ends the loop instead of rescanning
  // from the next offset, so a long digit run cannot be re-matched per offset.
  // (`g` alongside `y` was redundant — sticky already wins for `exec`.)
  const pattern = /(\d+)(ms|s|m|h|d|w)/y; // codeql[js/polynomial-redos]
  let total = 0;
  let matched = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(trimmed)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2] as keyof typeof UNIT_MS;

    if (!Number.isSafeInteger(amount)) {
      throw new InvalidDurationError(duration);
    }

    total += amount * UNIT_MS[unit];
    matched = pattern.lastIndex;

    if (total > MAX_DURATION_MS) {
      throw new InvalidDurationError(duration);
    }
  }

  // Anything left over means the string was not fully consumed.
  if (matched !== trimmed.length) {
    throw new InvalidDurationError(duration);
  }

  if (total <= 0) {
    throw new InvalidDurationError(duration);
  }

  return total;
}
