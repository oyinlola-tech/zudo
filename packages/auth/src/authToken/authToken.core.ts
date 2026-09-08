/**
 * JWT token creation, verification, and refresh.
 *
 * @module authToken/authToken
 *
 * Pure Node.js implementation (no jsonwebtoken dependency).
 * Uses HMAC SHA-256 for signing.
 */

import type { SessionId, UserId } from "@zudojs/constants";
import type {
  JwtToken,
  TokenPair,
  TokenConfig,
  TokenVerificationResult,
} from "../authTypes/authToken.type.js";
import {
  signToken,
  verifyToken,
  generateTokenId,
  assertTokenSecrets,
} from "./authToken.signing.js";

// TTLs are in seconds — they are added to Unix-second `iat`/`exp` claims.
const DEFAULT_ACCESS_TTL = 900; // 15 minutes
const DEFAULT_REFRESH_TTL = 604_800; // 7 days

/**
 * Create a new token pair (access + refresh).
 *
 * @param options.roles - Roles to embed in both tokens.
 * @param options.sessionId - Session to bind the pair to (`sid` claim).
 *   `createAuthService()` sets this so that `logout()` invalidates the pair.
 * @throws {AuthConfigurationError} when the signing secrets are missing,
 *   shorter than 32 bytes, or identical to each other.
 */
export function createTokenPair(
  userId: UserId,
  config: TokenConfig,
  options?: {
    readonly roles?: readonly string[];
    readonly sessionId?: SessionId;
  },
): TokenPair {
  assertTokenSecrets(config);
  const accessTtl = config.accessTtl ?? DEFAULT_ACCESS_TTL;
  const refreshTtl = config.refreshTtl ?? DEFAULT_REFRESH_TTL;
  const now = Math.floor(Date.now() / 1000);

  const accessToken = signToken(
    {
      sub: userId,
      iat: now,
      exp: now + accessTtl,
      typ: "access",
      jti: generateTokenId(),
      roles: options?.roles,
      ...(options?.sessionId ? { sid: options.sessionId } : {}),
      ...(config.issuer ? { iss: config.issuer } : {}),
      ...(config.audience ? { aud: config.audience } : {}),
    },
    config.accessSecret,
  );

  const refreshToken = signToken(
    {
      sub: userId,
      iat: now,
      exp: now + refreshTtl,
      typ: "refresh",
      jti: generateTokenId(),
      roles: options?.roles,
      ...(options?.sessionId ? { sid: options.sessionId } : {}),
      ...(config.issuer ? { iss: config.issuer } : {}),
      ...(config.audience ? { aud: config.audience } : {}),
    },
    config.refreshSecret,
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: accessTtl,
    tokenType: "Bearer",
  };
}

/**
 * Verify and decode an access token.
 *
 * @throws {AuthConfigurationError} when the signing secrets are invalid.
 *   Malformed or untrusted *tokens* never throw — they come back as
 *   `{ valid: false, error }`.
 */
export function verifyAccessToken(
  token: JwtToken,
  config: TokenConfig,
): TokenVerificationResult {
  assertTokenSecrets(config);
  return verifyToken(token, config.accessSecret, "access", config);
}

/**
 * Verify and decode a refresh token.
 *
 * @throws {AuthConfigurationError} when the signing secrets are invalid.
 */
export function verifyRefreshToken(
  token: JwtToken,
  config: TokenConfig,
): TokenVerificationResult {
  assertTokenSecrets(config);
  return verifyToken(token, config.refreshSecret, "refresh", config);
}

/**
 * Refresh an access token using a valid refresh token.
 *
 * **This is the non-rotating, non-revoking variant.** It checks the refresh
 * token's signature, expiry and type and nothing else: it consults no
 * {@link TokenRevocationStore}, does not revoke the token it consumes, does
 * not re-load the user, and does not check the session. A stolen refresh
 * token therefore stays replayable for its full lifetime (7 days by
 * default) — and so does the token it was already exchanged for.
 *
 * Use `createAuthService().refresh()` instead for anything user-facing: it
 * rotates the refresh token atomically, revokes the used `jti`, re-loads the
 * user so deactivation and role changes take effect, and validates the
 * session. This function exists for callers who manage all of that
 * themselves.
 */
export function refreshAccessToken(
  refreshToken: JwtToken,
  config: TokenConfig,
  options?: { readonly roles?: readonly string[] },
): TokenPair | null {
  const result = verifyRefreshToken(refreshToken, config);
  if (!result.valid || !result.payload) return null;

  return createTokenPair(result.payload.sub, config, {
    roles: options?.roles ?? result.payload.roles,
  });
}
