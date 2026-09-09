/**
 * User-info retrieval and normalisation.
 *
 * @module oauthClient/oauthUserInfo
 */

import { OAuthResponseError } from "../oauthErrors/index.js";
import { normalizeUserInfo } from "../oauthProviders/index.js";
import { assertSafeUrl } from "../oauthSecurity/index.js";
import type { OAuthConfig, OAuthUserInfo } from "../oauthTypes/index.js";
import {
  resolveConfig,
  resolveUserInfoUrl,
  type ResolvedOAuthConfig,
} from "./oauthConfig.resolve.js";
import {
  requestProviderJson,
  requestProviderValue,
} from "./oauthHttp.core.js";

/**
 * GitHub's `/user` omits `email` whenever the address is private — which is
 * the default for new accounts. When `user:email` was granted we ask
 * `/user/emails` for the primary, verified address; otherwise the profile
 * comes back without an email and the caller decides what to do. No address
 * is ever synthesised from the login name.
 */
async function fetchGithubPrimaryEmail(
  resolved: ResolvedOAuthConfig,
  userInfoUrl: URL,
  accessToken: string,
): Promise<{ email: string; verified: boolean } | undefined> {
  const emailsUrl = assertSafeUrl(
    new URL("/user/emails", userInfoUrl.origin).toString(),
    "userInfoUrl",
    "fetch",
  );
  let payload: unknown;
  try {
    payload = await requestProviderValue(resolved, {
      url: emailsUrl,
      method: "GET",
      headers: userInfoHeaders(resolved, accessToken),
      label: "user-info",
    });
  } catch {
    // The scope may not have been granted; that is not an auth failure.
    return undefined;
  }
  return readEmailArray(payload);
}

function readEmailArray(
  payload: unknown,
): { email: string; verified: boolean } | undefined {
  if (!Array.isArray(payload)) return undefined;
  for (const entry of payload) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const email = record["email"];
    if (typeof email !== "string" || email.length === 0) continue;
    if (record["primary"] === true && record["verified"] === true) {
      return { email, verified: true };
    }
  }
  return undefined;
}

function userInfoHeaders(
  resolved: ResolvedOAuthConfig,
  accessToken: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": "zudojs-auth-oauth",
    ...(resolved.preset.userInfoHeaders ?? {}),
  };
}

/**
 * Fetch and normalise the authenticated user's profile.
 *
 * The access token is sent as `Authorization: Bearer` — never as a query
 * parameter, where it would be captured by proxy and server logs.
 *
 * `email` is optional in the result on purpose: GitHub omits it for private
 * addresses (this function then tries `/user/emails`, which needs the
 * `user:email` scope) and Discord omits it without the `email` scope. If you
 * key accounts by email, check for its absence and tell the user to grant the
 * scope — do not fall back to a synthesised address.
 *
 * Apple has no user-info endpoint at all; for `apple` this throws an
 * `OAuthConfigurationError` pointing you at the `id_token`.
 *
 * @throws {OAuthConfigurationError} If the provider has no user-info endpoint.
 * @throws {OAuthProviderError} If the provider rejects the request.
 * @throws {OAuthResponseError} If the payload has no usable user id.
 */
export async function fetchUserInfo(
  config: OAuthConfig,
  accessToken: string,
): Promise<OAuthUserInfo> {
  const resolved = resolveConfig(config);
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new OAuthResponseError("An access token is required.");
  }
  const url = resolveUserInfoUrl(resolved);

  const payload = await requestProviderJson(resolved, {
    url,
    method: "GET",
    headers: userInfoHeaders(resolved, accessToken),
    label: "user-info",
  });

  const info = normalizeUserInfo(resolved.provider, payload);
  if (info === undefined) {
    throw new OAuthResponseError(
      "The user-info endpoint returned no stable user identifier.",
    );
  }

  if (
    resolved.provider === "github" &&
    info.email === undefined &&
    resolved.scopes.includes("user:email")
  ) {
    const primary = await fetchGithubPrimaryEmail(resolved, url, accessToken);
    if (primary !== undefined) {
      return { ...info, email: primary.email, emailVerified: primary.verified };
    }
  }

  return info;
}
