import type { HashEncoding } from "./cryptoHash.core.js";

import { toHex, fromHex } from "../cryptoEncoding/encoding/cryptoEncoding.hex.js";
import {
  toBase64,
  fromBase64,
} from "../cryptoEncoding/encoding/cryptoEncoding.base64.js";
import {
  toBase64Url,
  fromBase64Url,
} from "../cryptoEncoding/encoding/cryptoEncoding.base64url.js";

/**
 * Converts a hash result into its encoded representation.
 */
export function encodeDigest(
  digest: Uint8Array,
  encoding: HashEncoding,
): string {
  switch (encoding) {
    case "hex":
      return toHex(digest);
    case "base64":
      return toBase64(digest);
    case "base64url":
      return toBase64Url(digest);
    default:
      throw new TypeError(`Unsupported hash encoding: ${String(encoding)}.`);
  }
}

/**
 * Decodes a hash string into bytes.
 *
 * Input must be a non-empty, canonical encoding.
 */
export function decodeDigest(
  digest: string,
  encoding: HashEncoding = "hex",
): Uint8Array {
  if (typeof digest !== "string" || digest.length === 0) {
    throw new TypeError("Digest must be a non-empty string.");
  }

  switch (encoding) {
    case "hex":
      return fromHex(digest);
    case "base64":
      return fromBase64(digest);
    case "base64url":
      return fromBase64Url(digest);
    default:
      throw new TypeError(`Unsupported hash encoding: ${String(encoding)}.`);
  }
}
