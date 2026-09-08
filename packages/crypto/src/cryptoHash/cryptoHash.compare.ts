import { timingSafeEqual } from "../compare/compare.helper.js";

/**
 * Performs a constant-time comparison of two digests.
 *
 * Alias of `timingSafeEqual` kept for API compatibility.
 */
export function equalDigests(left: Uint8Array, right: Uint8Array): boolean {
  return timingSafeEqual(left, right);
}
