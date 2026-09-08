import type { CryptoProvider } from "../../cryptoProvider/index.js";

import type {
  TokenOptions,
  TokenEncoding,
} from "../../cryptoToken/cryptoToken.core.js";

import {
  generateToken,
  generateOtp,
} from "../../cryptoToken/cryptoToken.core.js";

import {
  hashToken,
  verifyTokenHash,
} from "../../cryptoToken/cryptoToken.hash.js";

import { CryptoOperation } from "@zudojs/errors";

import {
  hashError,
  operationError,
  rethrowAsCryptoError,
} from "../../cryptoErrors/cryptoErrors.helper.js";

export type { TokenOptions, TokenEncoding };

export async function serviceGenerateToken(
  options?: TokenOptions,
  provider?: CryptoProvider,
): Promise<string> {
  try {
    return await generateToken({
      ...options,
      provider: options?.provider ?? provider,
    });
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError("Token generation failed.", CryptoOperation.RANDOM, cause),
    );
  }
}

export async function serviceGenerateOtp(
  digits = 6,
  provider?: CryptoProvider,
): Promise<string> {
  try {
    return await generateOtp(digits, provider);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError("OTP generation failed.", CryptoOperation.RANDOM, cause),
    );
  }
}

export async function serviceHashToken(
  token: string,
  provider?: CryptoProvider,
): Promise<string> {
  try {
    return await hashToken(token, provider);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      hashError("Token hashing failed.", "sha256", cause),
    );
  }
}

/**
 * Verifies a token against its stored hash. Mismatches and malformed
 * hashes yield false; non-string arguments throw.
 */
export async function serviceVerifyToken(
  token: string,
  expectedHash: string,
  provider?: CryptoProvider,
): Promise<boolean> {
  if (typeof token !== "string") {
    throw new TypeError("Token must be a string.");
  }

  if (typeof expectedHash !== "string") {
    throw new TypeError("Expected token hash must be a string.");
  }

  try {
    return await verifyTokenHash(token, expectedHash, provider);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      hashError("Token verification failed.", "sha256", cause),
    );
  }
}
