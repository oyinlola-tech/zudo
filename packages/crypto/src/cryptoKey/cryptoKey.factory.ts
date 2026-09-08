import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import { encode } from "../cryptoEncoding/cryptoEncoding.core.js";

import type { CryptoProvider } from "../cryptoProvider/index.js";

import { CryptoOperation } from "@zudojs/errors";

import { keyError } from "../cryptoErrors/cryptoErrors.helper.js";

import {
  CryptoAlgorithm,
  AES_GCM,
  KEY_SIZE,
} from "../cryptoConstants/cryptoConstants.type.js";

import {
  isAeadAlgorithm,
  isHashAlgorithm,
  isKeyDerivationAlgorithm,
  isMacAlgorithm,
  isSymmetricKeyAlgorithm,
} from "../cryptoConstants/cryptoConstants.guard.js";

import type { CryptoKey, CryptoKeyOptions } from "./cryptoKey.type.js";

/**
 * Domain-separation label used for key fingerprints.
 *
 * Fingerprints are `HMAC-SHA256(label, keyBytes)` rather than a bare hash
 * of the key so that they cannot be confused with any other digest of the
 * same bytes. They are only safe to expose for keys with at least 128 bits
 * of entropy, which `createCryptoKey` enforces by length; a fingerprint of
 * a low-entropy key is still an offline brute-force oracle.
 */
export const CRYPTO_KEY_FINGERPRINT_LABEL = "zudojs-crypto-key-fingerprint-v1";

const MIN_SYMMETRIC_KEY_BYTES = KEY_SIZE.MIN_SYMMETRIC_KEY_BITS / 8;

/**
 * Returns the required key length (in bytes) for an algorithm, or a
 * minimum when any length above it is acceptable.
 */
export function expectedKeyLength(algorithm: CryptoAlgorithm): {
  readonly exact?: number;
  readonly minimum: number;
} {
  if (isAeadAlgorithm(algorithm)) {
    return { exact: AES_GCM.KEY_BYTES, minimum: AES_GCM.KEY_BYTES };
  }

  if (isMacAlgorithm(algorithm) || isKeyDerivationAlgorithm(algorithm)) {
    return { minimum: MIN_SYMMETRIC_KEY_BYTES };
  }

  if (algorithm === CryptoAlgorithm.ED25519) {
    // Raw 32-byte seed or a DER/PEM encoded key.
    return { minimum: KEY_SIZE.ED25519_BITS / 8 };
  }

  throw keyError(
    `Algorithm "${String(algorithm)}" does not use cryptographic keys.`,
    CryptoOperation.KEY_IMPORT,
    typeof algorithm === "string" ? algorithm : undefined,
  );
}

function validateKeyBytes(bytes: Uint8Array, algorithm: CryptoAlgorithm): void {
  if (!(bytes instanceof Uint8Array)) {
    throw keyError(
      "Cryptographic key material must be a Uint8Array.",
      CryptoOperation.KEY_IMPORT,
      algorithm,
    );
  }

  if (bytes.byteLength === 0) {
    throw keyError(
      "Cryptographic key cannot be empty.",
      CryptoOperation.KEY_IMPORT,
      algorithm,
    );
  }

  if (isHashAlgorithm(algorithm)) {
    throw keyError(
      `Hash algorithm "${algorithm}" does not use cryptographic keys.`,
      CryptoOperation.KEY_IMPORT,
      algorithm,
    );
  }

  const { exact, minimum } = expectedKeyLength(algorithm);

  if (exact !== undefined && bytes.byteLength !== exact) {
    throw keyError(
      `Algorithm "${algorithm}" requires a ${exact}-byte key, received ${bytes.byteLength} bytes.`,
      CryptoOperation.KEY_IMPORT,
      algorithm,
    );
  }

  if (bytes.byteLength < minimum) {
    throw keyError(
      `Algorithm "${algorithm}" requires a key of at least ${minimum} bytes, received ${bytes.byteLength} bytes.`,
      CryptoOperation.KEY_IMPORT,
      algorithm,
    );
  }
}

/**
 * Creates a cryptographic key from raw bytes.
 *
 * The key length is validated against the declared algorithm (exactly 32
 * bytes for AES-256-GCM, at least 16 bytes for HMAC and derived keys).
 * Hashing and key-id generation are delegated to the supplied provider.
 */
export async function createCryptoKey(
  bytes: Uint8Array,
  options: CryptoKeyOptions,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<CryptoKey> {
  validateKeyBytes(bytes, options.algorithm);

  const keyBytes = new Uint8Array(bytes);

  const digest = await provider.hmac(
    "sha256",
    CRYPTO_KEY_FINGERPRINT_LABEL,
    keyBytes,
  );

  const fingerprint = encode(digest, "hex");

  const createdAt = Date.now();

  const keyId = options.keyId ?? `key_${await generateKeyId(provider)}`;

  const usages = Object.freeze([...(options.usages ?? [])]);

  return Object.freeze({
    algorithm: options.algorithm,
    keyId,
    usages,
    extractable: options.extractable ?? false,
    createdAt,
    length: keyBytes.byteLength * 8,
    fingerprint,
    bytes: () => new Uint8Array(keyBytes),
  });
}

/**
 * Generates a cryptographically secure random symmetric key.
 *
 * Only symmetric algorithms (AES-GCM, HMAC, KDF outputs) are accepted:
 * random bytes are not a usable Ed25519 key, so asymmetric algorithms are
 * rejected. Use `generateEd25519KeyPair` for signing keys.
 */
export async function generateCryptoKey(
  length: number,
  options: CryptoKeyOptions,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<CryptoKey> {
  if (!isSymmetricKeyAlgorithm(options.algorithm)) {
    throw keyError(
      `Random key generation is only supported for symmetric algorithms, not "${String(options.algorithm)}".`,
      CryptoOperation.KEY_GENERATION,
      typeof options.algorithm === "string" ? options.algorithm : undefined,
    );
  }

  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError(
      "Cryptographic key length must be a positive integer.",
    );
  }

  const bytes = await provider.randomBytes(length);

  return createCryptoKey(bytes, options, provider);
}

/**
 * Returns the default key length in bytes for a symmetric algorithm.
 */
export function defaultKeyLength(algorithm: CryptoAlgorithm): number {
  if (isAeadAlgorithm(algorithm)) {
    return AES_GCM.KEY_BYTES;
  }

  switch (algorithm) {
    case CryptoAlgorithm.HMAC_SHA256:
    case CryptoAlgorithm.PBKDF2_SHA256:
    case CryptoAlgorithm.SCRYPT:
      return 32;
    case CryptoAlgorithm.HMAC_SHA384:
    case CryptoAlgorithm.PBKDF2_SHA384:
      return 48;
    case CryptoAlgorithm.HMAC_SHA512:
    case CryptoAlgorithm.PBKDF2_SHA512:
      return 64;
    default:
      throw keyError(
        `Random key generation is only supported for symmetric algorithms, not "${String(algorithm)}".`,
        CryptoOperation.KEY_GENERATION,
        typeof algorithm === "string" ? algorithm : undefined,
      );
  }
}

/**
 * Returns a defensive copy of a key's bytes.
 *
 * This operation is only permitted for extractable keys.
 */
export function exportCryptoKey(key: CryptoKey): Uint8Array {
  if (!key.extractable) {
    throw keyError(
      `Cryptographic key "${key.keyId}" is not extractable.`,
      CryptoOperation.KEY_EXPORT,
      key.algorithm,
    );
  }

  return key.bytes();
}

/**
 * Generates a hex-encoded random identifier for a key.
 */
async function generateKeyId(provider: CryptoProvider): Promise<string> {
  const idBytes = await provider.randomBytes(16);

  return encode(idBytes, "hex");
}
