import type {
  EncryptedData,
  EncryptOptions,
  DecryptOptions,
} from "../../../cryptoProvider/index.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CryptoOperation } from "@zudojs/errors";
import { toBytes } from "../nodeCryptoProvider.helper.js";
import { AES_GCM } from "../../../cryptoConstants/cryptoConstants.type.js";
import { cipherError } from "../../../cryptoErrors/cryptoErrors.helper.js";

const ALGORITHM = "aes-256-gcm" as const;

/**
 * Validates the caller-controlled inputs to AES-256-GCM before they reach
 * OpenSSL, so that the error surface is uniform and short tags / odd IVs
 * are never accepted.
 */
function assertKey(
  key: Uint8Array,
  operation: CryptoOperation.ENCRYPT | CryptoOperation.DECRYPT,
): void {
  if (key.byteLength !== AES_GCM.KEY_BYTES) {
    throw cipherError(
      `AES-256-GCM key must be ${AES_GCM.KEY_BYTES} bytes.`,
      operation,
      ALGORITHM,
    );
  }
}

function assertNonce(
  nonce: Uint8Array,
  operation: CryptoOperation.ENCRYPT | CryptoOperation.DECRYPT,
): void {
  if (!(nonce instanceof Uint8Array) || nonce.byteLength !== AES_GCM.IV_BYTES) {
    throw cipherError(
      `AES-256-GCM nonce must be ${AES_GCM.IV_BYTES} bytes.`,
      operation,
      ALGORITHM,
    );
  }
}

function assertTag(tag: Uint8Array): void {
  if (
    !(tag instanceof Uint8Array) ||
    tag.byteLength !== AES_GCM.AUTH_TAG_BYTES
  ) {
    throw cipherError(
      `AES-256-GCM authentication tag must be ${AES_GCM.AUTH_TAG_BYTES} bytes.`,
      CryptoOperation.DECRYPT,
      ALGORITHM,
    );
  }
}

export async function encrypt(options: EncryptOptions): Promise<EncryptedData> {
  const key = toBytes(options.key);
  const plaintext = toBytes(options.plaintext);
  const nonce = options.nonce ?? new Uint8Array(randomBytes(AES_GCM.IV_BYTES));

  assertKey(key, CryptoOperation.ENCRYPT);
  assertNonce(nonce, CryptoOperation.ENCRYPT);

  try {
    const cipher = createCipheriv(ALGORITHM, key, nonce, {
      authTagLength: AES_GCM.AUTH_TAG_BYTES,
    });

    if (options.associatedData !== undefined) {
      cipher.setAAD(toBytes(options.associatedData));
    }

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Object.freeze({
      algorithm: ALGORITHM,
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      tag: new Uint8Array(tag),
    });
  } catch (error) {
    throw cipherError(
      "Encryption failed.",
      CryptoOperation.ENCRYPT,
      ALGORITHM,
      error,
    );
  }
}

export async function decrypt(options: DecryptOptions): Promise<Uint8Array> {
  const key = toBytes(options.key);
  const { ciphertext, nonce, tag, algorithm } = options.encrypted;

  if (algorithm !== ALGORITHM) {
    throw cipherError(
      `Unsupported encryption algorithm: ${String(algorithm)}.`,
      CryptoOperation.DECRYPT,
      typeof algorithm === "string" ? algorithm : undefined,
    );
  }

  assertKey(key, CryptoOperation.DECRYPT);
  assertNonce(nonce, CryptoOperation.DECRYPT);
  assertTag(tag);

  if (!(ciphertext instanceof Uint8Array)) {
    throw cipherError(
      "Ciphertext must be a Uint8Array.",
      CryptoOperation.DECRYPT,
      ALGORITHM,
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce, {
      authTagLength: AES_GCM.AUTH_TAG_BYTES,
    });

    if (options.associatedData !== undefined) {
      decipher.setAAD(toBytes(options.associatedData));
    }

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return new Uint8Array(decrypted);
  } catch (error) {
    throw cipherError(
      "Decryption failed.",
      CryptoOperation.DECRYPT,
      ALGORITHM,
      error,
    );
  }
}
