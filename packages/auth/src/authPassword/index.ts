/**
 * Password hashing and verification utilities.
 *
 * @module authPassword
 */

export {
  hashPassword,
  verifyPassword,
  needsRehash,
  generateRandomToken,
  MIN_SALT_LENGTH,
  MAX_SALT_LENGTH,
  MAX_PASSWORD_BYTES,
} from "./authPassword.core.js";
