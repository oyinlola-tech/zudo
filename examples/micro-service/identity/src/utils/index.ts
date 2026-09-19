import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generates a unique identifier using UUID v4.
 */
export function generateId(): string {
  return randomUUID();
}

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Hashes a plaintext password using scrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Compares a plaintext password against a stored hash.
 */
export async function comparePassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hashHex] = storedHash.split(":");
    if (!salt || !hashHex) {
      resolve(false);
      return;
    }
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      const hashBuffer = Buffer.from(hashHex, "hex");
      resolve(
        derivedKey.length === hashBuffer.length &&
          timingSafeEqual(derivedKey, hashBuffer),
      );
    });
  });
}
