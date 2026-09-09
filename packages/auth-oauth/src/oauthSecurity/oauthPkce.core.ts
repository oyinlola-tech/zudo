/**
 * PKCE (RFC 7636) verifier and challenge handling.
 *
 * @module oauthSecurity/oauthPkce
 *
 * PKCE is always on and always `S256`. The `plain` method is not implemented
 * and never will be: it offers no protection against an attacker who can read
 * the authorization request, which is the threat PKCE exists to address.
 */

import { createHash, randomBytes } from "node:crypto";

import { OAuthError, OAuthErrorCode } from "../oauthErrors/index.js";

/** RFC 7636 §4.1 — verifiers are 43-128 chars of the unreserved alphabet. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * Generate a cryptographically random PKCE `code_verifier`.
 *
 * 48 random bytes rendered as base64url give 64 characters drawn only from
 * the unreserved alphabet, with 384 bits of entropy and no modulo bias.
 *
 * @returns A verifier that satisfies {@link assertValidCodeVerifier}.
 */
export function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

/**
 * Throw unless `verifier` is a syntactically valid RFC 7636 code verifier.
 *
 * @throws {OAuthError} With code `OAUTH_PKCE_INVALID`. The verifier itself is
 *   a secret and never appears in the message.
 */
export function assertValidCodeVerifier(verifier: string): void {
  if (typeof verifier !== "string" || !VERIFIER_PATTERN.test(verifier)) {
    throw new OAuthError(
      "PKCE code verifier must be 43-128 characters from the unreserved alphabet.",
      { code: OAuthErrorCode.PKCE_INVALID, statusCode: 400, expose: false },
    );
  }
}

/**
 * Derive the `S256` code challenge: `base64url(SHA-256(ASCII(verifier)))`.
 *
 * @param verifier - A valid code verifier.
 * @returns The challenge to send as `code_challenge`.
 * @throws {OAuthError} If the verifier is malformed.
 */
export function deriveCodeChallenge(verifier: string): string {
  assertValidCodeVerifier(verifier);
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}
