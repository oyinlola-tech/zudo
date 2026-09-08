import {
  CryptoAlgorithm,
  AEAD_ALGORITHMS,
  HASH_ALGORITHMS,
  KEY_DERIVATION_ALGORITHMS,
  MAC_ALGORITHMS,
  SIGNATURE_ALGORITHMS,
} from "./cryptoConstants.type.js";

/**
 * Returns true when an algorithm provides authenticated encryption.
 */
export function isAeadAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return AEAD_ALGORITHMS.includes(
    algorithm as (typeof AEAD_ALGORITHMS)[number],
  );
}

/**
 * Returns true when an algorithm is a hashing algorithm.
 */
export function isHashAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return HASH_ALGORITHMS.includes(
    algorithm as (typeof HASH_ALGORITHMS)[number],
  );
}

/**
 * Returns true when an algorithm is a key derivation algorithm.
 */
export function isKeyDerivationAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return KEY_DERIVATION_ALGORITHMS.includes(
    algorithm as (typeof KEY_DERIVATION_ALGORITHMS)[number],
  );
}

/**
 * Returns true when an algorithm is a message authentication algorithm.
 */
export function isMacAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return MAC_ALGORITHMS.includes(algorithm as (typeof MAC_ALGORITHMS)[number]);
}

/**
 * Returns true when an algorithm is a digital signature algorithm.
 */
export function isSignatureAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return SIGNATURE_ALGORITHMS.includes(
    algorithm as (typeof SIGNATURE_ALGORITHMS)[number],
  );
}

/**
 * Returns true when an algorithm is a symmetric key algorithm
 * (encryption, MAC or key derivation output).
 */
export function isSymmetricKeyAlgorithm(algorithm: CryptoAlgorithm): boolean {
  return (
    isAeadAlgorithm(algorithm) ||
    isMacAlgorithm(algorithm) ||
    isKeyDerivationAlgorithm(algorithm)
  );
}

/**
 * Returns true when the supplied value is a supported algorithm.
 */
export function isCryptoAlgorithm(value: unknown): value is CryptoAlgorithm {
  return (
    typeof value === "string" &&
    Object.values(CryptoAlgorithm).includes(value as CryptoAlgorithm)
  );
}

/**
 * Parses an algorithm from an arbitrary value.
 *
 * Throws when the value is not a supported algorithm.
 */
export function parseCryptoAlgorithm(value: string): CryptoAlgorithm {
  const normalized = value.trim().toLowerCase();

  if (isCryptoAlgorithm(normalized)) {
    return normalized;
  }

  throw new TypeError(`Unsupported cryptographic algorithm: "${value}".`);
}
