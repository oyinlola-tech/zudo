import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import type {
  CryptoProvider,
  HmacAlgorithm,
  HashEncoding,
} from "../cryptoProvider/index.js";

import { isHmacAlgorithmName } from "../cryptoProvider/cryptoProvider.type.js";

import { KEY_SIZE } from "../cryptoConstants/cryptoConstants.type.js";

import type { HashInput } from "./cryptoHash.core.js";

import { encodeDigest } from "./cryptoHash.codec.js";

/**
 * Calculates a keyed HMAC.
 *
 * The key must be at least `KEY_SIZE.MIN_HMAC_KEY_BYTES` (16) bytes so
 * that a missing or empty secret cannot silently produce forgeable tags.
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
    throw new TypeError("HMAC key must be a Uint8Array.");
  }

  if (key.byteLength < KEY_SIZE.MIN_HMAC_KEY_BYTES) {
    throw new RangeError(
      `HMAC key must be at least ${KEY_SIZE.MIN_HMAC_KEY_BYTES} bytes.`,
    );
  }

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
