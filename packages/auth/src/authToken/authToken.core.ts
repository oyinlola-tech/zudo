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
  TokenPayload,
  TokenVerificationResult,
} from "../authTypes/authToken.type.js";
import { sanitizeCustomClaims } from "../authUtils/authUtils.claims.js";
import {
  signToken,
  verifyToken,
  generateTokenId,
  assertTokenSecrets,
} from "./authToken.signing.js";

// TTLs are in seconds — they are added to Unix-second `iat`/`exp` claims.
const DEFAULT_ACCESS_TTL = 900; // 15 minutes
const DEFAULT_REFRESH_TTL = 604_800; // 7 days

/** Options for {@link createTokenPair}. */
export interface CreateTokenPairOptions {
  /** Roles to embed in both tokens. */
  readonly roles?: readonly string[];
  /**
   * Session to bind the pair to (`sid` claim). `createAuthService()` sets
   * this so that `logout()` invalidates the pair.
   */
  readonly sessionId?: SessionId;
  /**
   * Custom claims embedded in both tokens, e.g. `{ plan: "pro" }`.
   * Reserved names (`sub`, `iat`, `exp`, `nbf`, `typ`, `jti`, `sid`,
   * `roles`, `iss`, `aud`) are dropped, never overridden. Keep them small:
   * a token over 8 KB is rejected on verification.
   */
  readonly claims?: Readonly<Record<string, unknown>>;
}

/**
 * Create a new token pair (access + refresh).
 *
 * `iat`/`exp` come from `config.clock` when set (default: `Date.now`).
 *
 * @throws {AuthConfigurationError} when the signing secrets are missing,
 *   shorter than 32 bytes, or identical to each other.
 */
export function createTokenPair(
  userId: UserId,
  config: TokenConfig,
  options?: CreateTokenPairOptions,
): TokenPair {
  assertTokenSecrets(config);
  const accessTtl = config.accessTtl ?? DEFAULT_ACCESS_TTL;
  const refreshTtl = config.refreshTtl ?? DEFAULT_REFRESH_TTL;
  const nowMs = config.clock ? config.clock.now() : Date.now();
  const now = Math.floor(nowMs / 1000);
  const custom = sanitizeCustomClaims(options?.claims);

  const payload = (typ: "access" | "refresh", ttl: number): TokenPayload => ({
    ...custom,
    sub: userId,
    iat: now,
    exp: now + ttl,
    typ,
    jti: generateTokenId(),
    roles: options?.roles,
    ...(options?.sessionId ? { sid: options.sessionId } : {}),
    ...(config.issuer ? { iss: config.issuer } : {}),
    ...(config.audience ? { aud: config.audience } : {}),
  });

  return {
    accessToken: signToken(payload("access", accessTtl), config.accessSecret),
    refreshToken: signToken(
      payload("refresh", refreshTtl),
      config.refreshSecret,
    ),
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
 *
 * A session-bound refresh token (one with a `sid` claim) yields a pair bound
 * to the same session, so the new tokens still die with `logout()` /
 * `logoutAll()` when verified through `createAuthService()`. Earlier
 * versions dropped the `sid`, turning a logged-out session's refresh token
 * into a permanent, unbound token chain.
 */
export function refreshAccessToken(
  refreshToken: JwtToken,
  config: TokenConfig,
  options?: { readonly roles?: readonly string[] },
): TokenPair | null {
  const result = verifyRefreshToken(refreshToken, config);
  if (!result.valid || !result.payload) return null;

  const sid = result.payload.sid;
  return createTokenPair(result.payload.sub, config, {
    roles: options?.roles ?? result.payload.roles,
    ...(sid ? { sessionId: sid } : {}),
  });
}
