import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

import type { Pbkdf2Digest } from "../cryptoProvider/cryptoProvider.type.js";

/**
 * Options used for password hashing (scrypt).
 */
export interface PasswordHashOptions {
  readonly saltBytes?: number;
  readonly keyBytes?: number;
  readonly cost?: number;
  readonly blockSize?: number;
  readonly parallelization?: number;
}

/**
 * Result returned by password hashing.
 *
 * `salt` and `hash` are exactly the values encoded in `encoded`, so a
 * record that stores them in separate columns can be re-encoded with
 * `encodePasswordHash` and verified.
 */
export interface PasswordHashResult {
  readonly algorithm: CryptoAlgorithm.SCRYPT;
  readonly version: string;
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
  readonly encoded: string;
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
}

/**
 * Parameters encoded into a scrypt password hash
 * (`v1$scrypt$N$r$p$salt.hash`).
 */
export interface ScryptPasswordHashParameters {
  readonly version: string;
  readonly algorithm: CryptoAlgorithm.SCRYPT;
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
}

/**
 * Algorithm labels used for PBKDF2 password hashes.
 */
export type Pbkdf2PasswordAlgorithm =
  | CryptoAlgorithm.PBKDF2_SHA256
  | CryptoAlgorithm.PBKDF2_SHA384
  | CryptoAlgorithm.PBKDF2_SHA512;

/**
 * Parameters encoded into a PBKDF2 password hash
 * (`v1$pbkdf2-<digest>$iterations$salt.hash`).
 */
export interface Pbkdf2PasswordHashParameters {
  readonly version: string;
  readonly algorithm: Pbkdf2PasswordAlgorithm;
  readonly digest: Pbkdf2Digest;
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
  readonly iterations: number;
}

/**
 * Parameters decoded from any supported password hash string.
 *
 * Discriminate on `algorithm` to access algorithm-specific fields.
 */
export type PasswordHashParameters =
  | ScryptPasswordHashParameters
  | Pbkdf2PasswordHashParameters;
