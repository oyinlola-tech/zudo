import { toHex, fromHex } from "../../cryptoEncoding/encoding/cryptoEncoding.hex.js";

/**
 * Converts bytes into a hexadecimal string. Alias of `toHex`.
 */
export const bytesToHex: (value: Uint8Array) => string = toHex;

/**
 * Converts a hexadecimal string into bytes. Alias of `fromHex`.
 */
export const hexToBytes: (value: string) => Uint8Array = fromHex;
