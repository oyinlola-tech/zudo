/**
 * Rehash detection for stored password hashes.
 *
 * @module authPassword/authPassword.rehash
 */

import {
  CryptoAlgorithm,
  decodePasswordHash,
  getDefaultPasswordHashOptions,
} from "@zudojs/crypto";
import {
  KEY_LENGTH,
  SALT_LENGTH,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R,
} from "./authPassword.policy.js";

/**
 * Salt and key lengths a current hash may have: the ones this package's
 * `hashPassword()` writes, and the ones `@zudojs/crypto`'s `hashPassword()`
 * writes with its own defaults. Both use the same scrypt N, r and p, and
 * both are current — flagging a crypto-default hash made every login
 * rewrite it for nothing.
 */
function currentLengths(): ReadonlyArray<readonly [number, number]> {
  const crypto = getDefaultPasswordHashOptions();
  return [
    [SALT_LENGTH, KEY_LENGTH],
    [crypto.saltBytes, crypto.keyBytes],
  ];
}

/**
 * Check if a password hash needs rehashing: every hash that is not a
 * `@zudojs/crypto` scrypt hash with the current parameters. Current means
 * N, r and p equal to this package's policy, with the salt and key lengths
 * either this package writes (32/64 bytes) or `@zudojs/crypto` writes by
 * default (16/32 bytes). All legacy `scrypt$…` hashes return `true`.
 *
 * @param hashedPassword - The stored hash
 * @returns Whether the hash should be regenerated
 */
export function needsRehash(hashedPassword: string): boolean {
  if (typeof hashedPassword !== "string") return true;
  try {
    const decoded = decodePasswordHash(hashedPassword);
    if (decoded.algorithm !== CryptoAlgorithm.SCRYPT) return true;
    if (
      decoded.cost !== SCRYPT_N ||
      decoded.blockSize !== SCRYPT_R ||
      decoded.parallelization !== SCRYPT_P
    ) {
      return true;
    }
    return !currentLengths().some(
      ([salt, key]) =>
        decoded.salt.byteLength === salt && decoded.hash.byteLength === key,
    );
  } catch {
    return true;
  }
}
