import {
  toBase64Url,
  fromBase64Url,
} from "../../cryptoEncoding/encoding/cryptoEncoding.base64url.js";

/**
 * Converts bytes into URL-safe Base64 without padding. Alias of `toBase64Url`.
 */
export const bytesToBase64Url: (value: Uint8Array) => string = toBase64Url;

/**
 * Converts URL-safe Base64 into bytes. Alias of `fromBase64Url`.
 */
export const base64UrlToBytes: (value: string) => Uint8Array = fromBase64Url;
