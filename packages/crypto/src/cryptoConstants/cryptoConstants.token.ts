/**
 * Token constants.
 */
export const TOKEN = Object.freeze({
  DEFAULT_BYTES: 32,

  API_KEY_BYTES: 32,
  SESSION_BYTES: 32,
  REFRESH_BYTES: 48,
  VERIFICATION_BYTES: 32,
  PASSWORD_RESET_BYTES: 32,
  CSRF_BYTES: 32,

  OTP_DIGITS: 6,
  OTP_MIN_DIGITS: 4,
  OTP_MAX_DIGITS: 12,
} as const);

/**
 * Random value constraints.
 *
 * `MIN_BYTES` is the entropy floor (128 bits) enforced by `generateToken`.
 */
export const RANDOM = Object.freeze({
  MIN_BYTES: 16,
  DEFAULT_BYTES: 32,
} as const);

/**
 * Common token prefixes.
 *
 * Prefixes make opaque credentials easier to identify during
 * logging, debugging, and secret scanning without exposing
 * their underlying value.
 */
export const TOKEN_PREFIX = Object.freeze({
  API_KEY: "lat_",
  SESSION: "sess_",
  REFRESH: "ref_",
  VERIFICATION: "verify_",
  PASSWORD_RESET: "reset_",
  CSRF: "csrf_",
} as const);

/**
 * Cryptographic protocol versions.
 */
export const CRYPTO_VERSION = Object.freeze({
  CURRENT: "v1",
  PASSWORD_HASH: "v1",
  ENCRYPTION_ENVELOPE: "v1",
  TOKEN: "v1",
} as const);
