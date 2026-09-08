import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";
import { isPbkdf2Digest } from "../cryptoProvider/cryptoProvider.type.js";

/**
 * Validates PBKDF2 key derivation options.
 */
export function validatePbkdf2Options(
  iterations: number,
  keyLength: number,
  salt: Uint8Array,
  digest: unknown = "sha256",
): void {
  if (
    !Number.isInteger(iterations) ||
    iterations < PASSWORD_HASH.PBKDF2.MIN_ITERATIONS
  ) {
    throw new RangeError(
      `PBKDF2 iterations must be at least ${PASSWORD_HASH.PBKDF2.MIN_ITERATIONS}.`,
    );
  }

  if (!Number.isInteger(keyLength) || keyLength < 16) {
    throw new RangeError("PBKDF2 keyLength must be at least 16 bytes.");
  }

  if (!(salt instanceof Uint8Array) || salt.byteLength < 16) {
    throw new RangeError("PBKDF2 salt must be at least 16 bytes.");
  }

  if (!isPbkdf2Digest(digest)) {
    throw new TypeError(`Unsupported PBKDF2 digest: ${String(digest)}.`);
  }
}

/**
 * Validates scrypt key derivation options.
 */
export function validateScryptOptions(
  keyLength: number,
  cost: number,
  blockSize: number,
  parallelization: number,
  salt: Uint8Array,
  maxMemory?: number,
): void {
  if (!Number.isInteger(keyLength) || keyLength < 16) {
    throw new RangeError("scrypt keyLength must be at least 16 bytes.");
  }

  if (!Number.isInteger(cost) || cost < 2 || (cost & (cost - 1)) !== 0) {
    throw new RangeError(
      "scrypt cost must be a power of two greater than or equal to 2.",
    );
  }

  if (!Number.isInteger(blockSize) || blockSize <= 0) {
    throw new RangeError("scrypt blockSize must be a positive integer.");
  }

  if (!Number.isInteger(parallelization) || parallelization <= 0) {
    throw new RangeError("scrypt parallelization must be a positive integer.");
  }

  if (!(salt instanceof Uint8Array) || salt.byteLength < 16) {
    throw new RangeError("scrypt salt must be at least 16 bytes.");
  }

  if (
    maxMemory !== undefined &&
    (!Number.isInteger(maxMemory) || maxMemory <= 0)
  ) {
    throw new RangeError("scrypt maxMemory must be a positive integer.");
  }
}
