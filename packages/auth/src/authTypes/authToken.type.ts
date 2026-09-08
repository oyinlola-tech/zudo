/**
 * JWT token types and interfaces.
 *
 * @module authToken/authToken
 */

import type { UserId } from "../authTypes/authUser.type.js";
import type { SessionId, TokenId } from "@zudojs/constants";

/** JWT token string. */
export type JwtToken = string;

/** Token identifier. Re-exported from @zudojs/constants for type safety. */
export type { TokenId } from "@zudojs/constants";

/**
 * Token payload embedded in JWT.
 */
export interface TokenPayload {
  /** Subject (user ID) */
  readonly sub: UserId;
  /** Issued-at timestamp */
  readonly iat: number;
  /** Expiration timestamp */
  readonly exp: number;
  /** Token type: access or refresh */
  readonly typ: "access" | "refresh";
  /** Token ID for revocation */
  readonly jti: TokenId;
  /** User roles */
  readonly roles?: readonly string[];
  /**
   * Session ID this token was issued against.
   *
   * Set by `createAuthService().login()`. `verifyToken()` and `refresh()`
   * require the referenced session to still exist, which is what makes
   * `logout()` actually invalidate outstanding tokens.
   */
  readonly sid?: SessionId;
  /** Custom claims */
  readonly [key: string]: unknown;
}

/**
 * Token pair returned after authentication.
 */
export interface TokenPair {
  /** Short-lived access token */
  readonly accessToken: JwtToken;
  /** Long-lived refresh token */
  readonly refreshToken: JwtToken;
  /** Access token expiration in seconds */
  readonly expiresIn: number;
  /** Token type (always "Bearer") */
  readonly tokenType: "Bearer";
}

/**
 * Configuration for token generation.
 */
export interface TokenConfig {
  /** Secret key for signing (access tokens) */
  readonly accessSecret: string;
  /** Secret key for signing (refresh tokens) */
  readonly refreshSecret: string;
  /** Access token TTL in seconds (default: 900 = 15 min) */
  readonly accessTtl?: number;
  /** Refresh token TTL in seconds (default: 604800 = 7 days) */
  readonly refreshTtl?: number;
  /** JWT issuer */
  readonly issuer?: string;
  /** JWT audience */
  readonly audience?: string;
  /**
   * Clock-skew tolerance in seconds applied to `exp`, `iat` and `nbf`
   * (default: 0, maximum: 300).
   */
  readonly clockToleranceSeconds?: number;
}

/**
 * Store for revoked token IDs (`jti` claims).
 *
 * Backs refresh-token rotation and explicit revocation. The in-memory
 * implementation is good for development; production should use Redis
 * or a database with the same interface.
 */
export interface TokenRevocationStore {
  /**
   * Mark a token ID as revoked.
   *
   * @param tokenId - The token's `jti` claim
   * @param expiresAt - The token's `exp` claim (Unix seconds); entries
   *   may be discarded after this time since the token is then invalid anyway.
   */
  revoke(tokenId: TokenId, expiresAt: number): Promise<void>;
  /** Check whether a token ID has been revoked. */
  isRevoked(tokenId: TokenId): Promise<boolean>;
  /**
   * Atomically revoke a token ID **only if it was not already revoked**,
   * returning whether this caller was the one that revoked it.
   *
   * This is the compare-and-set that makes refresh-token rotation safe: a
   * separate `isRevoked()` then `revoke()` leaves two `await` points during
   * which a concurrent replay of the same token also observes "not revoked"
   * and also mints a valid pair. Implement it with a single synchronous
   * `Map.has`/`set` in-process, or `SET NX` in Redis.
   *
   * Optional for backwards compatibility: `createAuthService().refresh()`
   * falls back to `isRevoked()` + `revoke()` when it is absent, which is
   * racy. Implement it in any store used in production.
   */
  revokeIfNotRevoked?(tokenId: TokenId, expiresAt: number): Promise<boolean>;
}

/**
 * Result of token verification.
 */
export interface TokenVerificationResult {
  /** Whether the token is valid */
  readonly valid: boolean;
  /** Decoded payload (if valid) */
  readonly payload?: TokenPayload;
  /** Error message (if invalid) */
  readonly error?: string;
}
