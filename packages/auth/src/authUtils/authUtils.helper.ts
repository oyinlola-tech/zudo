/**
 * Auth utility helpers.
 *
 * @module authUtils
 */

import { randomBytes } from "node:crypto";

/**
 * Parse a Bearer token from an Authorization header.
 *
 * @param authorization - Raw Authorization header value
 * @returns The token string, or null if not a Bearer token
 */
export function parseBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;
  const parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1] ?? null;
}

/**
 * Parse cookie string into a key-value map.
 *
 * @param cookie - Raw Cookie header value
 * @returns Parsed cookies
 */
export function parseCookies(
  cookie: string | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookie) return result;
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key && rest.length > 0) {
      result[key.trim()] = rest.join("=").trim();
    }
  }
  return result;
}

/**
 * Check if a token is expired without verifying the signature.
 *
 * @param token - JWT token string
 * @returns Whether the token appears expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(
      Buffer.from(
        parts[1]!.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf-8"),
    );
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp !== "number" || payload.exp < now;
  } catch {
    return true;
  }
}

/**
 * Extract the user ID from a JWT payload without verifying.
 *
 * @param token - JWT token string
 * @returns User ID or null
 */
export function extractUserId(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(
        parts[1]!.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf-8"),
    );
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a CSRF token.
 *
 * @returns Random hex string for CSRF protection
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}
