import { isHex } from "../cryptoEncoding/encoding/cryptoEncoding.hex.js";
import { isBase64Url } from "../cryptoEncoding/encoding/cryptoEncoding.base64url.js";

/**
 * Returns whether a value is a Uint8Array.
 */
export function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/**
 * Returns whether a value is an ArrayBuffer.
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

/**
 * Returns whether a string is valid hexadecimal. Alias of `isHex`.
 */
export function isHexString(value: string): boolean {
  return isHex(value);
}

/**
 * Returns whether a string is valid, canonical Base64URL. Alias of `isBase64Url`.
 */
export function isBase64UrlString(value: string): boolean {
  return isBase64Url(value);
}
