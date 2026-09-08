/**
 * Crypto error factory functions.
 */

import { ErrorCode } from "../base/types/errorCode.type.js";
import { CryptoError, CryptoOperation } from "./cryptoError.base.js";

/** Creates a hashing error. */
export function cryptoHashError(
  message = "Cryptographic hashing failed.",
  algorithm?: string,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_HASH,
    operation: CryptoOperation.HASH,
    algorithm,
  });
}

/** Creates an encryption or cipher error. */
export function cryptoCipherError(
  message = "Cryptographic encryption or decryption failed.",
  operation:
    CryptoOperation.ENCRYPT | CryptoOperation.DECRYPT = CryptoOperation.ENCRYPT,
  algorithm?: string,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_CIPHER,
    operation,
    algorithm,
  });
}

/** Creates a cryptographic signature error. */
export function cryptoSignatureError(
  message?: string,
  operation:
    | CryptoOperation.SIGN
    | CryptoOperation.VERIFY_SIGNATURE = CryptoOperation.VERIFY_SIGNATURE,
  algorithm?: string,
): CryptoError {
  const defaultMessage =
    operation === CryptoOperation.SIGN
      ? "Cryptographic signing failed."
      : "Cryptographic signature verification failed.";
  return new CryptoError(message ?? defaultMessage, {
    code: ErrorCode.CRYPTO_SIGNATURE,
    operation,
    algorithm,
  });
}

/** Creates a key derivation error. */
export function cryptoKeyDerivationError(
  message = "Cryptographic key derivation failed.",
  algorithm?: string,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_DERIVATION,
    operation: CryptoOperation.KEY_DERIVATION,
    algorithm,
  });
}

/** Creates a cryptographic key error. */
export function cryptoKeyError(
  message = "Cryptographic key operation failed.",
  operation:
    | CryptoOperation.KEY_GENERATION
    | CryptoOperation.KEY_IMPORT
    | CryptoOperation.KEY_EXPORT = CryptoOperation.KEY_GENERATION,
  algorithm?: string,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_KEY,
    operation,
    algorithm,
  });
}
