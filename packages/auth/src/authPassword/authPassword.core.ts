/**
 * Password hashing and verification, delegated to `@zudojs/crypto`.
 *
 * @module authPassword/authPassword
 *
 * New hashes are `@zudojs/crypto` scrypt hashes
 * (`v1$scrypt$N$r$p$<salt>.<hash>`, Base64URL). Hashes written by earlier
 * versions of this package (`scrypt$…`) still verify through the legacy
 * verifier, and `needsRehash()` reports them so they upgrade on next login.
 */

import { randomBytes } from "node:crypto";
import {
  hashPassword as cryptoHashPassword,
  verifyPassword as cryptoVerifyPassword,
} from "@zudojs/crypto";
import { ErrorCode } from "@zudojs/errors";
import { AuthError } from "../authErrors/authError.base.js";
import {
  KEY_LENGTH,
  MAX_PASSWORD_BYTES,
  MAX_SALT_LENGTH,
  MIN_SALT_LENGTH,
  SALT_LENGTH,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R,
} from "./authPassword.policy.js";
import {
  isLegacyPasswordHash,
  verifyLegacyPassword,
} from "./authPassword.legacy.js";

/**
 * Hash a plain-text password with `@zudojs/crypto` (scrypt N=2^14, r=8,
 * p=5, 64-byte key).
 *
 * @param password - Plain-text password. Must be non-empty and at most
 *   {@link MAX_PASSWORD_BYTES} bytes of UTF-8.
 * @param saltLength - Salt length in bytes (default: 32). Must be an integer
 *   between {@link MIN_SALT_LENGTH} and {@link MAX_SALT_LENGTH}; `0` would
 *   otherwise silently produce unsalted, rainbow-table-able hashes.
 * @returns Hashed password string in the `@zudojs/crypto` format
 *   `v1$scrypt$N$r$p$<salt>.<hash>`
 * @throws {AuthError} with `ErrorCode.INVALID_INPUT` when the password is
 *   not a non-empty string, is too long, or the salt length is out of range.
 */
export async function hashPassword(
  password: string,
  saltLength: number = SALT_LENGTH,
): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new AuthError("Password must be a non-empty string.", {
      code: ErrorCode.INVALID_INPUT,
      statusCode: 400,
    });
  }
  if (Buffer.byteLength(password, "utf-8") > MAX_PASSWORD_BYTES) {
    throw new AuthError(
      `Password exceeds the maximum of ${MAX_PASSWORD_BYTES} bytes.`,
      { code: ErrorCode.INVALID_INPUT, statusCode: 400 },
    );
  }
  if (
    !Number.isInteger(saltLength) ||
    saltLength < MIN_SALT_LENGTH ||
    saltLength > MAX_SALT_LENGTH
  ) {
    throw new AuthError(
      `saltLength must be an integer between ${MIN_SALT_LENGTH} and ${MAX_SALT_LENGTH} bytes.`,
      { code: ErrorCode.INVALID_INPUT, statusCode: 400 },
    );
  }
  const result = await cryptoHashPassword(password, {
    saltBytes: saltLength,
    keyBytes: KEY_LENGTH,
    cost: SCRYPT_N,
    blockSize: SCRYPT_R,
    parallelization: SCRYPT_P,
  });
  return result.encoded;
}

/**
 * Verify a plain-text password against a hash.
 *
 * `v1$…` hashes are verified by `@zudojs/crypto`. Hashes from earlier
 * versions of this package ("scrypt$N$r$p$salt$hash" and the ≤ 0.1.1
 * "scrypt<salt>$<hash>") go through the legacy verifier.
 *
 * Never throws: any input this function cannot make sense of — a
 * non-string, an over-length password (see {@link MAX_PASSWORD_BYTES}), an
 * unparseable hash — is a non-match. Callers are on the request path and
 * treat a `false` as "wrong password", which is the correct outcome for all
 * of those.
 *
 * @param password - Plain-text password to verify
 * @param hashedPassword - Previously hashed password
 * @returns Whether the password matches
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  if (typeof password !== "string" || typeof hashedPassword !== "string") {
    return false;
  }
  if (Buffer.byteLength(password, "utf-8") > MAX_PASSWORD_BYTES) {
    return false;
  }
  if (isLegacyPasswordHash(hashedPassword)) {
    return verifyLegacyPassword(password, hashedPassword);
  }
  return cryptoVerifyPassword(password, hashedPassword);
}

/**
 * Generate a random token string (for password reset, etc.).
 *
 * Synchronous by contract, so it draws from `node:crypto` directly: every
 * `@zudojs/crypto` random helper is asynchronous.
 *
 * @param length - Token length in bytes (default: 32)
 * @returns Hex-encoded random string
 */
export function generateRandomToken(length: number = 32): string {
  if (!Number.isInteger(length) || length < 16 || length > 1024) {
    throw new AuthError(
      "generateRandomToken length must be an integer between 16 and 1024 bytes.",
      { code: ErrorCode.INVALID_INPUT, statusCode: 400 },
    );
  }
  return randomBytes(length).toString("hex");
}
