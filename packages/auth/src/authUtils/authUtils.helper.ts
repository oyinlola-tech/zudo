/**
 * Auth utility helpers.
 *
 * @module authUtils
 */

import { randomBytes } from "node:crypto";
import {
  decodeJsonSegment,
  splitToken,
} from "../authToken/authToken.encoding.js";

/**
 * Maximum accepted length of an `Authorization` header value.
 * Sized to comfortably hold `Bearer ` plus a maximum-length JWT.
 */
const MAX_AUTHORIZATION_LENGTH = 8256;

/** Maximum accepted length of a `Cookie` header value. */
const MAX_COOKIE_HEADER_LENGTH = 8192;

/** Maximum number of cookie pairs parsed from one header. */
const MAX_COOKIE_PAIRS = 100;

/**
 * `Bearer <token>` — the scheme is matched case-insensitively per RFC 7235
 * §2.1, and surrounding/extra whitespace is tolerated.
 */
const BEARER_PATTERN = /^\s*bearer[ \t]+(\S+)\s*$/i;

/**
 * Parse a Bearer token from an Authorization header.
 *
 * Accepts `unknown` on purpose: this sits on the HTTP trust boundary, where
 * a duplicated header gives `string[]` and adapter layers routinely pass
 * through values they have not narrowed. Anything that is not a plausible
 * header value is `null`, never a thrown `TypeError`.
 *
 * @param authorization - Raw Authorization header value
 * @returns The token string, or null if not a Bearer token
 */
export function parseBearerToken(authorization: unknown): string | null {
  if (typeof authorization !== "string") return null;
  if (authorization.length > MAX_AUTHORIZATION_LENGTH) return null;
  const match = BEARER_PATTERN.exec(authorization);
  return match?.[1] ?? null;
}

/**
 * Parse cookie string into a key-value map.
 *
 * The returned object has a `null` prototype, so a cookie named
 * `constructor`, `hasOwnProperty` or `__proto__` cannot shadow or confuse an
 * inherited member for the caller. Oversized headers and cookie counts are
 * capped rather than allocated.
 *
 * @param cookie - Raw Cookie header value (any type; see
 *   {@link parseBearerToken} for why)
 * @returns Parsed cookies — an object with no prototype
 */
export function parseCookies(cookie: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (typeof cookie !== "string") return result;
  if (cookie.length === 0 || cookie.length > MAX_COOKIE_HEADER_LENGTH) {
    return result;
  }
  let pairs = 0;
  for (const part of cookie.split(";")) {
    if (pairs >= MAX_COOKIE_PAIRS) break;
    const [key, ...rest] = part.trim().split("=");
    if (key && rest.length > 0) {
      result[key.trim()] = rest.join("=").trim();
      pairs++;
    }
  }
  return result;
}

/**
 * Check if a token is expired **without verifying the signature**.
 *
 * The payload is attacker-controlled: treat the answer as a hint (e.g. "should
 * I refresh before calling?"), never as an authorization decision.
 *
 * @param token - JWT token string
 * @returns Whether the token appears expired. Unparseable, oversized, or
 *   malformed input is reported as expired.
 */
export function isTokenExpired(token: unknown): boolean {
  const parts = splitToken(token);
  if (!parts) return true;
  const payload = decodeJsonSegment(parts[1]);
  if (!payload) return true;
  const exp = payload["exp"];
  const now = Math.floor(Date.now() / 1000);
  return typeof exp !== "number" || !Number.isFinite(exp) || exp < now;
}

/**
 * Extract the user ID from a JWT payload **without verifying the signature**.
 *
 * The returned value is attacker-controlled. It is safe to use as a
 * diagnostic hint; it must never be used to decide who the caller is, or as
 * a key in anything security-relevant, without verifying the token first.
 *
 * @param token - JWT token string
 * @returns The `sub` claim when it is a non-empty string, otherwise null.
 *   A `sub` that is a number, object, or array is reported as null rather
 *   than leaking a non-string through a `string | null` signature.
 */
export function extractUserId(token: unknown): string | null {
  const parts = splitToken(token);
  if (!parts) return null;
  const payload = decodeJsonSegment(parts[1]);
  if (!payload) return null;
  const sub = payload["sub"];
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

/**
 * Generate a CSRF token.
 *
 * @returns Random hex string for CSRF protection
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}
