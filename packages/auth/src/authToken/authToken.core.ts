/**
 * JWT token creation, verification, and refresh.
 *
 * @module authToken/authToken
 *
 * Pure Node.js implementation (no jsonwebtoken dependency).
 * Uses HMAC SHA-256 for signing.
 */

import type { UserId } from "@zudojs/constants";
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
} from "./authToken.signing.js";

// TTLs are in seconds — they are added to Unix-second `iat`/`exp` claims.
const DEFAULT_ACCESS_TTL = 900; // 15 minutes
const DEFAULT_REFRESH_TTL = 604_800; // 7 days

/**
 * Create a new token pair (access + refresh).
 */
export function createTokenPair(
  userId: UserId,
  config: TokenConfig,
  options?: { readonly roles?: readonly string[] },
): TokenPair {
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
 */
export function verifyAccessToken(
  token: JwtToken,
  config: TokenConfig,
): TokenVerificationResult {
  return verifyToken(token, config.accessSecret, "access", config);
}

/**
 * Verify and decode a refresh token.
 */
export function verifyRefreshToken(
  token: JwtToken,
  config: TokenConfig,
): TokenVerificationResult {
  return verifyToken(token, config.refreshSecret, "refresh", config);
}

/**
 * Refresh an access token using a valid refresh token.
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
