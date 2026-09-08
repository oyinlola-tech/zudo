import type {
  KeyDerivationAlgorithm,
  CryptoInput,
  Pbkdf2Digest,
} from "../cryptoProvider.type.js";

import type { CryptoAlgorithm } from "../../cryptoConstants/cryptoConstants.type.js";

/**
 * Algorithm labels produced by the public key derivation helpers.
 *
 * These are the values actually present on `DerivedKeyResult.algorithm`.
 */
export type DerivedKeyAlgorithm =
  | CryptoAlgorithm.PBKDF2_SHA256
  | CryptoAlgorithm.PBKDF2_SHA384
  | CryptoAlgorithm.PBKDF2_SHA512
  | CryptoAlgorithm.SCRYPT;

/**
 * Result of a key derivation operation.
 */
export interface DerivedKeyResult {
  readonly key: Uint8Array;
  readonly salt: Uint8Array;
  readonly algorithm: DerivedKeyAlgorithm;
  /** Digest used by PBKDF2; absent for scrypt. */
  readonly digest?: Pbkdf2Digest;
}

/**
 * Options for provider-level key derivation.
 */
export interface DeriveKeyOptions {
  readonly password: CryptoInput;
  readonly salt: Uint8Array;
  readonly algorithm: KeyDerivationAlgorithm;
  readonly keyLength?: number;
  /** PBKDF2 iteration count. */
  readonly iterations?: number;
  /** PBKDF2 digest (default sha256). */
  readonly digest?: Pbkdf2Digest;
  /** scrypt cost parameter N. */
  readonly memoryCost?: number;
  /** scrypt block size parameter r. */
  readonly blockSize?: number;
  /** scrypt parallelization parameter p. */
  readonly parallelism?: number;
  /** scrypt memory upper bound in bytes (default derived from N, r, p). */
  readonly maxMemory?: number;
}

/**
 * Options for provider-level password hashing.
 */
export interface PasswordHashProviderOptions {
  readonly algorithm?: KeyDerivationAlgorithm;
  /** scrypt cost N. */
  readonly memoryCost?: number;
  /** PBKDF2 iteration count. */
  readonly timeCost?: number;
  /** PBKDF2 digest (default sha256). */
  readonly digest?: Pbkdf2Digest;
  /** scrypt block size r. */
  readonly blockSize?: number;
  /** scrypt parallelization p. */
  readonly parallelism?: number;
  readonly keyBytes?: number;
  readonly salt?: Uint8Array;
}
