import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import { randomInteger } from "../cryptoRandom/cryptoRandom.core.js";

import type { CryptoProvider } from "../cryptoProvider/index.js";

import { assertBinaryEncoding } from "../cryptoEncoding/cryptoEncoding.core.js";

import {
  RANDOM,
  TOKEN,
  TOKEN_PREFIX,
} from "../cryptoConstants/cryptoConstants.token.js";

/**
 * Supported token encodings.
 */
export type TokenEncoding = "hex" | "base64" | "base64url";

/**
 * Options for generating a secure token.
 */
export interface TokenOptions {
  readonly bytes?: number;
  readonly encoding?: TokenEncoding;
  readonly prefix?: string;
  readonly provider?: CryptoProvider;
}

/**
 * Creates a cryptographically secure opaque token.
 *
 * The encoding is validated at runtime: only `hex`, `base64` and
 * `base64url` are accepted, so a misconfigured `"utf8"` can never
 * produce a lossy token.
 */
export async function generateToken(
  options: TokenOptions = {},
): Promise<string> {
  const bytes = options.bytes ?? TOKEN.DEFAULT_BYTES;
  const encoding = options.encoding ?? "base64url";

  if (!Number.isInteger(bytes) || bytes < RANDOM.MIN_BYTES) {
    throw new RangeError(
      `Token byte length must be an integer of at least ${RANDOM.MIN_BYTES}.`,
    );
  }

  assertBinaryEncoding(encoding);

  if (options.prefix !== undefined && typeof options.prefix !== "string") {
    throw new TypeError("Token prefix must be a string.");
  }

  const provider = options.provider ?? getDefaultCryptoProvider();
  const raw = await provider.randomBytes(bytes);
  const token = Buffer.from(raw).toString(encoding);

  return options.prefix ? `${options.prefix}${token}` : token;
}

/**
 * Generates a secure API key.
 */
export async function generateApiKey(
  prefix: string = TOKEN_PREFIX.API_KEY,
  bytes: number = TOKEN.API_KEY_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({ bytes, encoding: "base64url", prefix, provider });
}

/**
 * Generates a secure session token.
 */
export async function generateSessionToken(
  bytes: number = TOKEN.SESSION_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding: "base64url",
    prefix: TOKEN_PREFIX.SESSION,
    provider,
  });
}

/**
 * Generates a secure refresh token.
 */
export async function generateRefreshToken(
  bytes: number = TOKEN.REFRESH_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding: "base64url",
    prefix: TOKEN_PREFIX.REFRESH,
    provider,
  });
}

/**
 * Generates a secure verification token.
 */
export async function generateVerificationToken(
  bytes: number = TOKEN.VERIFICATION_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding: "base64url",
    prefix: TOKEN_PREFIX.VERIFICATION,
    provider,
  });
}

/**
 * Generates a secure password-reset token.
 */
export async function generatePasswordResetToken(
  bytes: number = TOKEN.PASSWORD_RESET_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding: "base64url",
    prefix: TOKEN_PREFIX.PASSWORD_RESET,
    provider,
  });
}

/**
 * Generates a secure CSRF token.
 */
export async function generateCsrfToken(
  bytes: number = TOKEN.CSRF_BYTES,
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding: "base64url",
    prefix: TOKEN_PREFIX.CSRF,
    provider,
  });
}

/**
 * Generates a numeric one-time password.
 *
 * Leading zeroes are preserved.
 */
export async function generateOtp(
  digits: number = TOKEN.OTP_DIGITS,
  provider?: CryptoProvider,
): Promise<string> {
  if (
    !Number.isInteger(digits) ||
    digits < TOKEN.OTP_MIN_DIGITS ||
    digits > TOKEN.OTP_MAX_DIGITS
  ) {
    throw new RangeError(
      `OTP digits must be an integer between ${TOKEN.OTP_MIN_DIGITS} and ${TOKEN.OTP_MAX_DIGITS}.`,
    );
  }

  const max = 10 ** digits;
  const value = await randomInteger(0, max, provider);

  return String(value).padStart(digits, "0");
}

/**
 * Generates a short-lived email verification code.
 */
export async function generateEmailVerificationCode(
  digits: number = TOKEN.OTP_DIGITS,
  provider?: CryptoProvider,
): Promise<string> {
  return generateOtp(digits, provider);
}

/**
 * Generates a short-lived login verification code.
 */
export async function generateLoginCode(
  digits: number = TOKEN.OTP_DIGITS,
  provider?: CryptoProvider,
): Promise<string> {
  return generateOtp(digits, provider);
}
