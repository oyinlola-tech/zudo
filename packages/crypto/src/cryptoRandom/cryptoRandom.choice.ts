import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

/**
 * Generates a cryptographically secure random boolean.
 */
export async function randomBoolean(
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<boolean> {
  return (await provider.randomInt(0, 2)) === 1;
}

/**
 * Generates a random value from a collection.
 *
 * A single-element collection returns that element.
 */
export async function randomChoice<T>(
  values: readonly T[],
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<T> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError("Cannot choose from an empty collection.");
  }

  return values[await provider.randomInt(0, values.length)]!;
}

/**
 * Fills an existing Uint8Array with cryptographically secure
 * random bytes.
 */
export async function fillRandomBytes(
  target: Uint8Array,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  if (!(target instanceof Uint8Array)) {
    throw new TypeError("target must be a Uint8Array.");
  }

  if (target.byteLength === 0) {
    return target;
  }

  const bytes = await provider.randomBytes(target.byteLength);

  target.set(bytes);

  return target;
}
