import {
  timingSafeEqual,
  timingSafeEqualString,
} from "../compare/compare.helper.js";

/**
 * Compares two byte arrays in constant time.
 *
 * Different lengths return false immediately. Alias of `timingSafeEqual`.
 */
export function secureEqual(left: Uint8Array, right: Uint8Array): boolean {
  return timingSafeEqual(left, right);
}

/**
 * Performs a constant-time comparison of two strings.
 *
 * Alias of `timingSafeEqualString`.
 */
export function secureStringEqual(left: string, right: string): boolean {
  return timingSafeEqualString(left, right);
}
