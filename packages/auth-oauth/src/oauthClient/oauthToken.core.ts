/**
 * Token exchange, token-response validation, and refresh.
 *
 * @module oauthClient/oauthToken
 */

import {
  OAuthConfigurationError,
  OAuthResponseError,
} from "../oauthErrors/index.js";
import { assertValidCodeVerifier } from "../oauthSecurity/index.js";
import type {
  CodeExchangeOptions,
  OAuthConfig,
  OAuthTokenSet,
} from "../oauthTypes/index.js";
import {
  assertRedirectUriAllowed,
  resolveConfig,
  resolveTokenUrl,
  type ResolvedOAuthConfig,
} from "./oauthConfig.resolve.js";
import { basicAuthHeader, requestProviderJson } from "./oauthHttp.core.js";

/** Coerce a provider `expires_in` to seconds, or reject it. */
function readExpiresIn(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new OAuthResponseError(
        "The token endpoint returned a non-numeric expires_in.",
      );
    }
    return value;
  }
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) {
    return Number(value);
  }
  throw new OAuthResponseError(
    "The token endpoint returned a non-numeric expires_in.",
  );
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new OAuthResponseError(
      `The token endpoint returned a malformed ${key}.`,
    );
  }
  return value;
}

/**
 * Validate a token-endpoint payload into an {@link OAuthTokenSet}.
 *
 * Rejects: a non-object body (caught earlier by the JSON parser), a missing,
 * non-string or blank `access_token`, a non-numeric `expires_in`, and a
 * non-string `refresh_token` / `id_token` / `scope`. Prototype-polluting keys
 * were already stripped by {@link parseJsonObject}.
 *
 * Exported for the response-validation tests; also useful if you have a token
 * payload from elsewhere.
 *
 * @throws {OAuthResponseError} On any malformed field. The message never
 *   contains the payload.
 */
export function parseTokenResponse(
  payload: Record<string, unknown>,
): OAuthTokenSet {
  const accessToken = payload["access_token"];
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new OAuthResponseError(
      "The token endpoint returned no usable access_token.",
    );
  }
  const tokenTypeRaw = payload["token_type"];
  if (tokenTypeRaw !== undefined && typeof tokenTypeRaw !== "string") {
    throw new OAuthResponseError(
      "The token endpoint returned a malformed token_type.",
    );
  }
  const expiresIn = readExpiresIn(payload["expires_in"]);
  const refreshToken = optionalString(payload, "refresh_token");
  const idToken = optionalString(payload, "id_token");
  const scopeRaw = payload["scope"];
  let scope: readonly string[] | undefined;
  if (scopeRaw !== undefined && scopeRaw !== null) {
    if (typeof scopeRaw !== "string") {
      throw new OAuthResponseError(
        "The token endpoint returned a malformed scope.",
      );
    }
    const parts = scopeRaw.split(/[\s,]+/).filter((part) => part.length > 0);
    if (parts.length > 0) scope = parts;
  }

  return {
    accessToken,
    tokenType:
      tokenTypeRaw !== undefined && tokenTypeRaw.length > 0
        ? tokenTypeRaw
        : "Bearer",
    ...(expiresIn !== undefined ? { expiresIn } : {}),
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(idToken !== undefined ? { idToken } : {}),
    raw: payload,
  };
}

/** Build the token-request body and headers for the configured client auth. */
function tokenRequestParts(
  resolved: ResolvedOAuthConfig,
  form: URLSearchParams,
): { readonly headers: Record<string, string>; readonly body: string } {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (resolved.clientAuth === "basic") {
    headers["Authorization"] = basicAuthHeader(
      resolved.clientId,
      resolved.clientSecret,
    );
    form.set("client_id", resolved.clientId);
  } else {
    form.set("client_id", resolved.clientId);
    form.set("client_secret", resolved.clientSecret);
  }
  return { headers, body: form.toString() };
}

/**
 * Exchange an authorization code for tokens.
 *
 * POSTs `application/x-www-form-urlencoded` with
 * `grant_type=authorization_code`, the `code`, the allowlisted `redirect_uri`
 * and the PKCE `code_verifier`. The client secret travels either in the
 * `Authorization: Basic` header or in the body, whichever the provider
 * expects — never in the URL, where it would land in access logs.
 *
 * @throws {OAuthRedirectUriError} If `redirectUri` is not allowlisted.
 * @throws {OAuthProviderError} If the provider rejects the exchange.
 * @throws {OAuthResponseError} If the token payload is malformed.
 * @throws {OAuthNetworkError} On timeout or transport failure.
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  options: CodeExchangeOptions,
): Promise<OAuthTokenSet> {
  const resolved = resolveConfig(config);
  if (typeof options.code !== "string" || options.code.trim().length === 0) {
    throw new OAuthConfigurationError("An authorization code is required.");
  }
  assertValidCodeVerifier(options.codeVerifier);
  const redirectUri = assertRedirectUriAllowed(resolved, options.redirectUri);
  const url = resolveTokenUrl(resolved);

  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", options.code);
  form.set("redirect_uri", redirectUri);
  form.set("code_verifier", options.codeVerifier);
  const { headers, body } = tokenRequestParts(resolved, form);

  const payload = await requestProviderJson(resolved, {
    url,
    method: "POST",
    headers,
    body,
    label: "token",
  });
  return parseTokenResponse(payload);
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Refused for providers that do not issue refresh tokens on this flow —
 * classic GitHub OAuth App tokens do not expire and GitHub issues none, so
 * calling this for `github` throws rather than making a pointless request.
 *
 * Note that most providers do not return a new `refresh_token`; keep using
 * the old one unless the response carries a replacement.
 *
 * @throws {OAuthConfigurationError} If the provider has no refresh support.
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const resolved = resolveConfig(config);
  if (!resolved.preset.supportsRefresh) {
    throw new OAuthConfigurationError(
      "This provider does not issue refresh tokens for the authorization-code flow.",
    );
  }
  if (typeof refreshToken !== "string" || refreshToken.trim().length === 0) {
    throw new OAuthConfigurationError("A refresh token is required.");
  }
  const url = resolveTokenUrl(resolved);

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  if (resolved.scopes.length > 0) form.set("scope", resolved.scopes.join(" "));
  const { headers, body } = tokenRequestParts(resolved, form);

  const payload = await requestProviderJson(resolved, {
    url,
    method: "POST",
    headers,
    body,
    label: "token",
  });
  return parseTokenResponse(payload);
}
