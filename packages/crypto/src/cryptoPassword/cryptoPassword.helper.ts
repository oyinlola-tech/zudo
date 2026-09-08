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
    parallelization: PASSWORD_HASH.SCRYPT.PARALLELIZATION,
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
