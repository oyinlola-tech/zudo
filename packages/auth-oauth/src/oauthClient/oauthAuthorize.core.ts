/**
 * Authorization-request construction.
 *
 * @module oauthClient/oauthAuthorize
 */

import { OAuthConfigurationError } from "../oauthErrors/index.js";
import {
  assertValidCodeVerifier,
  deriveCodeChallenge,
  generateCodeVerifier,
} from "../oauthSecurity/index.js";
import type {
  AuthorizationUrlOptions,
  AuthorizationUrlResult,
  OAuthConfig,
} from "../oauthTypes/index.js";
import {
  assertRedirectUriAllowed,
  assertScopes,
  resolveAuthorizeUrl,
  resolveConfig,
} from "./oauthConfig.resolve.js";

/** Parameters the caller may not override through `additionalParams`. */
const RESERVED_PARAMS: ReadonlySet<string> = new Set([
  "response_type",
  "client_id",
  "client_secret",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
]);

/**
 * Build the authorization-request URL for the authorization-code flow.
 *
 * Always emits `response_type=code`, a mandatory `state`, and PKCE with
 * `code_challenge_method=S256`. There is no way to turn PKCE off and no
 * `plain` fallback.
 *
 * The returned `codeVerifier` and `state` must be stored server-side against
 * the user's session — the verifier is a secret and must never be sent to the
 * browser in a readable form.
 *
 * @example
 * ```ts
 * const state = generateState();
 * const { url, codeVerifier } = createAuthorizationUrl(config, {
 *   state,
 *   redirectUri: "https://app.example.com/auth/callback",
 * });
 * req.session.oauth = { state, codeVerifier };
 * res.redirect(url);
 * ```
 *
 * @throws {OAuthConfigurationError} If `state` is missing or the config is bad.
 * @throws {OAuthRedirectUriError} If `redirectUri` is not allowlisted.
 * @throws {OAuthEndpointNotAllowedError} If `authorizeUrl` fails the URL guard.
 */
export function createAuthorizationUrl(
  config: OAuthConfig,
  options: AuthorizationUrlOptions,
): AuthorizationUrlResult {
  const resolved = resolveConfig(config);

  if (typeof options.state !== "string" || options.state.trim().length === 0) {
    throw new OAuthConfigurationError(
      "state is required: an authorization request without CSRF state is not supported.",
    );
  }
  if (options.state.length < 16) {
    throw new OAuthConfigurationError(
      "state must be at least 16 characters of unguessable randomness.",
    );
  }

  const redirectUri = assertRedirectUriAllowed(resolved, options.redirectUri);
  const url = resolveAuthorizeUrl(resolved);

  const codeVerifier = options.codeVerifier ?? generateCodeVerifier();
  assertValidCodeVerifier(codeVerifier);
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  let scopes: readonly string[] = resolved.scopes;
  if (options.scopes !== undefined && options.scopes.length > 0) {
    assertScopes(options.scopes);
    scopes = options.scopes;
  }

  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(resolved.preset.authorizeParams ?? {})) {
    params.set(key, value);
  }
  for (const [key, value] of Object.entries(options.additionalParams ?? {})) {
    if (RESERVED_PARAMS.has(key)) {
      throw new OAuthConfigurationError(
        `additionalParams may not override the reserved parameter "${key}".`,
      );
    }
    if (typeof value !== "string") {
      throw new OAuthConfigurationError("additionalParams values must be strings.");
    }
    params.set(key, value);
  }

  params.set("response_type", "code");
  params.set("client_id", resolved.clientId);
  params.set("redirect_uri", redirectUri);
  if (scopes.length > 0) params.set("scope", scopes.join(" "));
  params.set("state", options.state);
  params.set("code_challenge", codeChallenge);
  params.set("code_challenge_method", "S256");
  if (options.nonce !== undefined) params.set("nonce", options.nonce);

  url.search = params.toString();

  return {
    url: url.toString(),
    state: options.state,
    codeVerifier,
    codeChallenge,
  };
}
