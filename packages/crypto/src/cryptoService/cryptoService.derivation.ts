import type {
  CryptoProvider,
  DerivedKeyResult,
} from "../cryptoProvider/index.js";

import type {
  Pbkdf2Options,
  ScryptOptions,
} from "../cryptoKeyDerivation/cryptoKeyDerivation.type.js";

import { deriveKey } from "../cryptoKeyDerivation/cryptoKeyDerivation.core.js";

import {
  keyDerivationError,
  rethrowAsCryptoError,
} from "../cryptoErrors/cryptoErrors.helper.js";

import type { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

export type { DerivedKeyResult, Pbkdf2Options, ScryptOptions };

export async function serviceDeriveKey(
  password: string | Uint8Array,
  algorithm: CryptoAlgorithm,
  options?: Pbkdf2Options | ScryptOptions,
  provider?: CryptoProvider,
): Promise<DerivedKeyResult> {
  try {
    return await deriveKey(password, algorithm, {
      ...options,
      provider: options?.provider ?? provider,
    });
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      keyDerivationError("Key derivation failed.", algorithm, cause),
    );
  }
}
