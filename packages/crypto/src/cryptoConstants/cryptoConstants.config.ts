import { CRYPTO_ALGORITHM, ENCODING, AES_GCM } from "./cryptoConstants.type.js";

import { TOKEN_PREFIX } from "./cryptoConstants.token.js";

import { PASSWORD_HASH } from "./cryptoConstants.security.js";

/**
 * Type-safe union of supported crypto algorithm identifiers.
 */
export type CryptoAlgorithmName =
  (typeof CRYPTO_ALGORITHM)[keyof typeof CRYPTO_ALGORITHM];

/**
 * Type-safe union of supported token prefixes.
 */
export type TokenPrefix = (typeof TOKEN_PREFIX)[keyof typeof TOKEN_PREFIX];

/**
 * Type-safe union of supported encodings.
 */
export type CryptoEncodingName = (typeof ENCODING)[keyof typeof ENCODING];

/**
 * Returns the default AES-GCM configuration.
 */
export function getDefaultAesGcmConfig(): {
  readonly keyBytes: number;
  readonly keyBits: number;
  readonly ivBytes: number;
  readonly authTagBytes: number;
} {
  return {
    keyBytes: AES_GCM.KEY_BYTES,
    keyBits: AES_GCM.KEY_BITS,
    ivBytes: AES_GCM.IV_BYTES,
    authTagBytes: AES_GCM.AUTH_TAG_BYTES,
  };
}

/**
 * Returns the default password hashing configuration.
 */
export function getDefaultPasswordHashConfig(): {
  readonly saltBytes: number;
  readonly keyBytes: number;
  readonly scryptCost: number;
  readonly scryptBlockSize: number;
  readonly scryptParallelization: number;
  readonly pbkdf2Iterations: number;
  readonly pbkdf2Digest: string;
} {
  return {
    saltBytes: PASSWORD_HASH.SALT_BYTES,
    keyBytes: PASSWORD_HASH.KEY_BYTES,
    scryptCost: PASSWORD_HASH.SCRYPT.COST,
    scryptBlockSize: PASSWORD_HASH.SCRYPT.BLOCK_SIZE,
    scryptParallelization: PASSWORD_HASH.SCRYPT.PARALLELIZATION,
    pbkdf2Iterations: PASSWORD_HASH.PBKDF2.ITERATIONS,
    pbkdf2Digest: PASSWORD_HASH.PBKDF2.DIGEST,
  };
}
