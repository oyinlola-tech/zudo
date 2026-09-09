/**
 * Configuration resolution: preset merge, URL validation, redirect allowlist.
 *
 * @module oauthClient/oauthConfig
 *
 * Every public entry point resolves the config first, so a bad endpoint or a
 * disallowed redirect URI is rejected before a single byte leaves the process.
 */

import {
  OAuthConfigurationError,
  OAuthRedirectUriError,
} from "../oauthErrors/index.js";
import {
  PROVIDER_PRESETS,
  type OAuthProviderPreset,
} from "../oauthProviders/index.js";
import { assertSafeUrl } from "../oauthSecurity/index.js";
import type {
  ClientAuthMethod,
  FetchLike,
  OAuthConfig,
  OAuthProvider,
} from "../oauthTypes/index.js";

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Upper bound accepted for `timeoutMs`. */
export const MAX_TIMEOUT_MS = 120_000;
/** Default response-body cap: 256 KiB. */
export const DEFAULT_MAX_RESPONSE_BYTES = 262_144;
/** Lower bound accepted for `maxResponseBytes`. */
export const MIN_MAX_RESPONSE_BYTES = 1_024;
/** Upper bound accepted for `maxResponseBytes`: 5 MiB. */
export const MAX_MAX_RESPONSE_BYTES = 5_242_880;

/** A validated configuration. Endpoint URLs are resolved on demand. */
export interface ResolvedOAuthConfig {
  readonly provider: OAuthProvider;
  readonly preset: OAuthProviderPreset;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: readonly string[];
  readonly clientAuth: ClientAuthMethod;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly fetchImpl: FetchLike;
  readonly allowedRedirectUris: readonly string[];
  readonly source: OAuthConfig;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OAuthConfigurationError(`${field} is required and must be a non-empty string.`);
  }
  return value;
}

function boundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new OAuthConfigurationError(`${field} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new OAuthConfigurationError(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Strip a URL's fragment and normalise scheme/host casing for comparison.
 */
function canonicalRedirect(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
}

/**
 * Validate an `OAuthConfig` and merge it with its provider preset.
 *
 * @throws {OAuthConfigurationError} For a missing or out-of-range field.
 * @throws {OAuthEndpointNotAllowedError} For an unacceptable redirect URI.
 */
export function resolveConfig(config: OAuthConfig): ResolvedOAuthConfig {
  if (config === null || typeof config !== "object") {
    throw new OAuthConfigurationError("An OAuth configuration object is required.");
  }
  const preset = PROVIDER_PRESETS[config.provider] as
    | OAuthProviderPreset
    | undefined;
  if (preset === undefined) {
    throw new OAuthConfigurationError("Unknown OAuth provider.");
  }
  const clientId = requireString(config.clientId, "clientId");
  const clientSecret = requireString(config.clientSecret, "clientSecret");

  const allowlist = config.allowedRedirectUris;
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    throw new OAuthConfigurationError(
      "allowedRedirectUris must list at least one exact redirect URI.",
    );
  }
  const allowedRedirectUris = allowlist.map((entry, index) =>
    canonicalRedirect(
      assertSafeUrl(entry, `allowedRedirectUris[${index}]`, "browser"),
    ),
  );

  const scopes =
    config.scopes !== undefined && config.scopes.length > 0
      ? config.scopes
      : preset.defaultScopes;
  for (const scope of scopes) {
    if (typeof scope !== "string" || !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope)) {
      throw new OAuthConfigurationError(
        "Each scope must be a non-empty RFC 6749 scope-token.",
      );
    }
  }

  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new OAuthConfigurationError(
      "No fetch implementation available; supply config.fetch.",
    );
  }

  return {
    provider: config.provider,
    preset,
    clientId,
    clientSecret,
    scopes,
    clientAuth: config.clientAuthMethod ?? preset.clientAuth,
    timeoutMs: boundedInt(config.timeoutMs, DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS, "timeoutMs"),
    maxResponseBytes: boundedInt(
      config.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      MIN_MAX_RESPONSE_BYTES,
      MAX_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    ),
    fetchImpl: fetchImpl as FetchLike,
    allowedRedirectUris,
    source: config,
  };
}

/** The authorization endpoint, validated for browser use. */
export function resolveAuthorizeUrl(resolved: ResolvedOAuthConfig): URL {
  const raw = resolved.source.authorizeUrl ?? resolved.preset.authorizeUrl;
  if (raw === undefined) {
    throw new OAuthConfigurationError(
      "authorizeUrl is required for this provider.",
    );
  }
  return assertSafeUrl(raw, "authorizeUrl", "browser");
}

/** The token endpoint, validated for server-side fetching. */
export function resolveTokenUrl(resolved: ResolvedOAuthConfig): URL {
  const raw = resolved.source.tokenUrl ?? resolved.preset.tokenUrl;
  if (raw === undefined) {
    throw new OAuthConfigurationError("tokenUrl is required for this provider.");
  }
  return assertSafeUrl(raw, "tokenUrl", "fetch");
}

/** The user-info endpoint, validated for server-side fetching. */
export function resolveUserInfoUrl(resolved: ResolvedOAuthConfig): URL {
  const raw = resolved.source.userInfoUrl ?? resolved.preset.userInfoUrl;
  if (raw === undefined) {
    throw new OAuthConfigurationError(
      resolved.provider === "apple"
        ? "Apple has no user-info endpoint; read the profile from the id_token returned by the token exchange."
        : "userInfoUrl is required for this provider.",
    );
  }
  return assertSafeUrl(raw, "userInfoUrl", "fetch");
}

/**
 * Check a redirect URI against the caller's allowlist.
 *
 * The URI is parsed and canonicalised (scheme and host case-insensitive,
 * fragment forbidden, path and query byte-exact) and must match an allowlist
 * entry. An arbitrary redirect target is never reflected into the
 * authorization request.
 *
 * @returns The canonical form to send as `redirect_uri`.
 * @throws {OAuthRedirectUriError} If it is not allowlisted.
 */
export function assertRedirectUriAllowed(
  resolved: ResolvedOAuthConfig,
  redirectUri: string,
): string {
  const url = assertSafeUrl(redirectUri, "redirectUri", "browser");
  if (url.hash !== "") {
    throw new OAuthRedirectUriError("redirectUri must not contain a fragment.");
  }
  const canonical = canonicalRedirect(url);
  if (!resolved.allowedRedirectUris.includes(canonical)) {
    throw new OAuthRedirectUriError(
      "redirectUri is not in the configured allowlist.",
    );
  }
  return canonical;
}
