import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

/**
 * Performs a constant-time comparison of two byte arrays.
 *
 * Returns false immediately if the lengths differ. This leaks only the
 * fact that the lengths differ, which is acceptable for fixed-size
 * values such as digests, MACs and tokens; do not rely on this function
 * to hide the length of variable-length secrets.
 *
 * The byte-wise comparison is delegated to `node:crypto.timingSafeEqual`.
 */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    throw new TypeError("timingSafeEqual arguments must be Uint8Array.");
  }

  if (left.byteLength !== right.byteLength) {
    return false;
  }

  if (left.byteLength === 0) {
    return true;
  }

  return nodeTimingSafeEqual(left, right);
}

/**
 * Performs a constant-time comparison of two strings by their UTF-8 bytes.
 */
export function timingSafeEqualString(left: string, right: string): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
