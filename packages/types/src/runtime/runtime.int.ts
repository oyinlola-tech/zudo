/**
 * @zudojs/types/runtime — uniform integer sampling.
 *
 * Shared by the secure generator and the seeded test generator, so both
 * accept the same bounds and both are uniform.
 */

import { randomFillSync } from "node:crypto";

/** Largest bound `int(max)` accepts: every result must be a safe integer. */
export const MAX_RANDOM_INT_BOUND = Number.MAX_SAFE_INTEGER;

const WORD = 2 ** 32;
const HIGH_BITS = 2 ** 21;

/** Produces uniformly distributed unsigned 32-bit words. */
export type WordSource = () => number;

/**
 * Validates an `int(max)` bound.
 *
 * @throws RangeError when `max` is not an integer in `[1, 2**53 - 1]`.
 */
export function assertIntBound(max: number, owner: string): void {
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new RangeError(
      `${owner}.int(max) requires a positive integer max no larger than ${MAX_RANDOM_INT_BOUND}`,
    );
  }
}

/**
 * Returns a uniformly random integer in `[0, max)` by rejection sampling.
 *
 * Bounds up to `2**32` draw one 32-bit word; larger bounds draw 53 bits from
 * two words. The accept limit is the largest multiple of `max` inside the
 * sampled range, which is never zero, so the loop terminates with
 * probability 1 and in practice within a couple of draws.
 *
 * @param max - Exclusive upper bound, validated by {@link assertIntBound}.
 * @param nextWord - Source of uniform unsigned 32-bit words.
 */
export function sampleInt(max: number, nextWord: WordSource): number {
  const range = max <= WORD ? WORD : WORD * HIGH_BITS;
  const limit = range - (range % max);
  for (;;) {
    const low = nextWord();
    const draw =
      range === WORD ? low : (nextWord() % HIGH_BITS) * WORD + low;
    if (draw < limit) return draw % max;
  }
}

const cryptoBuffer = new Uint32Array(1);

/** Returns one cryptographically secure unsigned 32-bit word. */
export function cryptoWord(): number {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(cryptoBuffer);
  } else {
    randomFillSync(cryptoBuffer);
  }
  return cryptoBuffer[0]!;
}
