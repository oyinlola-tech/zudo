/**
 * Error classes for the OAuth2 client.
 *
 * @module oauthErrors/oauthError
 *
 * These are defined locally rather than extending `@zudojs/errors` so the
 * package has no `@zudojs/*` dependency at all.
 *
 * **Secret hygiene.** No constructor here ever interpolates a client secret,
 * an access token, a refresh token or a code verifier into `message`. The
 * only provider-supplied text that reaches a message is an OAuth `error`
 * code, and it is passed through a strict `[a-z0-9_.-]{1,64}` filter first,
 * so a provider cannot echo a secret back into your logs. `message` is the
 * first line of `stack`, so keeping it clean keeps the stack clean.
 */

/** Stable, machine-readable error codes. */
export const OAuthErrorCode = {
  /** The config is unusable: missing field, bad URL, unsupported operation. */
  CONFIGURATION_INVALID: "OAUTH_CONFIGURATION_INVALID",
  /** A URL failed the scheme / credential / SSRF guard. */
  ENDPOINT_NOT_ALLOWED: "OAUTH_ENDPOINT_NOT_ALLOWED",
  /** The redirect URI is not in the caller's allowlist. */
  REDIRECT_URI_NOT_ALLOWED: "OAUTH_REDIRECT_URI_NOT_ALLOWED",
  /** `state` did not match, was absent, or was malformed. */
  STATE_MISMATCH: "OAUTH_STATE_MISMATCH",
  /** A PKCE verifier was malformed. */
  PKCE_INVALID: "OAUTH_PKCE_INVALID",
  /** The provider returned a non-2xx or an OAuth `error` payload. */
  PROVIDER_REJECTED: "OAUTH_PROVIDER_REJECTED",
  /** The provider's response was unparseable or structurally invalid. */
  PROVIDER_RESPONSE_INVALID: "OAUTH_PROVIDER_RESPONSE_INVALID",
  /** The response body exceeded the configured cap. */
  RESPONSE_TOO_LARGE: "OAUTH_RESPONSE_TOO_LARGE",
  /** The request timed out or the transport failed. */
  NETWORK: "OAUTH_NETWORK",
} as const;

/** Union of {@link OAuthErrorCode} values. */
export type OAuthErrorCode =
  (typeof OAuthErrorCode)[keyof typeof OAuthErrorCode];

/** Options accepted by {@link OAuthError} and every subclass. */
export interface OAuthErrorOptions {
  readonly code?: OAuthErrorCode;
  readonly statusCode?: number;
  readonly expose?: boolean;
  readonly cause?: unknown;
}

/**
 * Base error for every OAuth2 failure.
 *
 * `expose` says whether the message is safe to hand to an end user; it is
 * `true` for request-caused failures and `false` for configuration ones
 * (which describe your deployment, not the request).
 */
export class OAuthError extends Error {
  override readonly name: string = "OAuthError";
  /** Machine-readable code. */
  readonly code: OAuthErrorCode;
  /** Suggested HTTP status for a handler that surfaces this. */
  readonly statusCode: number;
  /** Whether `message` is safe to return to a client verbatim. */
  readonly expose: boolean;

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : {});
    this.code = options?.code ?? OAuthErrorCode.PROVIDER_REJECTED;
    this.statusCode = options?.statusCode ?? 400;
    this.expose = options?.expose ?? true;
  }
}

/** The configuration is missing something or is structurally unusable. */
export class OAuthConfigurationError extends OAuthError {
  override readonly name: string = "OAuthConfigurationError";

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.CONFIGURATION_INVALID,
      statusCode: 500,
      expose: false,
      ...options,
    });
  }
}

/**
 * An endpoint URL is not an acceptable target: wrong scheme, embedded
 * credentials, or a private / loopback / link-local / metadata host.
 */
export class OAuthEndpointNotAllowedError extends OAuthError {
  override readonly name: string = "OAuthEndpointNotAllowedError";

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.ENDPOINT_NOT_ALLOWED,
      statusCode: 500,
      expose: false,
      ...options,
    });
  }
}

/** The requested redirect URI is not in `config.allowedRedirectUris`. */
export class OAuthRedirectUriError extends OAuthError {
  override readonly name: string = "OAuthRedirectUriError";

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.REDIRECT_URI_NOT_ALLOWED,
      statusCode: 400,
      expose: true,
      ...options,
    });
  }
}

/** The callback's `state` did not match the one that was issued. */
export class OAuthStateMismatchError extends OAuthError {
  override readonly name: string = "OAuthStateMismatchError";

  constructor(message = "OAuth state verification failed.", options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.STATE_MISMATCH,
      statusCode: 400,
      expose: true,
      ...options,
    });
  }
}

/** The provider refused the request. */
export class OAuthProviderError extends OAuthError {
  override readonly name: string = "OAuthProviderError";
  /** The provider's OAuth `error` code, if it sent a well-formed one. */
  readonly providerError?: string;
  /** The provider's HTTP status, if the exchange got that far. */
  readonly providerStatus?: number;

  constructor(
    message: string,
    options?: OAuthErrorOptions & {
      readonly providerError?: string;
      readonly providerStatus?: number;
    },
  ) {
    super(message, {
      code: OAuthErrorCode.PROVIDER_REJECTED,
      statusCode: 502,
      expose: true,
      ...options,
    });
    if (options?.providerError !== undefined) {
      this.providerError = options.providerError;
    }
    if (options?.providerStatus !== undefined) {
      this.providerStatus = options.providerStatus;
    }
  }
}

/** The provider's response was not a usable OAuth2 payload. */
export class OAuthResponseError extends OAuthError {
  override readonly name: string = "OAuthResponseError";

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.PROVIDER_RESPONSE_INVALID,
      statusCode: 502,
      expose: true,
      ...options,
    });
  }
}

/** The provider's response body exceeded `maxResponseBytes`. */
export class OAuthResponseTooLargeError extends OAuthError {
  override readonly name: string = "OAuthResponseTooLargeError";

  constructor(limitBytes: number, options?: OAuthErrorOptions) {
    super(
      `OAuth provider response exceeded the ${limitBytes}-byte limit.`,
      {
        code: OAuthErrorCode.RESPONSE_TOO_LARGE,
        statusCode: 502,
        expose: true,
        ...options,
      },
    );
  }
}

/** The request timed out or the transport failed. */
export class OAuthNetworkError extends OAuthError {
  override readonly name: string = "OAuthNetworkError";

  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: OAuthErrorCode.NETWORK,
      statusCode: 504,
      expose: true,
      ...options,
    });
  }
}
