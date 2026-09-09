/**
 * Anti-CSRF `state` generation and timing-safe verification.
 *
 * @module oauthSecurity/oauthState
 *
 * Without `state`, an attacker can complete their own authorization at your
 * provider and then feed the resulting `code` to a victim's callback, binding
 * the victim's session to the attacker's identity. `state` is mandatory here,
 * and the comparison is timing-safe so the value cannot be recovered a byte
 * at a time.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generate a random `state` value (256 bits, base64url).
 *
 * @returns A 43-character URL-safe string.
 */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compare the issued `state` with the one returned on the callback, without
 * leaking the answer through timing.
 *
 * Lengths are compared first (`timingSafeEqual` throws on unequal buffers);
 * a length difference is not secret, the contents are. Empty or non-string
 * inputs are always `false` — an absent `state` never passes.
 *
 * @param expected - The state you issued and stored.
 * @param received - The `state` query parameter from the callback.
 * @returns `true` only if both are non-empty strings with identical bytes.
 */
export function verifyState(expected: string, received: string): boolean {
  if (typeof expected !== "string" || typeof received !== "string") return false;
  if (expected.length === 0 || received.length === 0) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
