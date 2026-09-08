import type { CryptoEncoding } from "../cryptoEncoding/cryptoEncoding.core.js";

import { encode, decode } from "../cryptoEncoding/cryptoEncoding.core.js";

import { CryptoOperation } from "@zudojs/errors";

import {
  operationError,
  rethrowAsCryptoError,
} from "../cryptoErrors/cryptoErrors.helper.js";

export type { CryptoEncoding };

export function serviceEncode(
  value: Uint8Array,
  encoding: CryptoEncoding = "base64url",
): string {
  try {
    return encode(value, encoding);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError("Crypto encoding failed.", CryptoOperation.ENCODE, cause),
    );
  }
}

export function serviceDecode(
  value: string,
  encoding: CryptoEncoding = "base64url",
): Uint8Array {
  try {
    return decode(value, encoding);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError("Crypto decoding failed.", CryptoOperation.DECODE, cause),
    );
  }
}
