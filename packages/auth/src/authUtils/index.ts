/**
 * Auth utility helpers: token parsing, cookie parsing, CSRF, login
 * identifier normalization.
 *
 * @module authUtils
 */

export {
  parseBearerToken,
  parseCookies,
  isTokenExpired,
  extractUserId,
  generateCsrfToken,
} from "./authUtils.helper.js";
export { normalizeLoginIdentifier } from "./authUtils.identifier.js";

export {
  RESERVED_JWT_CLAIMS,
  sanitizeCustomClaims,
} from "./authUtils.claims.js";
