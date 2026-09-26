import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";
import { assertRandomCapability } from "../cryptoProvider/cryptoProvider.capability.js";
import { keyDerivationError } from "../cryptoErrors/cryptoErrors.helper.js";

/**
 * Creates a random salt of `length` bytes (default 16).
 *
 * @throws {CryptoError} `CRYPTO_DERIVATION` when `length` is not an integer
 *   of at least 16.
 */
export async function generateSalt(
  length = 16,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  assertRandomCapability(provider);

  if (!Number.isInteger(length) || length < 16) {
    throw keyDerivationError(
      "Salt length must be an integer of at least 16 bytes.",
      undefined,
    );
  }

  return provider.randomBytes(length);
}
