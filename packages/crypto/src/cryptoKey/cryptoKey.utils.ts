import type { CryptoKey } from "./cryptoKey.type.js";

/**
 * Returns the stable fingerprint of a key.
 *
 * The fingerprint is `HMAC-SHA256(CRYPTO_KEY_FINGERPRINT_LABEL, keyBytes)`
 * in hex. It can be used to identify a key without exposing the secret
 * material, provided the key has at least 128 bits of entropy (which
 * `createCryptoKey` enforces by minimum length).
 */
export function getCryptoKeyFingerprint(key: CryptoKey): string {
  return key.fingerprint;
}

/**
 * Compares two cryptographic keys by identity.
 */
export function cryptoKeysEqual(left: CryptoKey, right: CryptoKey): boolean {
  return (
    left.keyId === right.keyId &&
    left.fingerprint === right.fingerprint &&
    left.algorithm === right.algorithm
  );
}
