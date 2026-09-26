/**
 * Injectable Random interface for deterministic randomness in tests.
 *
 * @module runtime/random
 */

import {
  getRandomValues,
  randomBytes as cryptoRandomBytes,
  randomInt as cryptoRandomInt,
} from "node:crypto";

/**
 * Brand marking an implementation as cryptographically secure.
 *
 * Without it any object with the four method names would satisfy
 * {@link Random}, including the seeded {@link createMockRandom} generator,
 * so a predictable test double could be injected where tokens are minted.
 */
declare const SecureRandomBrand: unique symbol;

/**
 * The randomness operations shared by {@link Random} and {@link MockRandom}.
 *
 * @deprecated Use the `Random`/`PseudoRandom` pair from `@zudojs/types`.
 */
export interface RandomSource {
  /**
   * Returns a random float between 0 (inclusive) and 1 (exclusive).
   */
  random(): number;

  /**
   * Returns a random integer between min (inclusive) and max (inclusive).
   */
  randomInt(min: number, max: number): number;

  /**
   * Generates a random string of the specified length using alphanumeric characters.
   */
  randomString(length: number): string;

  /**
   * Generates random bytes.
   */
  randomBytes(length: number): Uint8Array;
}

/**
 * Cryptographically secure randomness, safe for tokens, session ids and
 * salts. Branded: only {@link systemRandom} (or an implementation cast
 * deliberately) satisfies it, and {@link MockRandom} never does.
 *
 * @deprecated Import `Random` from `@zudojs/types`, the owning package. The
 * two interfaces have different method sets; this one is kept only so
 * existing imports keep compiling and will be removed in the next major.
 */
export interface Random extends RandomSource {
  /** @internal Marks the implementation as unpredictable. */
  readonly [SecureRandomBrand]: true;
}

/**
 * A seeded, fully predictable generator for tests.
 *
 * @deprecated Use `SeededRandom` from `@zudojs/types`.
 *
 * Structurally distinct from {@link Random} (it lacks the security brand and
 * carries `deterministic: true`), so the compiler rejects it wherever a
 * secure generator is required.
 */
export interface MockRandom extends RandomSource {
  /** Marks this as a deterministic generator, not a secure one. */
  readonly deterministic: true;
}

/** Alphanumeric alphabet used by `randomString`. */
const RANDOM_STRING_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Scratch buffer for `systemRandom.random()` (two 32-bit words = 64 bits). */
const RANDOM_FLOAT_WORDS = new Uint32Array(2);

/**
 * Default random backed by `node:crypto` (CSPRNG).
 *
 * @deprecated Import `systemRandom` from `@zudojs/types`.
 *
 * Every method — including `random()` — draws from the platform CSPRNG, so
 * this singleton is safe to use for tokens, session IDs, salts, and other
 * security-sensitive values. `random()` builds a 53-bit float in `[0, 1)`
 * from 64 bits of `crypto.getRandomValues` output.
 */
export const systemRandom: Random = ({
  random: () => {
    getRandomValues(RANDOM_FLOAT_WORDS);
    // 21 high bits from word 0 and all 32 bits of word 1 = 53 bits of
    // precision, mapped onto [0, 1) exactly like a double mantissa.
    const high = RANDOM_FLOAT_WORDS[0]! >>> 11;
    const low = RANDOM_FLOAT_WORDS[1]!;
    return (high * 0x100000000 + low) / 0x20000000000000;
  },
  randomInt: (min, max) => cryptoRandomInt(min, max + 1),
  randomString: (length) => {
    let result = "";
    for (let i = 0; i < length; i++) {
      result +=
        RANDOM_STRING_CHARS[cryptoRandomInt(0, RANDOM_STRING_CHARS.length)]!;
    }
    return result;
  },
  randomBytes: (length) => new Uint8Array(cryptoRandomBytes(length)),
} satisfies RandomSource) as Random;

/**
 * Creates a mock random with a seeded sequence for deterministic testing.
 *
 * @deprecated Use `SeededRandom` from `@zudojs/types`.
 *
 * Uses a 32-bit linear congruential generator (Numerical Recipes constants)
 * with `Math.imul` for exact 32-bit arithmetic. Outputs are always in
 * `[0, 1)`. Not cryptographically secure — tests only.
 */
export function createMockRandom(seed: number = 1): MockRandom {
  let state = seed >>> 0;

  function next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  }

  return {
    deterministic: true,
    random: next,
    randomInt: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    randomString: (length) => {
      let result = "";
      for (let i = 0; i < length; i++) {
        result +=
          RANDOM_STRING_CHARS[Math.floor(next() * RANDOM_STRING_CHARS.length)]!;
      }
      return result;
    },
    randomBytes: (length) => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(next() * 256);
      }
      return bytes;
    },
  };
}
