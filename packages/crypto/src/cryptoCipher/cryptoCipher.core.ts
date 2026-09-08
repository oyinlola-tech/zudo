import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import { AES_GCM } from "../cryptoConstants/cryptoConstants.type.js";

import { CryptoOperation } from "@zudojs/errors";

import { cipherError } from "../cryptoErrors/cryptoErrors.helper.js";

/**
 * Options used when encrypting data.
 *
 * `iv`, when supplied, must be exactly 12 bytes and MUST be unique per
 * key. Reusing an IV under the same key with AES-GCM leaks the XOR of the
 * plaintexts and allows authentication-key recovery; omit it to have a
 * fresh random IV drawn for every call.
 */
export interface CipherOptions {
  readonly iv?: Uint8Array;
  readonly aad?: Uint8Array;
  readonly provider?: CryptoProvider;
}

/**
 * Authenticated encryption result.
 */
export interface CipherResult {
  readonly algorithm: string;
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
}

/**
 * Encrypts data using AES-256-GCM.
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  options: CipherOptions = {},
): Promise<CipherResult> {
  if (options.iv !== undefined && options.iv.byteLength !== AES_GCM.IV_BYTES) {
    throw cipherError(
      `AES-256-GCM iv must be ${AES_GCM.IV_BYTES} bytes.`,
      CryptoOperation.ENCRYPT,
      "aes-256-gcm",
    );
  }

  const provider = options.provider ?? getDefaultCryptoProvider();

  const encrypted = await provider.encrypt({
    key,
    plaintext,
    associatedData: options.aad,
    nonce: options.iv,
  });

  return Object.freeze({
    algorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.nonce,
    authTag: encrypted.tag,
  });
}

/**
 * Decrypts AES-256-GCM ciphertext.
 *
 * The IV must be 12 bytes and the authentication tag 16 bytes; truncated
 * tags are rejected before the cipher is touched.
 */
export async function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  aad?: Uint8Array,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  if (!(iv instanceof Uint8Array) || iv.byteLength !== AES_GCM.IV_BYTES) {
    throw cipherError(
      `AES-256-GCM iv must be ${AES_GCM.IV_BYTES} bytes.`,
      CryptoOperation.DECRYPT,
      "aes-256-gcm",
    );
  }

  if (
    !(authTag instanceof Uint8Array) ||
    authTag.byteLength !== AES_GCM.AUTH_TAG_BYTES
  ) {
    throw cipherError(
      `AES-256-GCM authentication tag must be ${AES_GCM.AUTH_TAG_BYTES} bytes.`,
      CryptoOperation.DECRYPT,
      "aes-256-gcm",
    );
  }

  return provider.decrypt({
    key,
    encrypted: {
      algorithm: "aes-256-gcm",
      ciphertext,
      nonce: iv,
      tag: authTag,
    },
    associatedData: aad,
  });
}
