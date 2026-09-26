import type { PasswordHashOptions } from "./cryptoPassword.type.js";

import {
  PASSWORD_HASH,
  PASSWORD_POLICY,
} from "../cryptoConstants/cryptoConstants.security.js";

import { passwordHashError } from "../cryptoErrors/cryptoErrors.helper.js";

import { decodePasswordHash } from "./cryptoPassword.codec.js";

const PASSWORD_MINIMUM_DEFAULT_LENGTH = 8;

/**
 * Returns the default password hashing parameters.
 */
export function getDefaultPasswordHashOptions(): Required<PasswordHashOptions> {
  return {
    saltBytes: PASSWORD_HASH.SALT_BYTES,
    keyBytes: PASSWORD_HASH.KEY_BYTES,
    cost: PASSWORD_HASH.SCRYPT.COST,
    blockSize: PASSWORD_HASH.SCRYPT.BLOCK_SIZE,
    parallelization: PASSWORD_HASH.SCRYPT.PASSWORD_PARALLELIZATION,
  };
}

/**
 * Returns whether an encoded value is a valid password hash.
 */
export function isPasswordHash(encoded: string): boolean {
  try {
    decodePasswordHash(encoded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns whether a password meets the basic requirements.
 */
export function isValidPassword(
  password: string,
  minimumLength = PASSWORD_MINIMUM_DEFAULT_LENGTH,
): boolean {
  return typeof password === "string" && password.length >= minimumLength;
}

/**
 * Refuses an scrypt cost below `PASSWORD_HASH.SCRYPT.MIN_COST` for a *new*
 * password hash.
 *
 * `LIMITS.MIN_SCRYPT_COST` (2) only bounds what verification accepts, so
 * older stored hashes stay verifiable; minting a new hash with `cost: 2`
 * produced a hash that is effectively free to crack.
 *
 * @throws {CryptoError} `CRYPTO_HASH` when `cost` is below the floor.
 */
export function assertNewHashCost(cost: number): void {
  if (typeof cost === "number" && cost < PASSWORD_HASH.SCRYPT.MIN_COST) {
    throw passwordHashError(
      `scrypt cost for a new password hash must be at least ${PASSWORD_HASH.SCRYPT.MIN_COST}.`,
    );
  }
}

/**
 * Asserts that a value is a password string within the length bounds:
 * non-empty, at least `minLength` code units when one is given, and at
 * most `PASSWORD_POLICY.MAX_LENGTH`.
 *
 * Length violations are user-facing `CryptoError`s (`CRYPTO_HASH`,
 * `statusCode` 400, `expose` true); a non-string is a `TypeError`.
 */
export function assertPassword(password: string, minLength?: number): void {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  if (password.length === 0) {
    throw new TypeError("Password cannot be empty.");
  }

  if (minLength !== undefined && password.length < minLength) {
    throw passwordHashError(
      `Password must be at least ${minLength} characters.`,
      { userFacing: true },
    );
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    throw passwordHashError(
      `Password must not exceed ${PASSWORD_POLICY.MAX_LENGTH} characters.`,
      { userFacing: true },
    );
  }
}
