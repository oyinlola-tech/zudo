/**
 * Rehash detection for stored password hashes.
 *
 * @module authPassword/authPassword.rehash
 */

import { CryptoAlgorithm, decodePasswordHash } from "@zudojs/crypto";
import {
  KEY_LENGTH,
  SALT_LENGTH,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R,
} from "./authPassword.policy.js";

/**
 * Check if a password hash needs rehashing: every hash that is not a
 * `@zudojs/crypto` scrypt hash with the current parameters (N, r, p, salt
 * and key length). All legacy `scrypt$…` hashes return `true`.
 *
 * @param hashedPassword - The stored hash
 * @returns Whether the hash should be regenerated
 */
export function needsRehash(hashedPassword: string): boolean {
  if (typeof hashedPassword !== "string") return true;
  try {
    const decoded = decodePasswordHash(hashedPassword);
    if (decoded.algorithm !== CryptoAlgorithm.SCRYPT) return true;
    return (
      decoded.salt.byteLength !== SALT_LENGTH ||
      decoded.hash.byteLength !== KEY_LENGTH ||
      decoded.cost !== SCRYPT_N ||
      decoded.blockSize !== SCRYPT_R ||
      decoded.parallelization !== SCRYPT_P
    );
  } catch {
    return true;
  }
}
