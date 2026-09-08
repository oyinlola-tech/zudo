import {
  PASSWORD_HASH,
  PASSWORD_POLICY,
} from "../cryptoConstants/cryptoConstants.security.js";

import { fromBase64Url } from "../cryptoEncoding/encoding/cryptoEncoding.base64url.js";

const LIMITS = PASSWORD_HASH.LIMITS;

/**
 * Validates the structural constraints of scrypt password hashing
 * parameters, including upper bounds so that parameters read back from a
 * stored hash cannot force unbounded CPU or memory usage.
 */
export function validateParameters(parameters: {
  readonly saltBytes: number;
  readonly keyBytes: number;
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
}): void {
  validateSaltAndKeyBytes(parameters.saltBytes, parameters.keyBytes);

  if (
    !Number.isInteger(parameters.cost) ||
    parameters.cost < LIMITS.MIN_SCRYPT_COST ||
    parameters.cost > LIMITS.MAX_SCRYPT_COST ||
    (parameters.cost & (parameters.cost - 1)) !== 0
  ) {
    throw new RangeError(
      `cost must be a power of two between ${LIMITS.MIN_SCRYPT_COST} and ${LIMITS.MAX_SCRYPT_COST}.`,
    );
  }

  if (
    !Number.isInteger(parameters.blockSize) ||
    parameters.blockSize <= 0 ||
    parameters.blockSize > LIMITS.MAX_SCRYPT_BLOCK_SIZE
  ) {
    throw new RangeError(
      `blockSize must be an integer between 1 and ${LIMITS.MAX_SCRYPT_BLOCK_SIZE}.`,
    );
  }

  if (
    !Number.isInteger(parameters.parallelization) ||
    parameters.parallelization <= 0 ||
    parameters.parallelization > LIMITS.MAX_SCRYPT_PARALLELIZATION
  ) {
    throw new RangeError(
      `parallelization must be an integer between 1 and ${LIMITS.MAX_SCRYPT_PARALLELIZATION}.`,
    );
  }

  if (128 * parameters.cost * parameters.blockSize > LIMITS.MAX_SCRYPT_MEMORY_BYTES) {
    throw new RangeError(
      `cost * blockSize exceeds the scrypt memory bound of ${LIMITS.MAX_SCRYPT_MEMORY_BYTES} bytes.`,
    );
  }
}

/**
 * Validates PBKDF2 password hashing parameters, including upper bounds.
 */
export function validatePbkdf2Parameters(parameters: {
  readonly saltBytes: number;
  readonly keyBytes: number;
  readonly iterations: number;
}): void {
  validateSaltAndKeyBytes(parameters.saltBytes, parameters.keyBytes);

  if (
    !Number.isInteger(parameters.iterations) ||
    parameters.iterations < PASSWORD_HASH.PBKDF2.MIN_ITERATIONS ||
    parameters.iterations > LIMITS.MAX_PBKDF2_ITERATIONS
  ) {
    throw new RangeError(
      `iterations must be an integer between ${PASSWORD_HASH.PBKDF2.MIN_ITERATIONS} and ${LIMITS.MAX_PBKDF2_ITERATIONS}.`,
    );
  }
}

function validateSaltAndKeyBytes(saltBytes: number, keyBytes: number): void {
  if (
    !Number.isInteger(saltBytes) ||
    saltBytes < LIMITS.MIN_SALT_BYTES ||
    saltBytes > LIMITS.MAX_SALT_BYTES
  ) {
    throw new RangeError(
      `saltBytes must be an integer between ${LIMITS.MIN_SALT_BYTES} and ${LIMITS.MAX_SALT_BYTES}.`,
    );
  }

  if (
    !Number.isInteger(keyBytes) ||
    keyBytes < LIMITS.MIN_KEY_BYTES ||
    keyBytes > LIMITS.MAX_KEY_BYTES
  ) {
    throw new RangeError(
      `keyBytes must be an integer between ${LIMITS.MIN_KEY_BYTES} and ${LIMITS.MAX_KEY_BYTES}.`,
    );
  }
}

/**
 * Parses a string into a positive safe integer.
 */
export function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} is outside the supported integer range.`);
  }

  return parsed;
}

/**
 * Decodes a non-empty, canonical Base64URL string into bytes.
 */
export function decodeBase64Url(value: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Invalid Base64URL value.");
  }

  return fromBase64Url(value);
}

/**
 * Asserts that a value is a password string within the policy length
 * bounds (non-empty, at most `PASSWORD_POLICY.MAX_LENGTH` code units).
 */
export function assertPassword(password: string): void {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  if (password.length === 0) {
    throw new TypeError("Password cannot be empty.");
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    throw new RangeError(
      `Password must not exceed ${PASSWORD_POLICY.MAX_LENGTH} characters.`,
    );
  }
}
