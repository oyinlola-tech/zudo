/**
 * Core user type used across the auth system.
 *
 * @module authTypes/authUser
 */

import type { UserId } from "@zudojs/constants";

export type { UserId } from "@zudojs/constants";

/**
 * Brands a plain string as a {@link UserId}.
 *
 * `UserId` is a branded type with no public constructor, so callers holding an
 * id from a database row, a decoded token or a request parameter have no way to
 * produce one without a cast. This is that constructor.
 *
 * @param value - Non-empty user identifier.
 * @returns The same string, typed as a `UserId`.
 * @throws {TypeError} If `value` is not a non-empty string.
 */
export function toUserId(value: string): UserId {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("toUserId: value must be a non-empty string.");
  }
  return value as UserId;
}

/**
 * Authenticated user representation.
 */
export interface AuthUser {
  /** Unique identifier */
  readonly id: UserId;
  /** Email address */
  readonly email: string;
  /** Display name */
  readonly name?: string;
  /** Assigned roles */
  readonly roles: readonly string[];
  /** Custom claims */
  readonly claims?: Record<string, unknown>;
  /** Whether the user is active */
  readonly active: boolean;
  /** When the user was created */
  readonly createdAt: Date;
  /** When the user last logged in */
  readonly lastLoginAt?: Date;
}

/**
 * User credentials for login.
 */
export interface UserCredentials {
  /** User email or username */
  readonly identifier: string;
  /** Plain-text password (will be hashed for comparison) */
  readonly password: string;
}

/**
 * User registration input.
 */
export interface UserRegistration {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly roles?: readonly string[];
}
