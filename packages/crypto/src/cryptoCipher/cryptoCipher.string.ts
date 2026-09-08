import type { CryptoProvider } from "../cryptoProvider/index.js";

import type { CipherOptions, CipherResult } from "./cryptoCipher.core.js";

import { encrypt, decrypt } from "./cryptoCipher.core.js";

/**
 * Encrypts a UTF-8 string using AES-256-GCM.
 */
export async function encryptString(
  plaintext: string,
  key: Uint8Array,
  options: CipherOptions = {},
): Promise<CipherResult> {
  return encrypt(new Uint8Array(Buffer.from(plaintext, "utf8")), key, options);
}

/**
 * Decrypts AES-256-GCM ciphertext into a UTF-8 string.
 */
export async function decryptString(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  aad?: Uint8Array,
  provider?: CryptoProvider,
): Promise<string> {
  const plaintext = await decrypt(ciphertext, key, iv, authTag, aad, provider);

  return Buffer.from(plaintext).toString("utf8");
}
