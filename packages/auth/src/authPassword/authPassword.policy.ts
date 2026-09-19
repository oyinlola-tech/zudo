/**
 * Hashing policy for new auth password hashes. `needsRehash()` flags any
 * stored hash that does not match it.
 *
 * @module authPassword/authPassword.policy
 */

/** Default salt length in bytes. */
export const SALT_LENGTH = 32;

/** Accepted range for a caller-supplied salt length, in bytes. */
export const MIN_SALT_LENGTH = 16;
export const MAX_SALT_LENGTH = 64;

/**
 * Maximum accepted password length in bytes.
 *
 * scrypt's cost is set by N/r, not by the input length, so a long password
 * is not a work-factor amplifier — but it is still an unbounded allocation
 * driven by an unauthenticated request body. 1024 bytes is far past any
 * real passphrase.
 */
export const MAX_PASSWORD_BYTES = 1024;

/** Derived key length in bytes. */
export const KEY_LENGTH = 64;

/**
 * Scrypt parameters (N, r, p) for new hashes: the OWASP Password Storage
 * Cheat Sheet's N=2^14, r=8, p=5 row.
 */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 5;
