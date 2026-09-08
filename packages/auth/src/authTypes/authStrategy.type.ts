/**
 * Authentication strategy types (OAuth2, social login, etc.).
 *
 * @module authStrategy/authStrategy
 *
 * **Contract only — this package ships no implementation of any of these.**
 * There is no authorize-URL builder, no authorization-code exchange, no
 * state/PKCE handling and no user-info fetch anywhere in `@zudojs/auth`, and
 * `createAuthService()` has no strategy registry. The types exist so that
 * consumers who implement `AuthStrategy` themselves, or a future strategy
 * package, share one shape. Do not install this package expecting working
 * OAuth2.
 */

import type { UserId } from "../authTypes/authUser.type.js";

/**
 * Supported OAuth2 provider identifiers.
 */
export type OAuthProvider =
  "google" | "github" | "microsoft" | "apple" | "discord" | "custom";

/**
 * OAuth2 provider configuration.
 */
export interface OAuthConfig {
  /** Provider name */
  readonly provider: OAuthProvider;
  /** OAuth2 client ID */
  readonly clientId: string;
  /** OAuth2 client secret */
  readonly clientSecret: string;
  /** OAuth2 authorization URL */
  readonly authorizeUrl: string;
  /** OAuth2 token URL */
  readonly tokenUrl: string;
  /** OAuth2 user info URL */
  readonly userInfoUrl: string;
  /** Redirect URI after authorization */
  readonly redirectUri: string;
  /** Requested scopes */
  readonly scopes?: readonly string[];
}

/**
 * User info returned from an OAuth2 provider.
 */
export interface OAuthUserInfo {
  /** Provider's user ID */
  readonly providerId: string;
  /** Email address */
  readonly email: string;
  /** Display name */
  readonly name?: string;
  /** Avatar URL */
  readonly avatarUrl?: string;
  /** Raw provider data */
  readonly raw?: Record<string, unknown>;
}

/**
 * Result of OAuth2 authentication.
 */
export interface OAuthResult {
  /** Whether authentication succeeded */
  readonly success: boolean;
  /** Authenticated user ID (if success) */
  readonly userId?: UserId;
  /** Whether a new user was created */
  readonly isNewUser?: boolean;
  /** Error message (if failure) */
  readonly error?: string;
}

/**
 * Authentication strategy interface.
 * Each strategy (password, OAuth2, API key, etc.) implements this.
 *
 * Nothing in this package implements or consumes it — see the module note.
 */
export interface AuthStrategy {
  /** Strategy identifier */
  readonly name: string;
  /** Authenticate with strategy-specific credentials */
  authenticate(credentials: unknown): Promise<OAuthResult>;
}

/**
 * Password strategy credentials.
 */
export interface PasswordCredentials {
  readonly identifier: string;
  readonly password: string;
}

/**
 * API key strategy credentials.
 */
export interface ApiKeyCredentials {
  readonly apiKey: string;
}
