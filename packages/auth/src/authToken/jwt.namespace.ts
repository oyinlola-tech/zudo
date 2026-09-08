/**
 * @zudojs/auth — JWT Namespace
 *
 * Convenience namespace for the JWT primitives: minting, verification, the
 * non-rotating refresh helper, the in-memory revocation store, and the
 * unverified header/claim parsers.
 *
 * Note what is *not* here: `createAuthService()`. `jwt.refreshAccessToken`
 * performs no rotation and consults no revocation store — pair it with
 * `jwt.createMemoryTokenRevocationStore` yourself, or use
 * `createAuthService().refresh()`, which rotates, revokes, re-loads the user
 * and validates the session.
 */

import {
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
} from "./authToken.core.js";

import { createMemoryTokenRevocationStore } from "./authToken.revocation.js";

import {
  parseBearerToken,
  isTokenExpired,
  extractUserId,
} from "../authUtils/authUtils.helper.js";

export type {
  JwtToken,
  TokenPair,
  TokenConfig,
  TokenVerificationResult,
} from "../authTypes/authToken.type.js";

export const jwt = {
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  createMemoryTokenRevocationStore,
  parseBearerToken,
  isTokenExpired,
  extractUserId,
} as const;
