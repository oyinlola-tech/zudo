/**
 * Credential shapes accepted by the authentication entry points.
 *
 * @module authTypes/authCredentials
 *
 * These are plain contracts for the credentials a caller collects from a
 * request. They carry no behaviour; `createAuthService()` takes the
 * identifier and password directly.
 */

/**
 * Password credentials: an identifier (username or email) and a password.
 */
export interface PasswordCredentials {
  readonly identifier: string;
  readonly password: string;
}

/**
 * API key credentials.
 *
 * The type exists for callers that model machine-to-machine auth; this
 * package implements no API-key verification.
 */
export interface ApiKeyCredentials {
  readonly apiKey: string;
}
