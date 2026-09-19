/**
 * @zudojs/types/runtime
 *
 * Injectable runtime primitives — Clock and Random — that let packages
 * avoid direct `Date.now()` and `Math.random()` calls. Tests can substitute
 * deterministic implementations.
 */

import { randomUUID } from "node:crypto";

import { assertIntBound, cryptoWord, sampleInt } from "./runtime.int.js";

/** Returns the current time in milliseconds since the Unix epoch. */
export interface Clock {
  now(): number;
}

/** Returns the current time in seconds since the Unix epoch. */
export interface ClockSeconds {
  nowSeconds(): number;
}

/**
 * Brand marking an implementation as cryptographically secure.
 *
 * Structural typing alone would let any object with the right method names
 * satisfy `Random`, including a seeded test generator. The brand makes the
 * claim explicit: an implementor opts in through {@link defineSecureRandom}.
 */
declare const SecureRandomBrand: unique symbol;

/**
 * Returns cryptographically-secure random values.
 *
 * Implementations of this interface are safe for tokens, identifiers and
 * secrets. A deterministic generator must implement {@link PseudoRandom}
 * instead, so a test double cannot be injected where unpredictability is the
 * requirement.
 */
export interface Random {
  /** @internal Marks the implementation as unpredictable. */
  readonly [SecureRandomBrand]: true;
  /** Returns a random UUID v4 string. */
  uuid(): string;
  /**
   * Returns a uniformly random integer in [0, max).
   *
   * @throws RangeError unless `max` is a safe integer of at least 1.
   */
  int(max: number): number;
  /** Returns a random string of the given length (alphanumeric). */
  string(length: number): string;
  /** Returns a random string of the given length from the given alphabet. */
  custom(length: number, alphabet: string): string;
}

/**
 * A reproducible generator for tests.
 *
 * Structurally identical to {@link Random} but nominally distinct, so it
 * cannot be passed where a `Random` is required.
 */
export interface PseudoRandom {
  /** Marks this as a deterministic generator, not a secure one. */
  readonly deterministic: true;
  uuid(): string;
  int(max: number): number;
  string(length: number): string;
  custom(length: number, alphabet: string): string;
}

/** Default Clock implementation backed by `Date.now()`. */
export const systemClock: Clock = {
  now: (): number => Date.now(),
};

/** Default ClockSeconds implementation backed by `Math.floor(Date.now() / 1000)`. */
export const systemClockSeconds: ClockSeconds = {
  nowSeconds: (): number => Math.floor(Date.now() / 1000),
};

const ALPHANUMERIC =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Returns a v4 UUID, preferring the Web Crypto implementation. */
function cryptoUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return randomUUID();
}

/**
 * Returns a uniformly random integer in [0, max).
 *
 * Rejection sampling, not `% max`: a modulo of a uniform draw is only uniform
 * when `max` divides the range. Bounds above `2**32` draw 53 bits, so every
 * safe-integer bound terminates; anything else is a `RangeError`.
 */
function cryptoInt(max: number): number {
  assertIntBound(max, "Random");
  return sampleInt(max, cryptoWord);
}

/** Builds a random string over an alphabet. */
function randomString(
  length: number,
  alphabet: string,
  nextInt: (max: number) => number,
): string {
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
    out += alphabet.charAt(nextInt(alphabet.length));
  }
  return out;
}

/**
 * Declare an implementation cryptographically secure.
 *
 * Call this only for a generator whose output is genuinely unpredictable —
 * one backed by `node:crypto`, Web Crypto, or a hardware source. It is the
 * single supported way to produce a {@link Random}.
 *
 * @param implementation - The generator's operations.
 * @returns The implementation, branded as secure.
 */
export function defineSecureRandom(
  implementation: Omit<Random, typeof SecureRandomBrand>,
): Random {
  return implementation as Random;
}

/** Default Random implementation backed by `node:crypto`. */
export const systemRandom: Random = defineSecureRandom({
  uuid: (): string => cryptoUUID(),
  int: (max: number): number => cryptoInt(max),
  string: (length: number): string =>
    randomString(length, ALPHANUMERIC, cryptoInt),
  custom: (length: number, alphabet: string): string =>
    randomString(length, alphabet, cryptoInt),
});

/** Deterministic Clock useful for tests. */
export class FixedClock implements Clock {
  private current: number;
  constructor(initial: number = 0) {
    this.current = initial;
  }
  now(): number {
    return this.current;
  }
  set(time: number): void {
    this.current = time;
  }
  advance(deltaMs: number): void {
    this.current += deltaMs;
  }
}
