import { timingSafeEqual } from "../compare/compare.helper.js";

import type { CryptoEncoding } from "./cryptoEncoding.core.js";

import { decode } from "./cryptoEncoding.core.js";

/**
 * Compares two encoded values using constant-time comparison.
 *
 * Both values must use the same encoding. Returns false (rather than
 * throwing) when either value is not a valid, canonical encoding, so
 * malleable encodings of the same bytes never compare equal to each other
 * through a non-canonical form.
 */
export function timingSafeEqualEncoded(
  left: string,
  right: string,
  encoding: CryptoEncoding = "base64url",
): boolean {
  let leftBytes: Uint8Array;
  let rightBytes: Uint8Array;

  try {
    leftBytes = decode(left, encoding);
    rightBytes = decode(right, encoding);
  } catch {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
