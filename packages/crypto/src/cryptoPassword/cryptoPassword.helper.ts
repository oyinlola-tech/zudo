import type { PasswordHashOptions } from "./cryptoPassword.type.js";

import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";

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
 * @throws {RangeError} when `cost` is below the floor.
 */
export function assertNewHashCost(cost: number): void {
  if (typeof cost === "number" && cost < PASSWORD_HASH.SCRYPT.MIN_COST) {
    throw new RangeError(
      `scrypt cost for a new password hash must be at least ${PASSWORD_HASH.SCRYPT.MIN_COST}.`,
    );
  }
}
