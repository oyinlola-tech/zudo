/**
 * Public types for the OAuth2 authorization-code client.
 *
 * @module oauthTypes/oauth
 */

/**
 * Supported OAuth2 provider identifiers.
 *
 * `custom` requires every endpoint URL to be supplied on the config; the
 * named providers supply their own defaults (see the provider presets).
 */
export type OAuthProvider =
  | "google"
  | "github"
  | "microsoft"
  | "apple"
  | "discord"
  | "custom";

/**
 * How the client authenticates itself at the token endpoint.
 *
 * - `basic` — HTTP Basic auth (`client_id:client_secret`), RFC 6749 §2.3.1.
 * - `body` — `client_id` / `client_secret` form fields.
 *
 * Each preset picks whatever its provider actually expects; override only if
 * you know your deployment differs.
 */
export type ClientAuthMethod = "basic" | "body";

/**
 * The `fetch` shape this package depends on.
 *
 * Defaults to the global `fetch`. Inject your own to add proxying, retries or
 * to test without a network.
 */
export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/**
 * OAuth2 provider configuration.
 *
 * Endpoint URLs are optional for the named providers (the preset fills them
 * in) and mandatory for `custom`. Every URL — supplied or preset — is
 * validated before any network call; see {@link ../oauthSecurity/oauthUrl.guard}.
 */
export interface OAuthConfig {
  /** Provider identifier. */
  readonly provider: OAuthProvider;
  /** OAuth2 client ID. */
  readonly clientId: string;
  /**
   * OAuth2 client secret.
   *
   * For Apple this is the short-lived ES256 client-secret JWT you generate
   * from your private key; this package does not mint it for you.
   *
   * Never logged, never placed in an error message or stack.
   */
  readonly clientSecret: string;
  /** Authorization endpoint. Overrides the preset. */
  readonly authorizeUrl?: string;
  /** Token endpoint. Overrides the preset. */
  readonly tokenUrl?: string;
  /** User-info endpoint. Overrides the preset. */
  readonly userInfoUrl?: string;
  /**
   * Exact redirect URIs this client is allowed to use.
   *
   * Every `redirectUri` passed to {@link createAuthorizationUrl} or
   * {@link exchangeCodeForToken} must appear here verbatim (scheme and host
   * compared case-insensitively, the rest byte-for-byte). At least one entry
   * is required — an arbitrary redirect target is never reflected.
   */
  readonly allowedRedirectUris: readonly string[];
  /** Requested scopes. Defaults to the preset's scopes. */
  readonly scopes?: readonly string[];
  /** Token-endpoint client authentication. Defaults to the preset's choice. */
  readonly clientAuthMethod?: ClientAuthMethod;
  /** Per-request timeout in milliseconds. Default 10000, max 120000. */
  readonly timeoutMs?: number;
  /**
   * Hard cap on bytes read from a provider response body.
   * Default 262144 (256 KiB), min 1024, max 5242880 (5 MiB).
   */
  readonly maxResponseBytes?: number;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  readonly fetch?: FetchLike;
}

/** Options for {@link createAuthorizationUrl}. */
export interface AuthorizationUrlOptions {
  /**
   * Anti-CSRF state. **Mandatory.** Persist it against the user's session and
   * check it on the callback with {@link verifyState}.
   */
  readonly state: string;
  /** Redirect URI. Must be present in `config.allowedRedirectUris`. */
  readonly redirectUri: string;
  /** Scopes for this request. Defaults to `config.scopes` / the preset. */
  readonly scopes?: readonly string[];
  /**
   * Pre-generated PKCE code verifier (43-128 chars, unreserved alphabet).
   * Omit to have one generated — which is what you should normally do.
   */
  readonly codeVerifier?: string;
  /** OIDC `nonce`, echoed into the ID token by providers that support it. */
  readonly nonce?: string;
  /** Extra authorization parameters (e.g. `prompt`, `access_type`). */
  readonly additionalParams?: Readonly<Record<string, string>>;
}

/** Result of {@link createAuthorizationUrl}. */
export interface AuthorizationUrlResult {
  /** The URL to send the user agent to. */
  readonly url: string;
  /** The state you supplied — persist it. */
  readonly state: string;
  /**
   * The PKCE code verifier — persist it server-side (session, signed cookie)
   * and pass it to {@link exchangeCodeForToken}. It is a secret.
   */
  readonly codeVerifier: string;
  /** The `S256` challenge that was sent. Informational. */
  readonly codeChallenge: string;
}

/** Options for {@link exchangeCodeForToken}. */
export interface CodeExchangeOptions {
  /** The `code` query parameter from the callback. */
  readonly code: string;
  /** The verifier returned by {@link createAuthorizationUrl}. */
  readonly codeVerifier: string;
  /** The same redirect URI used for the authorization request. */
  readonly redirectUri: string;
}

/** A validated OAuth2 token response. */
export interface OAuthTokenSet {
  /** Access token. Always a non-empty string. */
  readonly accessToken: string;
  /** Token type as returned, defaulting to `Bearer`. */
  readonly tokenType: string;
  /** Lifetime in seconds, when the provider reported a numeric one. */
  readonly expiresIn?: number;
  /** Refresh token, when the provider issued one. */
  readonly refreshToken?: string;
  /** Granted scopes, split on whitespace. */
  readonly scope?: readonly string[];
  /** OIDC ID token, when present. Unverified — this package does not parse it. */
  readonly idToken?: string;
  /**
   * The parsed response with prototype-polluting keys stripped.
   * Contains the tokens themselves — treat as secret.
   */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** Normalised user profile from a provider's user-info endpoint. */
export interface OAuthUserInfo {
  /** The provider's stable user identifier. */
  readonly providerId: string;
  /**
   * Email address, when the provider returned one.
   *
   * Optional on purpose: GitHub omits it from `/user` when the address is
   * private, and Discord omits it without the `email` scope. This package
   * never invents one.
   */
  readonly email?: string;
  /** Whether the provider stated the email is verified. */
  readonly emailVerified?: boolean;
  /** Display name. */
  readonly name?: string;
  /** Avatar URL. */
  readonly avatarUrl?: string;
  /** Raw provider payload, prototype-polluting keys stripped. */
  readonly raw?: Readonly<Record<string, unknown>>;
}
