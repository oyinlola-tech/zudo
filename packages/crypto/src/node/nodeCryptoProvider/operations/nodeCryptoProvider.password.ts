import type {
  CryptoInput,
  PasswordHashProviderOptions,
} from "../../../cryptoProvider/index.js";
import { randomBytes } from "node:crypto";
import { toBytes } from "../nodeCryptoProvider.helper.js";
import { timingSafeEqual } from "../../../compare/compare.helper.js";
import { CryptoAlgorithm } from "../../../cryptoConstants/cryptoConstants.type.js";
import { PASSWORD_HASH } from "../../../cryptoConstants/cryptoConstants.security.js";
import {
  PASSWORD_FORMAT_VERSION,
  decodePasswordHash,
  encodePasswordHash,
  pbkdf2PasswordAlgorithm,
} from "../../../cryptoPassword/cryptoPassword.codec.js";
import { deriveKey } from "./nodeCryptoProvider.derivation.js";
import { keyDerivationError } from "../../../cryptoErrors/cryptoErrors.helper.js";

/**
 * Hashes a password with scrypt (default) or PBKDF2 and returns the
 * self-describing, versioned encoding produced by `encodePasswordHash`.
 *
 * The encoded string is validated against `PASSWORD_HASH.LIMITS`, so the
 * provider refuses insecure parameters (short salts, tiny work factors)
 * instead of producing a hash that can never be verified.
 */
export async function hashPassword(
  password: CryptoInput,
  options?: PasswordHashProviderOptions,
): Promise<string> {
  const algorithm = options?.algorithm ?? "scrypt";
  const salt =
    options?.salt ?? new Uint8Array(randomBytes(PASSWORD_HASH.SALT_BYTES));
  const keyBytes = options?.keyBytes ?? PASSWORD_HASH.KEY_BYTES;
  const passwordBytes = toBytes(password);

  switch (algorithm) {
    case "scrypt": {
      const cost = options?.memoryCost ?? PASSWORD_HASH.SCRYPT.COST;
      const blockSize = options?.blockSize ?? PASSWORD_HASH.SCRYPT.BLOCK_SIZE;
      const parallelization =
        options?.parallelism ?? PASSWORD_HASH.SCRYPT.PARALLELIZATION;

      // Validate before deriving so invalid parameters fail fast.
      const placeholder = new Uint8Array(keyBytes);
      encodePasswordHash({
        version: PASSWORD_FORMAT_VERSION,
        algorithm: CryptoAlgorithm.SCRYPT,
        salt,
        hash: placeholder,
        cost,
        blockSize,
        parallelization,
      });

      const hash = await deriveKey({
        password: passwordBytes,
        salt,
        algorithm: "scrypt",
        keyLength: keyBytes,
        memoryCost: cost,
        blockSize,
        parallelism: parallelization,
      });

      return encodePasswordHash({
        version: PASSWORD_FORMAT_VERSION,
        algorithm: CryptoAlgorithm.SCRYPT,
        salt,
        hash,
        cost,
        blockSize,
        parallelization,
      });
    }

    case "pbkdf2": {
      const iterations = options?.timeCost ?? PASSWORD_HASH.PBKDF2.ITERATIONS;
      const digest = options?.digest ?? "sha256";
      const label = pbkdf2PasswordAlgorithm(digest);

      const placeholder = new Uint8Array(keyBytes);
      encodePasswordHash({
        version: PASSWORD_FORMAT_VERSION,
        algorithm: label,
        digest,
        salt,
        hash: placeholder,
        iterations,
      });

      const hash = await deriveKey({
        password: passwordBytes,
        salt,
        algorithm: "pbkdf2",
        keyLength: keyBytes,
        iterations,
        digest,
      });

      return encodePasswordHash({
        version: PASSWORD_FORMAT_VERSION,
        algorithm: label,
        digest,
        salt,
        hash,
        iterations,
      });
    }

    default:
      throw keyDerivationError(
        `Unsupported password algorithm: ${String(algorithm)}.`,
        typeof algorithm === "string" ? algorithm : undefined,
      );
  }
}

/**
 * Verifies a password against an encoded hash.
 *
 * Returns false for any malformed, foreign or out-of-bounds hash string
 * instead of throwing, so login paths fail closed. The hash is decoded
 * and validated before any derivation work is done.
 */
export async function verifyPassword(
  password: CryptoInput,
  hash: string,
): Promise<boolean> {
  if (typeof hash !== "string") {
    return false;
  }

  let decoded;

  try {
    decoded = decodePasswordHash(hash);
  } catch {
    return false;
  }

  const passwordBytes = toBytes(password);

  let expected: Uint8Array;

  if (decoded.algorithm === CryptoAlgorithm.SCRYPT) {
    expected = await deriveKey({
      password: passwordBytes,
      salt: decoded.salt,
      algorithm: "scrypt",
      keyLength: decoded.hash.byteLength,
      memoryCost: decoded.cost,
      blockSize: decoded.blockSize,
      parallelism: decoded.parallelization,
    });
  } else {
    expected = await deriveKey({
      password: passwordBytes,
      salt: decoded.salt,
      algorithm: "pbkdf2",
      keyLength: decoded.hash.byteLength,
      iterations: decoded.iterations,
      digest: decoded.digest,
    });
  }

  return timingSafeEqual(decoded.hash, expected);
}
