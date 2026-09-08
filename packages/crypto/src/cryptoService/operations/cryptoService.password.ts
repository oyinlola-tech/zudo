import type { CryptoProvider } from "../../cryptoProvider/index.js";

import type {
  PasswordHashOptions,
  PasswordHashResult,
} from "../../cryptoPassword/cryptoPassword.type.js";

import {
  hashPassword,
  verifyPassword,
} from "../../cryptoPassword/cryptoPassword.core.js";

import { CryptoOperation } from "@zudojs/errors";

import {
  operationError,
  rethrowAsCryptoError,
} from "../../cryptoErrors/cryptoErrors.helper.js";

export type { PasswordHashOptions, PasswordHashResult };

export async function serviceHashPassword(
  password: string,
  options?: PasswordHashOptions,
  provider?: CryptoProvider,
): Promise<PasswordHashResult> {
  try {
    return await hashPassword(password, { ...options, provider });
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError(
        "Password hashing failed.",
        CryptoOperation.KEY_DERIVATION,
        cause,
      ),
    );
  }
}

/**
 * Verifies a password. Wrong passwords and malformed hashes yield false;
 * non-string arguments are programmer errors and throw.
 */
export async function serviceVerifyPassword(
  password: string,
  encodedHash: string,
  provider?: CryptoProvider,
): Promise<boolean> {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  if (typeof encodedHash !== "string") {
    throw new TypeError("Encoded password hash must be a string.");
  }

  try {
    return await verifyPassword(password, encodedHash, provider);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      operationError(
        "Password verification failed.",
        CryptoOperation.VERIFY_HASH,
        cause,
      ),
    );
  }
}
