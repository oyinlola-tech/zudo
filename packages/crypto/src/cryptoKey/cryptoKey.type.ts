import type { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

/**
 * Supported cryptographic key usages.
 */
export enum CryptoKeyUsage {
  ENCRYPT = "encrypt",
  DECRYPT = "decrypt",
  SIGN = "sign",
  VERIFY = "verify",
  DERIVE_KEY = "derive-key",
  DERIVE_BITS = "derive-bits",
  WRAP_KEY = "wrap-key",
  UNWRAP_KEY = "unwrap-key",
}

/**
 * A cryptographic key represented as immutable bytes.
 *
 * The underlying byte array is copied when a key is created and when
 * its bytes are requested to prevent accidental mutation.
 *
 * Units: `length` is in **bits** (256 for a 32-byte key) and `byteLength`
 * in bytes; `generateCryptoKey(length)` takes bytes.
 *
 * `extractable` gates the public export path (`exportCryptoKey`) and
 * conversion to a signing key. `bytes()` is the raw accessor the providers
 * use to perform operations with the key, so it is available regardless of
 * `extractable`; treat it as internal and hand keys to the package's
 * functions rather than reading them out.
 */
export interface CryptoKey {
  readonly algorithm: CryptoAlgorithm;
  readonly keyId: string;
  readonly usages: readonly CryptoKeyUsage[];
  readonly extractable: boolean;
  readonly createdAt: number;
  /** Key size in bits. */
  readonly length: number;
  /** Key size in bytes (`length / 8`). */
  readonly byteLength: number;
  readonly fingerprint: string;
  readonly bytes: () => Uint8Array;
}

/**
 * Options used to create a cryptographic key.
 */
export interface CryptoKeyOptions {
  readonly algorithm: CryptoAlgorithm;
  readonly keyId?: string;
  readonly usages?: readonly CryptoKeyUsage[];
  readonly extractable?: boolean;
}

/**
 * Checks whether a value is a CryptoKey.
 */
export function isCryptoKey(value: unknown): value is CryptoKey {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const key = value as Partial<CryptoKey>;

  return (
    typeof key.algorithm === "string" &&
    typeof key.keyId === "string" &&
    Array.isArray(key.usages) &&
    typeof key.extractable === "boolean" &&
    typeof key.createdAt === "number" &&
    typeof key.length === "number" &&
    typeof key.fingerprint === "string" &&
    typeof key.bytes === "function"
  );
}
