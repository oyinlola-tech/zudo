import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

/**
 * Creates a random salt.
 */
export async function generateSalt(
  length = 16,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  if (!Number.isInteger(length) || length < 16) {
    throw new RangeError(
      "Salt length must be an integer of at least 16 bytes.",
    );
  }

  return provider.randomBytes(length);
}
