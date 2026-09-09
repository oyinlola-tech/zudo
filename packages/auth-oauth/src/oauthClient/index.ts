/**
 * The OAuth2 authorization-code client.
 *
 * @module oauthClient
 */

export {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  MIN_MAX_RESPONSE_BYTES,
  MAX_MAX_RESPONSE_BYTES,
  type ResolvedOAuthConfig,
  resolveConfig,
  resolveAuthorizeUrl,
  resolveTokenUrl,
  resolveUserInfoUrl,
  assertRedirectUriAllowed,
} from "./oauthConfig.resolve.js";
export { createAuthorizationUrl } from "./oauthAuthorize.core.js";
export {
  parseTokenResponse,
  exchangeCodeForToken,
  refreshAccessToken,
} from "./oauthToken.core.js";
export { fetchUserInfo } from "./oauthUserInfo.core.js";
