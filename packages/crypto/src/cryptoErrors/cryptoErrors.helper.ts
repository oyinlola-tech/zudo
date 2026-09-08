import {
  CryptoError,
  CryptoOperation,
  ErrorCode,
  isCryptoError,
} from "@zudojs/errors";

/**
 * Builds a cipher error that preserves the underlying failure as `cause`.
 */
export function cipherError(
  message: string,
  operation: CryptoOperation.ENCRYPT | CryptoOperation.DECRYPT,
  algorithm: string | undefined,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_CIPHER,
    operation,
    algorithm,
    cause,
  });
}

/**
 * Builds a hashing error that preserves the underlying failure as `cause`.
 */
export function hashError(
  message: string,
  algorithm: string | undefined,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_HASH,
    operation: CryptoOperation.HASH,
    algorithm,
    cause,
  });
}

/**
 * Builds a signature error that preserves the underlying failure as `cause`.
 */
export function signatureError(
  message: string,
  operation: CryptoOperation.SIGN | CryptoOperation.VERIFY_SIGNATURE,
  algorithm: string | undefined,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_SIGNATURE,
    operation,
    algorithm,
    cause,
  });
}

/**
 * Builds a key derivation error that preserves the underlying failure as `cause`.
 */
export function keyDerivationError(
  message: string,
  algorithm: string | undefined,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_DERIVATION,
    operation: CryptoOperation.KEY_DERIVATION,
    algorithm,
    cause,
  });
}

/**
 * Builds a key error that preserves the underlying failure as `cause`.
 */
export function keyError(
  message: string,
  operation:
    | CryptoOperation.KEY_GENERATION
    | CryptoOperation.KEY_IMPORT
    | CryptoOperation.KEY_EXPORT,
  algorithm: string | undefined,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, {
    code: ErrorCode.CRYPTO_KEY,
    operation,
    algorithm,
    cause,
  });
}

/**
 * Builds a generic crypto error for an operation, preserving `cause`.
 */
export function operationError(
  message: string,
  operation: CryptoOperation,
  cause?: unknown,
): CryptoError {
  return new CryptoError(message, { operation, cause });
}

/**
 * Re-throws CryptoErrors unchanged and wraps anything else.
 */
export function rethrowAsCryptoError(
  error: unknown,
  wrap: (cause: unknown) => CryptoError,
): never {
  if (isCryptoError(error)) {
    throw error;
  }

  throw wrap(error);
}
