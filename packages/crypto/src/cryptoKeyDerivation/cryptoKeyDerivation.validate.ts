import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";
import { isPbkdf2Digest } from "../cryptoProvider/cryptoProvider.type.js";

const LIMITS = PASSWORD_HASH.LIMITS;

/**
 * Validates PBKDF2 key derivation options.
 *
 * Both floors and ceilings are enforced: `iterations` is bounded by
 * `PASSWORD_HASH.LIMITS.MAX_PBKDF2_ITERATIONS` and `keyLength` by
 * `PASSWORD_HASH.LIMITS.MAX_DERIVED_KEY_BYTES`, so a work factor read from
 * configuration cannot request unbounded CPU time.
 */
export function validatePbkdf2Options(
  iterations: number,
  keyLength: number,
  salt: Uint8Array,
  digest: unknown = "sha256",
): void {
  if (
    !Number.isInteger(iterations) ||
    iterations < PASSWORD_HASH.PBKDF2.MIN_ITERATIONS ||
    iterations > LIMITS.MAX_PBKDF2_ITERATIONS
  ) {
    throw new RangeError(
      `PBKDF2 iterations must be an integer between ${PASSWORD_HASH.PBKDF2.MIN_ITERATIONS} and ${LIMITS.MAX_PBKDF2_ITERATIONS}.`,
    );
  }

  if (
    !Number.isInteger(keyLength) ||
    keyLength < 16 ||
    keyLength > LIMITS.MAX_DERIVED_KEY_BYTES
  ) {
    throw new RangeError(
      `PBKDF2 keyLength must be an integer between 16 and ${LIMITS.MAX_DERIVED_KEY_BYTES} bytes.`,
    );
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
 *
 * `cost`, `blockSize` and `parallelization` are bounded by
 * `PASSWORD_HASH.LIMITS`, and `128 * cost * blockSize` (the scrypt working
 * memory) by `MAX_SCRYPT_MEMORY_BYTES`. Without these ceilings the memory
 * "bound" passed to the provider was derived from the very parameters it
 * was meant to bound, so a cost of 2^30 allocated terabytes.
 */
export function validateScryptOptions(
  keyLength: number,
  cost: number,
  blockSize: number,
  parallelization: number,
  salt: Uint8Array,
  maxMemory?: number,
): void {
  if (
    !Number.isInteger(keyLength) ||
    keyLength < 16 ||
    keyLength > LIMITS.MAX_DERIVED_KEY_BYTES
  ) {
    throw new RangeError(
      `scrypt keyLength must be an integer between 16 and ${LIMITS.MAX_DERIVED_KEY_BYTES} bytes.`,
    );
  }

  if (
    !Number.isInteger(cost) ||
    cost < 2 ||
    cost > LIMITS.MAX_SCRYPT_COST ||
    (cost & (cost - 1)) !== 0
  ) {
    throw new RangeError(
      `scrypt cost must be a power of two between 2 and ${LIMITS.MAX_SCRYPT_COST}.`,
    );
  }

  if (
    !Number.isInteger(blockSize) ||
    blockSize <= 0 ||
    blockSize > LIMITS.MAX_SCRYPT_BLOCK_SIZE
  ) {
    throw new RangeError(
      `scrypt blockSize must be an integer between 1 and ${LIMITS.MAX_SCRYPT_BLOCK_SIZE}.`,
    );
  }

  if (
    !Number.isInteger(parallelization) ||
    parallelization <= 0 ||
    parallelization > LIMITS.MAX_SCRYPT_PARALLELIZATION
  ) {
    throw new RangeError(
      `scrypt parallelization must be an integer between 1 and ${LIMITS.MAX_SCRYPT_PARALLELIZATION}.`,
    );
  }

  if (128 * cost * blockSize > LIMITS.MAX_SCRYPT_MEMORY_BYTES) {
    throw new RangeError(
      `scrypt cost * blockSize exceeds the memory bound of ${LIMITS.MAX_SCRYPT_MEMORY_BYTES} bytes.`,
    );
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
