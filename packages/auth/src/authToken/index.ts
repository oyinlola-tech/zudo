/**
 * JWT token creation, verification, and refresh.
 *
 * @module authToken
 */

export {
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  type CreateTokenPairOptions,
} from "./authToken.core.js";
export {
  createMemoryTokenRevocationStore,
  assertAtomicRevocationStore,
  RACY_REVOCATION_WARNING_CODE,
} from "./authToken.revocation.js";
