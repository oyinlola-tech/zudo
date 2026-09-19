/**
 * Verifier for password hashes written before auth delegated to
 * `@zudojs/crypto`: `scrypt$N$r$p$<hexSalt>$<hexHash>` and the param-less
 * `scrypt<hexSalt>$<hexHash>` format from versions ≤ 0.1.1.
 *
 * Nothing new is ever written in these formats. They are kept so stored
 * hashes still verify, and `needsRehash()` reports every one of them.
 *
 * @module authPassword/authPassword.legacy
 */

import { scrypt } from "node:crypto";
import { timingSafeEqual } from "@zudojs/crypto";

/** Derived-key length used by every legacy format. */
const LEGACY_KEY_LENGTH = 64;

/** The fixed parameters of the param-less legacy format (≤ 0.1.1). */
const PARAMLESS_PARAMS: LegacyScryptParams = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
});

/** scrypt cost parameters stored in a legacy hash. */
interface LegacyScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/** A parsed legacy hash. */
interface LegacyHash {
  readonly params: LegacyScryptParams;
  readonly salt: string;
  readonly hash: string;
}

/**
 * Returns whether a stored hash uses one of the legacy auth formats (the
 * string starts with `scrypt`). Crypto-format hashes start with `v1$`.
 */
export function isLegacyPasswordHash(hashedPassword: string): boolean {
  return hashedPassword.startsWith("scrypt");
}

/**
 * Verifies a password against a legacy hash. Returns `false` for an
 * unparseable hash or parameters scrypt cannot satisfy; never throws.
 */
export async function verifyLegacyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  const parsed = parseLegacyHash(hashedPassword);
  if (!parsed) return false;

  let derived: Buffer;
  try {
    derived = await deriveLegacyKey(password, parsed.salt, parsed.params);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(parsed.hash, "hex"), derived);
}

function parseLegacyHash(hashedPassword: string): LegacyHash | null {
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
    return { params: { N, r, p }, salt: parts[4]!, hash: parts[5]! };
  }

  if (parts.length === 2 && parts[0]!.startsWith("scrypt")) {
    return {
      params: PARAMLESS_PARAMS,
      salt: parts[0]!.slice(6),
      hash: parts[1]!,
    };
  }

  return null;
}

function deriveLegacyKey(
  password: string,
  salt: string,
  params: LegacyScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      LEGACY_KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}
