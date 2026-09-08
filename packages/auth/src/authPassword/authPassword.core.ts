/**
 * Password hashing and verification using Node.js crypto scrypt.
 *
 * @module authPassword/authPassword
 *
 * Uses scrypt with salt for secure password hashing.
 * Compatible with Node.js ≥ 24 (no external dependencies).
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Default salt length in bytes. */
const SALT_LENGTH = 32;

/** Default key length for scrypt. */
const KEY_LENGTH = 64;

/** Scrypt parameters (N, r, p). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: string;
  readonly hash: string;
  /** True for hashes written before params were stored in the string. */
  readonly legacy: boolean;
}

/**
 * Hash a plain-text password.
 *
 * @param password - Plain-text password
 * @param saltLength - Salt length in bytes (default: 32)
 * @returns Hashed password string in format "scrypt$N$r$p$salt$hash"
 */
export async function hashPassword(
  password: string,
  saltLength: number = SALT_LENGTH,
): Promise<string> {
  const salt = randomBytes(saltLength).toString("hex");
  const derivedKey = await deriveKey(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey}`;
}

/**
 * Verify a plain-text password against a hash.
 *
 * Accepts the current "scrypt$N$r$p$salt$hash" format as well as the
 * legacy "scrypt<salt>$<hash>" format produced by versions ≤ 0.1.1.
 *
 * @param password - Plain-text password to verify
 * @param hashedPassword - Previously hashed password
 * @returns Whether the password matches
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  const parsed = parseHash(hashedPassword);
  if (!parsed) return false;

  let derivedKey: string;
  try {
    derivedKey = await deriveKey(password, parsed.salt, parsed.params);
  } catch {
    // scrypt rejects params it cannot satisfy (e.g. over maxmem)
    return false;
  }
  const storedBuffer = Buffer.from(parsed.hash, "hex");
  const derivedBuffer = Buffer.from(derivedKey, "hex");
  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, derivedBuffer);
}

/**
 * Check if a password hash needs rehashing (legacy format, changed
 * scrypt parameters, or changed salt length).
 *
 * @param hashedPassword - The stored hash
 * @returns Whether the hash should be regenerated
 */
export function needsRehash(hashedPassword: string): boolean {
  const parsed = parseHash(hashedPassword);
  if (!parsed || parsed.legacy) return true;

  const saltBytes = parsed.salt.length / 2;
  return (
    saltBytes !== SALT_LENGTH ||
    parsed.params.N !== SCRYPT_N ||
    parsed.params.r !== SCRYPT_R ||
    parsed.params.p !== SCRYPT_P
  );
}

/**
 * Generate a random token string (for password reset, etc.).
 *
 * @param length - Token length in bytes (default: 32)
 * @returns Hex-encoded random string
 */
export function generateRandomToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

function parseHash(hashedPassword: string): ParsedHash | null {
  const parts = hashedPassword.split("$");

  if (parts.length === 6 && parts[0] === "scrypt") {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    // Bounds also cap the memory/CPU a corrupted hash string can request.
    if (
      !Number.isInteger(N) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      N < 2 ||
      (N & (N - 1)) !== 0 ||
      N > 1 << 20 ||
      r < 1 ||
      r > 64 ||
      p < 1 ||
      p > 16
    ) {
      return null;
    }
    return {
      params: { N, r, p },
      salt: parts[4]!,
      hash: parts[5]!,
      legacy: false,
    };
  }

  // Legacy format from ≤ 0.1.1: "scrypt<salt>$<hash>" (no separator
  // between the prefix and the salt, params not stored).
  if (parts.length === 2 && parts[0]!.startsWith("scrypt")) {
    return {
      params: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      salt: parts[0]!.slice(6),
      hash: parts[1]!,
      legacy: true,
    };
  }

  return null;
}

function deriveKey(
  password: string,
  salt: string,
  params: ScryptParams,
): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString("hex"));
      },
    );
  });
}
