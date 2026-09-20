import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";
import { assertRandomCapability } from "../cryptoProvider/cryptoProvider.capability.js";

/**
 * Generates cryptographically secure random bytes.
 */
export async function randomBytesSecure(
  length: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  assertRandomCapability(provider);

  return provider.randomBytes(length);
}

/**
 * Generates a cryptographically secure, uniformly distributed integer.
 *
 * The returned value is in the range:
 * min <= value < max
 *
 * Ranges up to 2^48 are supported; a range of one value returns `min`.
 */
export async function randomInteger(
  min: number,
  max: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<number> {
  assertRandomCapability(provider);

  return provider.randomInt(min, max);
}

/**
 * Generates a cryptographically secure random integer
 * from zero up to, but excluding, max.
 */
export async function randomIntegerBelow(
  max: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<number> {
  assertRandomCapability(provider);

  return provider.randomInt(0, max);
}

/**
 * Generates a random UUID v4.
 */
export async function randomUuid(
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertRandomCapability(provider);

  return provider.randomUUID();
}
