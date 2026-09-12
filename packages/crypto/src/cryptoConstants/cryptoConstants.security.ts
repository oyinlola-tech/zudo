import { TimeMs } from "@zudojs/constants";

/**
 * Password hashing constants.
 *
 * Defaults follow current OWASP Password Storage Cheat Sheet guidance:
 * scrypt N=2^14, r=8, p=1 (minimum) and PBKDF2-HMAC-SHA256 with 600 000
 * iterations. `LIMITS` bounds parameters that are read back from stored
 * hashes so that a tampered or foreign record cannot force unbounded work.
 */
export const PASSWORD_HASH = Object.freeze({
  SALT_BYTES: 16,
  KEY_BYTES: 32,

  SCRYPT: Object.freeze({
    COST: 16_384,
    BLOCK_SIZE: 8,
    PARALLELIZATION: 1,
  }),

  PBKDF2: Object.freeze({
    ITERATIONS: 600_000,
    /**
     * Floor for stored or caller-supplied iteration counts. Kept below the
     * default so hashes produced by other systems with older (but still
     * NIST-compliant) parameters remain verifiable; new hashes always use
     * `ITERATIONS`.
     */
    MIN_ITERATIONS: 100_000,
    DIGEST: "sha256",
  }),

  LIMITS: Object.freeze({
    MIN_SALT_BYTES: 16,
    MAX_SALT_BYTES: 64,
    MIN_KEY_BYTES: 16,
    MAX_KEY_BYTES: 64,
    MIN_SCRYPT_COST: 2,
    MAX_SCRYPT_COST: 2 ** 20,
    MAX_SCRYPT_BLOCK_SIZE: 32,
    MAX_SCRYPT_PARALLELIZATION: 16,
    /**
     * Upper bound on `128 * N * r` (the scrypt working memory in bytes) so
     * that a stored hash cannot combine the individual maxima into a
     * multi-gigabyte allocation.
     */
    MAX_SCRYPT_MEMORY_BYTES: 1024 * 1024 * 1024,
    MAX_PBKDF2_ITERATIONS: 10_000_000,
    /**
     * Upper bound on the output length of `derivePbkdf2` / `deriveScrypt`
     * (and the provider's `deriveKey`). PBKDF2 cost scales linearly with
     * the number of output blocks, so an unbounded `keyLength` multiplies
     * the iteration count by an attacker-chosen factor. Password hashes
     * are bounded separately by `MAX_KEY_BYTES`.
     */
    MAX_DERIVED_KEY_BYTES: 1024,
  }),
} as const);

/**
 * Password policy defaults.
 *
 * These values are intentionally conservative defaults.
 * Applications may impose stricter requirements.
 *
 * `MAX_LENGTH` is measured in UTF-16 code units and is enforced by
 * `hashPassword`/`verifyPassword` to bound the work an unauthenticated
 * caller can trigger.
 */
export const PASSWORD_POLICY = Object.freeze({
  MIN_LENGTH: 8,
  RECOMMENDED_MIN_LENGTH: 12,
  MAX_LENGTH: 1024,
} as const);

/**
 * Password reset and verification token lifetime defaults.
 *
 * Values are expressed in milliseconds.
 */
export const TOKEN_TTL = Object.freeze({
  EMAIL_VERIFICATION_MS: TimeMs.MINUTE * 15,

  PASSWORD_RESET_MS: TimeMs.MINUTE * 15,

  LOGIN_VERIFICATION_MS: TimeMs.MINUTE * 10,

  CSRF_MS: TimeMs.HOUR,

  SESSION_MS: 24 * TimeMs.HOUR,

  REFRESH_TOKEN_MS: 30 * 24 * TimeMs.HOUR,
} as const);
