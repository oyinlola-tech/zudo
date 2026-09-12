import type { DeriveKeyOptions } from "../../../cryptoProvider/index.js";
import { isPbkdf2Digest } from "../../../cryptoProvider/cryptoProvider.type.js";
import { pbkdf2, scrypt } from "node:crypto";
import { toBytes } from "../nodeCryptoProvider.helper.js";
import { keyDerivationError } from "../../../cryptoErrors/cryptoErrors.helper.js";
import { PASSWORD_HASH } from "../../../cryptoConstants/cryptoConstants.security.js";

/** Hard floors applied at the provider boundary. */
const PROVIDER_MIN_SALT_BYTES = 16;
const PROVIDER_MIN_KEY_BYTES = 16;
const PROVIDER_MIN_PBKDF2_ITERATIONS = 1_000;

/**
 * Hard ceilings applied at the provider boundary.
 *
 * The provider is reachable directly (`provider.deriveKey`) and through
 * custom wrappers, so the same `PASSWORD_HASH.LIMITS` that bound stored
 * password hashes are enforced here too. Without them the scrypt memory
 * bound was computed from the requested cost, which is no bound at all.
 */
const PROVIDER_LIMITS = PASSWORD_HASH.LIMITS;
const DEFAULT_PBKDF2_ITERATIONS = 600_000;
const DEFAULT_SCRYPT_COST = 16_384;
const DEFAULT_SCRYPT_BLOCK_SIZE = 8;
const DEFAULT_SCRYPT_PARALLELISM = 1;
const NODE_DEFAULT_MAXMEM = 32 * 1024 * 1024;

/**
 * Computes a memory bound for scrypt from its parameters.
 *
 * OpenSSL requires roughly `128 * N * r` bytes plus `128 * r * p`; we
 * double that for margin and never go below Node's own 32 MiB default.
 */
export function defaultScryptMaxMemory(N: number, r: number, p: number): number {
  return Math.max(NODE_DEFAULT_MAXMEM, 2 * (128 * N * r + 128 * r * p));
}

function validateCommon(
  options: DeriveKeyOptions,
  algorithm: string,
): { password: Uint8Array; salt: Uint8Array; keyLength: number } {
  const password = toBytes(options.password);
  const salt = options.salt;
  const keyLength = options.keyLength ?? 32;

  if (!(salt instanceof Uint8Array) || salt.byteLength < PROVIDER_MIN_SALT_BYTES) {
    throw keyDerivationError(
      `Salt must be at least ${PROVIDER_MIN_SALT_BYTES} bytes.`,
      algorithm,
    );
  }

  if (
    !Number.isInteger(keyLength) ||
    keyLength < PROVIDER_MIN_KEY_BYTES ||
    keyLength > PROVIDER_LIMITS.MAX_DERIVED_KEY_BYTES
  ) {
    throw keyDerivationError(
      `keyLength must be an integer between ${PROVIDER_MIN_KEY_BYTES} and ${PROVIDER_LIMITS.MAX_DERIVED_KEY_BYTES}.`,
      algorithm,
    );
  }

  return { password, salt, keyLength };
}

export async function deriveKey(
  options: DeriveKeyOptions,
): Promise<Uint8Array> {
  switch (options.algorithm) {
    case "pbkdf2": {
      const { password, salt, keyLength } = validateCommon(options, "pbkdf2");
      const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
      const digest = options.digest ?? "sha256";

      if (
        !Number.isInteger(iterations) ||
        iterations < PROVIDER_MIN_PBKDF2_ITERATIONS ||
        iterations > PROVIDER_LIMITS.MAX_PBKDF2_ITERATIONS
      ) {
        throw keyDerivationError(
          `PBKDF2 iterations must be an integer between ${PROVIDER_MIN_PBKDF2_ITERATIONS} and ${PROVIDER_LIMITS.MAX_PBKDF2_ITERATIONS}.`,
          "pbkdf2",
        );
      }

      if (!isPbkdf2Digest(digest)) {
        throw keyDerivationError(
          `Unsupported PBKDF2 digest: ${String(digest)}.`,
          "pbkdf2",
        );
      }

      return new Promise((resolve, reject) => {
        try {
          pbkdf2(
            Buffer.from(password),
            Buffer.from(salt),
            iterations,
            keyLength,
            digest,
            (err, derived) => {
              if (err) {
                reject(keyDerivationError("Key derivation failed.", "pbkdf2", err));
              } else {
                resolve(new Uint8Array(derived));
              }
            },
          );
        } catch (error) {
          reject(keyDerivationError("Key derivation failed.", "pbkdf2", error));
        }
      });
    }

    case "scrypt": {
      const { password, salt, keyLength } = validateCommon(options, "scrypt");
      const N = options.memoryCost ?? DEFAULT_SCRYPT_COST;
      const r = options.blockSize ?? DEFAULT_SCRYPT_BLOCK_SIZE;
      const p = options.parallelism ?? DEFAULT_SCRYPT_PARALLELISM;

      if (
        !Number.isInteger(N) ||
        N < 2 ||
        N > PROVIDER_LIMITS.MAX_SCRYPT_COST ||
        (N & (N - 1)) !== 0
      ) {
        throw keyDerivationError(
          `scrypt cost must be a power of two between 2 and ${PROVIDER_LIMITS.MAX_SCRYPT_COST}.`,
          "scrypt",
        );
      }

      if (
        !Number.isInteger(r) ||
        r <= 0 ||
        r > PROVIDER_LIMITS.MAX_SCRYPT_BLOCK_SIZE
      ) {
        throw keyDerivationError(
          `scrypt blockSize must be an integer between 1 and ${PROVIDER_LIMITS.MAX_SCRYPT_BLOCK_SIZE}.`,
          "scrypt",
        );
      }

      if (
        !Number.isInteger(p) ||
        p <= 0 ||
        p > PROVIDER_LIMITS.MAX_SCRYPT_PARALLELIZATION
      ) {
        throw keyDerivationError(
          `scrypt parallelism must be an integer between 1 and ${PROVIDER_LIMITS.MAX_SCRYPT_PARALLELIZATION}.`,
          "scrypt",
        );
      }

      if (128 * N * r > PROVIDER_LIMITS.MAX_SCRYPT_MEMORY_BYTES) {
        throw keyDerivationError(
          `scrypt cost * blockSize exceeds the memory bound of ${PROVIDER_LIMITS.MAX_SCRYPT_MEMORY_BYTES} bytes.`,
          "scrypt",
        );
      }

      const maxmem = options.maxMemory ?? defaultScryptMaxMemory(N, r, p);

      if (!Number.isInteger(maxmem) || maxmem <= 0) {
        throw keyDerivationError(
          "scrypt maxMemory must be a positive integer.",
          "scrypt",
        );
      }

      return new Promise((resolve, reject) => {
        try {
          scrypt(
            Buffer.from(password),
            Buffer.from(salt),
            keyLength,
            { N, r, p, maxmem },
            (err, derived) => {
              if (err) {
                reject(keyDerivationError("Key derivation failed.", "scrypt", err));
              } else {
                resolve(new Uint8Array(derived));
              }
            },
          );
        } catch (error) {
          reject(keyDerivationError("Key derivation failed.", "scrypt", error));
        }
      });
    }

    default:
      throw keyDerivationError(
        `Unsupported key derivation algorithm: ${String(
          (options as { algorithm: unknown }).algorithm,
        )}.`,
        typeof (options as { algorithm: unknown }).algorithm === "string"
          ? String((options as { algorithm: unknown }).algorithm)
          : undefined,
      );
  }
}
