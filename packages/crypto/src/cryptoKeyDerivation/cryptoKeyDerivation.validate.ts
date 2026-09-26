import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";
import { isPbkdf2Digest } from "../cryptoProvider/cryptoProvider.type.js";
import { keyDerivationError } from "../cryptoErrors/cryptoErrors.helper.js";

const LIMITS = PASSWORD_HASH.LIMITS;

/**
 * Validates PBKDF2 key derivation options.
 *
 * Both floors and ceilings are enforced: `iterations` is bounded by
 * `PASSWORD_HASH.LIMITS.MAX_PBKDF2_ITERATIONS` and `keyLength` by
 * `PASSWORD_HASH.LIMITS.MAX_DERIVED_KEY_BYTES`, so a work factor read from
 * configuration cannot request unbounded CPU time.
 *
 * @throws {CryptoError} `CRYPTO_DERIVATION` for an out-of-range work factor,
 *   key length or salt; `TypeError` for an unknown digest name.
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
    throw keyDerivationError(
      `PBKDF2 iterations must be an integer between ${PASSWORD_HASH.PBKDF2.MIN_ITERATIONS} and ${LIMITS.MAX_PBKDF2_ITERATIONS}.`,
      "pbkdf2",
    );
  }

  if (
    !Number.isInteger(keyLength) ||
    keyLength < 16 ||
    keyLength > LIMITS.MAX_DERIVED_KEY_BYTES
  ) {
    throw keyDerivationError(
      `PBKDF2 keyLength must be an integer between 16 and ${LIMITS.MAX_DERIVED_KEY_BYTES} bytes.`,
      "pbkdf2",
    );
  }

  if (!(salt instanceof Uint8Array) || salt.byteLength < 16) {
    throw keyDerivationError("PBKDF2 salt must be at least 16 bytes.", "pbkdf2");
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
 *
 * @throws {CryptoError} `CRYPTO_DERIVATION` for any parameter outside its
 *   bound.
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
    throw keyDerivationError(
      `scrypt keyLength must be an integer between 16 and ${LIMITS.MAX_DERIVED_KEY_BYTES} bytes.`,
      "scrypt",
    );
  }

  if (
    !Number.isInteger(cost) ||
    cost < 2 ||
    cost > LIMITS.MAX_SCRYPT_COST ||
    (cost & (cost - 1)) !== 0
  ) {
    throw keyDerivationError(
      `scrypt cost must be a power of two between 2 and ${LIMITS.MAX_SCRYPT_COST}.`,
      "scrypt",
    );
  }

  if (
    !Number.isInteger(blockSize) ||
    blockSize <= 0 ||
    blockSize > LIMITS.MAX_SCRYPT_BLOCK_SIZE
  ) {
    throw keyDerivationError(
      `scrypt blockSize must be an integer between 1 and ${LIMITS.MAX_SCRYPT_BLOCK_SIZE}.`,
      "scrypt",
    );
  }

  if (
    !Number.isInteger(parallelization) ||
    parallelization <= 0 ||
    parallelization > LIMITS.MAX_SCRYPT_PARALLELIZATION
  ) {
    throw keyDerivationError(
      `scrypt parallelization must be an integer between 1 and ${LIMITS.MAX_SCRYPT_PARALLELIZATION}.`,
      "scrypt",
    );
  }

  if (128 * cost * blockSize > LIMITS.MAX_SCRYPT_MEMORY_BYTES) {
    throw keyDerivationError(
      `scrypt cost * blockSize exceeds the memory bound of ${LIMITS.MAX_SCRYPT_MEMORY_BYTES} bytes.`,
      "scrypt",
    );
  }

  if (!(salt instanceof Uint8Array) || salt.byteLength < 16) {
    throw keyDerivationError("scrypt salt must be at least 16 bytes.", "scrypt");
  }

  if (
    maxMemory !== undefined &&
    (!Number.isInteger(maxMemory) || maxMemory <= 0)
  ) {
    throw keyDerivationError(
      "scrypt maxMemory must be a positive integer.",
      "scrypt",
    );
  }
}
