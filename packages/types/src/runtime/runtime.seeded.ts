/**
 * @zudojs/types/runtime — deterministic generator for tests.
 */

import { assertIntBound, sampleInt } from "./runtime.int.js";
import type { PseudoRandom } from "./runtime.core.js";

const ALPHANUMERIC =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Deterministic generator useful for tests.
 *
 * Implements {@link PseudoRandom}, never `Random`: its output is fully
 * predictable from the seed, so injecting it where a secure generator is
 * expected would make every token guessable from a single observation.
 *
 * Backed by mulberry32, whose full 32-bit output is well distributed. The
 * previous linear congruential generator exposed its low bits directly, so
 * `uuid()` cycled after 16 values and `int(2)` alternated.
 */
export class SeededRandom implements PseudoRandom {
  readonly deterministic = true;
  private state: number;

  constructor(seed: number = 1) {
    this.state = seed >>> 0 || 1;
  }

  /** Returns a structurally valid v4 UUID derived from the seed. */
  uuid(): string {
    let hex = "";
    for (let i = 0; i < 4; i++) {
      hex += this.next().toString(16).padStart(8, "0");
    }
    const variant = "89ab".charAt(this.int(4));
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `4${hex.slice(13, 16)}`,
      `${variant}${hex.slice(17, 20)}`,
      hex.slice(20, 32),
    ].join("-");
  }

  /** Returns a uniformly distributed integer in `[0, max)`. */
  int(max: number): number {
    assertIntBound(max, "PseudoRandom");
    return sampleInt(max, () => this.next());
  }

  /** Returns an alphanumeric string of the given length. */
  string(length: number): string {
    return this.custom(length, ALPHANUMERIC);
  }

  /** Returns a string of the given length drawn from `alphabet`. */
  custom(length: number, alphabet: string): string {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(
        "Random.string(length) requires a non-negative integer",
      );
    }
    if (alphabet.length === 0) {
      throw new RangeError("alphabet must not be empty");
    }
    let out = "";
    for (let i = 0; i < length; i++) {
      out += alphabet.charAt(this.int(alphabet.length));
    }
    return out;
  }

  /** Advances the mulberry32 state and returns an unsigned 32-bit word. */
  private next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
}
