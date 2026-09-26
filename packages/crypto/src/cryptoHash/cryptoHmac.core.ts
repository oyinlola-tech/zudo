import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";
import { assertHmacCapability } from "../cryptoProvider/cryptoProvider.capability.js";

import type {
  CryptoProvider,
  HmacAlgorithm,
  HashEncoding,
} from "../cryptoProvider/index.js";

import { isHmacAlgorithmName } from "../cryptoProvider/cryptoProvider.type.js";

import { KEY_SIZE } from "../cryptoConstants/cryptoConstants.type.js";

import { hashError } from "../cryptoErrors/cryptoErrors.helper.js";

import type { HashInput } from "./cryptoHash.core.js";

import { encodeDigest } from "./cryptoHash.codec.js";

/**
 * Calculates a keyed HMAC.
 *
 * The key is raw bytes, not text: a string secret must be encoded first
 * (`new TextEncoder().encode(secret)` or `Buffer.from(secret, "utf8")`), and
 * it must be at least `KEY_SIZE.MIN_HMAC_KEY_BYTES` (16) bytes so that a
 * missing or empty secret cannot silently produce forgeable tags.
 *
 * @throws {TypeError} when the key is not a `Uint8Array` or the algorithm
 *   name is unknown (argument-shape errors).
 * @throws {CryptoError} `CRYPTO_HASH` when the key is shorter than
 *   `KEY_SIZE.MIN_HMAC_KEY_BYTES`.
 */
export async function hmac(
  input: HashInput,
  key: Uint8Array,
  algorithm: HmacAlgorithm = "sha256",
  encoding: HashEncoding = "hex",
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  if (!isHmacAlgorithmName(algorithm)) {
    throw new TypeError(`Unsupported HMAC algorithm: ${String(algorithm)}.`);
  }

  if (!(key instanceof Uint8Array)) {
    throw new TypeError(
      "HMAC key must be a Uint8Array of raw key bytes" +
        (typeof key === "string"
          ? '; encode a string secret first, e.g. new TextEncoder().encode(secret) or Buffer.from(secret, "utf8").'
          : "."),
    );
  }

  if (key.byteLength < KEY_SIZE.MIN_HMAC_KEY_BYTES) {
    throw hashError(
      `HMAC key must be at least ${KEY_SIZE.MIN_HMAC_KEY_BYTES} bytes, received ${key.byteLength}.`,
      `hmac-${algorithm}`,
    );
  }

  assertHmacCapability(provider);

  const digest = await provider.hmac(algorithm, key, input);

  return encodeDigest(digest, encoding);
}

/**
 * Calculates a SHA-256 HMAC.
 */
export async function hmacSha256(
  input: HashInput,
  key: Uint8Array,
  encoding: HashEncoding = "hex",
  provider?: CryptoProvider,
): Promise<string> {
  return hmac(input, key, "sha256", encoding, provider);
}

/**
 * Calculates a SHA-384 HMAC.
 */
export async function hmacSha384(
  input: HashInput,
  key: Uint8Array,
  encoding: HashEncoding = "hex",
  provider?: CryptoProvider,
): Promise<string> {
  return hmac(input, key, "sha384", encoding, provider);
}

/**
 * Calculates a SHA-512 HMAC.
 */
export async function hmacSha512(
  input: HashInput,
  key: Uint8Array,
  encoding: HashEncoding = "hex",
  provider?: CryptoProvider,
): Promise<string> {
  return hmac(input, key, "sha512", encoding, provider);
}
