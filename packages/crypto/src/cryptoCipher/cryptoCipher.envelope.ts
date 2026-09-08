import type { CryptoProvider } from "../cryptoProvider/index.js";

import type { CipherOptions } from "./cryptoCipher.core.js";

import { encrypt, decrypt } from "./cryptoCipher.core.js";

import { AES_GCM } from "../cryptoConstants/cryptoConstants.type.js";

import { fromBase64Url } from "../cryptoEncoding/encoding/cryptoEncoding.base64url.js";

import { CryptoOperation } from "@zudojs/errors";

import { cipherError } from "../cryptoErrors/cryptoErrors.helper.js";

/**
 * Creates an encrypted envelope suitable for storage or transport.
 *
 * The format is:
 *
 * version.algorithm.iv.authTag.ciphertext
 *
 * All binary fields are canonical Base64URL encoded.
 */
export async function encryptEnvelope(
  plaintext: Uint8Array,
  key: Uint8Array,
  options: CipherOptions = {},
): Promise<string> {
  const result = await encrypt(plaintext, key, options);

  return [
    "v1",
    result.algorithm,
    Buffer.from(result.iv).toString("base64url"),
    Buffer.from(result.authTag).toString("base64url"),
    Buffer.from(result.ciphertext).toString("base64url"),
  ].join(".");
}

/**
 * Decrypts an encrypted envelope.
 *
 * Every field is validated (version, algorithm, canonical Base64URL, IV and
 * tag lengths) before the cipher is invoked; malformed envelopes and failed
 * authentication both surface as `CryptoError` with code `ERR_CRYPTO_CIPHER`.
 */
export async function decryptEnvelope(
  envelope: string,
  key: Uint8Array,
  aad?: Uint8Array,
  provider?: CryptoProvider,
): Promise<Uint8Array> {
  if (typeof envelope !== "string") {
    throw envelopeError("Encrypted envelope must be a string.");
  }

  const parts = envelope.split(".");

  if (parts.length !== 5) {
    throw envelopeError("Invalid encrypted envelope.");
  }

  const [version, algorithm, encodedIv, encodedAuthTag, encodedCiphertext] =
    parts as [string, string, string, string, string];

  if (version !== "v1") {
    throw envelopeError(`Unsupported encrypted envelope version: ${version}.`);
  }

  if (algorithm !== "aes-256-gcm") {
    throw envelopeError(`Unsupported envelope algorithm: ${algorithm}.`);
  }

  const iv = decodeField(encodedIv, "iv");
  const authTag = decodeField(encodedAuthTag, "authentication tag");
  const ciphertext = decodeField(encodedCiphertext, "ciphertext");

  if (iv.byteLength !== AES_GCM.IV_BYTES) {
    throw envelopeError(
      `Encrypted envelope iv must be ${AES_GCM.IV_BYTES} bytes.`,
    );
  }

  if (authTag.byteLength !== AES_GCM.AUTH_TAG_BYTES) {
    throw envelopeError(
      `Encrypted envelope authentication tag must be ${AES_GCM.AUTH_TAG_BYTES} bytes.`,
    );
  }

  return decrypt(ciphertext, key, iv, authTag, aad, provider);
}

function decodeField(value: string, name: string): Uint8Array {
  try {
    return fromBase64Url(value);
  } catch (error) {
    throw envelopeError(`Invalid encrypted envelope ${name}.`, error);
  }
}

function envelopeError(message: string, cause?: unknown) {
  return cipherError(message, CryptoOperation.DECRYPT, "aes-256-gcm", cause);
}
