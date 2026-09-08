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
 * Provides deterministic randomness for testing.
 */
export interface Random {
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

/** Alphanumeric alphabet used by `randomString`. */
const RANDOM_STRING_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Scratch buffer for `systemRandom.random()` (two 32-bit words = 64 bits). */
const RANDOM_FLOAT_WORDS = new Uint32Array(2);

/**
 * Default random backed by `node:crypto` (CSPRNG).
 *
 * Every method — including `random()` — draws from the platform CSPRNG, so
 * this singleton is safe to use for tokens, session IDs, salts, and other
 * security-sensitive values. `random()` builds a 53-bit float in `[0, 1)`
 * from 64 bits of `crypto.getRandomValues` output.
 */
export const systemRandom: Random = {
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
};

/**
 * Creates a mock random with a seeded sequence for deterministic testing.
 *
 * Uses a 32-bit linear congruential generator (Numerical Recipes constants)
 * with `Math.imul` for exact 32-bit arithmetic. Outputs are always in
 * `[0, 1)`. Not cryptographically secure — tests only.
 */
export function createMockRandom(seed: number = 1): Random {
  let state = seed >>> 0;

  function next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  }

  return {
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
