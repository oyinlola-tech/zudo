import { toHex, fromHex } from "./encoding/cryptoEncoding.hex.js";

import { toBase64, fromBase64 } from "./encoding/cryptoEncoding.base64.js";

import {
  toBase64Url,
  fromBase64Url,
} from "./encoding/cryptoEncoding.base64url.js";

/**
 * Supported binary encodings.
 *
 * `utf8` is a text encoding, not a binary one: `encode(bytes, "utf8")`
 * throws when the bytes are not valid UTF-8 rather than producing
 * replacement characters.
 */
export type CryptoEncoding = "hex" | "base64" | "base64url" | "utf8";

/**
 * Binary-safe encodings (every byte sequence round-trips).
 */
export type BinaryEncoding = Exclude<CryptoEncoding, "utf8">;

const CRYPTO_ENCODINGS: ReadonlySet<string> = new Set([
  "hex",
  "base64",
  "base64url",
  "utf8",
]);

const BINARY_ENCODINGS: ReadonlySet<string> = new Set([
  "hex",
  "base64",
  "base64url",
]);

/**
 * Returns whether a value names a supported encoding.
 */
export function isCryptoEncoding(value: unknown): value is CryptoEncoding {
  return typeof value === "string" && CRYPTO_ENCODINGS.has(value);
}

/**
 * Returns whether a value names a binary-safe encoding.
 */
export function isBinaryEncoding(value: unknown): value is BinaryEncoding {
  return typeof value === "string" && BINARY_ENCODINGS.has(value);
}

/**
 * Asserts that a value names a binary-safe encoding.
 */
export function assertBinaryEncoding(
  value: unknown,
): asserts value is BinaryEncoding {
  if (!isBinaryEncoding(value)) {
    throw new TypeError(
      `Unsupported binary encoding: ${String(value)}. Use hex, base64 or base64url.`,
    );
  }
}

/**
 * Encodes bytes into a string.
 */
export function encode(
  value: Uint8Array,
  encoding: CryptoEncoding = "base64url",
): string {
  assertBytes(value);

  switch (encoding) {
    case "hex":
      return toHex(value);

    case "base64":
      return toBase64(value);

    case "base64url":
      return toBase64Url(value);

    case "utf8":
      return utf8Decode(value);

    default:
      throw new TypeError(`Unsupported crypto encoding: ${String(encoding)}.`);
  }
}

/**
 * Decodes a string into bytes.
 */
export function decode(
  value: string,
  encoding: CryptoEncoding = "base64url",
): Uint8Array {
  if (typeof value !== "string") {
    throw new TypeError("Encoded value must be a string.");
  }

  switch (encoding) {
    case "hex":
      return fromHex(value);

    case "base64":
      return fromBase64(value);

    case "base64url":
      return fromBase64Url(value);

    case "utf8":
      return utf8Encode(value);

    default:
      throw new TypeError(`Unsupported crypto encoding: ${String(encoding)}.`);
  }
}

/**
 * Encodes UTF-8 text into bytes.
 */
export function utf8Encode(value: string): Uint8Array {
  if (typeof value !== "string") {
    throw new TypeError("UTF-8 input must be a string.");
  }

  return new TextEncoder().encode(value);
}

/**
 * Decodes UTF-8 bytes into a string.
 *
 * Throws when the bytes are not well-formed UTF-8.
 */
export function utf8Decode(value: Uint8Array): string {
  assertBytes(value);

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch (error) {
    throw new TypeError("Value is not valid UTF-8.", { cause: error });
  }
}

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Value must be a Uint8Array.");
  }
}
