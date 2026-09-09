/**
 * Security primitives: PKCE, state, URL guards, defensive JSON parsing.
 *
 * @module oauthSecurity
 */

export {
  generateCodeVerifier,
  assertValidCodeVerifier,
  deriveCodeChallenge,
} from "./oauthPkce.core.js";
export { generateState, verifyState } from "./oauthState.core.js";
export {
  isBlockedFetchHost,
  assertSafeUrl,
  type UrlUse,
} from "./oauthUrl.guard.js";
export {
  sanitizeJsonValue,
  parseJsonObject,
  parseJsonValue,
} from "./oauthJson.sanitize.js";
