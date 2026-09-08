import type { CryptoProvider } from "../../cryptoProvider/index.js";

import type {
  CipherOptions,
  CipherResult,
} from "../../cryptoCipher/cryptoCipher.core.js";

import { encrypt, decrypt } from "../../cryptoCipher/cryptoCipher.core.js";

import { CryptoOperation } from "@zudojs/errors";

import {
  cipherError,
  rethrowAsCryptoError,
} from "../../cryptoErrors/cryptoErrors.helper.js";

export type { CipherOptions, CipherResult };

export async function serviceEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  options?: CipherOptions,
  provider?: CryptoProvider,
): Promise<CipherResult> {
  try {
    return await encrypt(plaintext, key, {
      ...options,
      provider: options?.provider ?? provider,
    });
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      cipherError(
        "Encryption failed.",
        CryptoOperation.ENCRYPT,
        "aes-256-gcm",
        cause,
      ),
    );
  }
}

export async function serviceDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  aad?: Uint8Array,
  provider?: CryptoProvider,
): Promise<Uint8Array> {
  try {
    return await decrypt(ciphertext, key, iv, authTag, aad, provider);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      cipherError(
        "Decryption failed.",
        CryptoOperation.DECRYPT,
        "aes-256-gcm",
        cause,
      ),
    );
  }
}
