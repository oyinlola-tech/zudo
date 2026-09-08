import {
  toBase64,
  fromBase64,
} from "../../cryptoEncoding/encoding/cryptoEncoding.base64.js";

/**
 * Converts bytes into Base64. Alias of `toBase64`.
 */
export const bytesToBase64: (value: Uint8Array) => string = toBase64;

/**
 * Converts Base64 into bytes. Alias of `fromBase64`.
 */
export const base64ToBytes: (value: string) => Uint8Array = fromBase64;
