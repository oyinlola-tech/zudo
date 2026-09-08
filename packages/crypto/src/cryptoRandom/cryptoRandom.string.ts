import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

function assertLength(length: number, name = "length"): void {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

/**
 * Generates a cryptographically secure random hexadecimal string.
 */
export async function randomHex(
  length: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertLength(length);

  const bytes = await provider.randomBytes(Math.ceil(length / 2));

  return Buffer.from(bytes).toString("hex").slice(0, length);
}

/**
 * Generates a cryptographically secure random base64 string.
 */
export async function randomBase64(
  byteLength: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertLength(byteLength, "byteLength");

  const bytes = await provider.randomBytes(byteLength);

  return Buffer.from(bytes).toString("base64");
}

/**
 * Generates a cryptographically secure URL-safe random string.
 */
export async function randomBase64Url(
  byteLength: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertLength(byteLength, "byteLength");

  const bytes = await provider.randomBytes(byteLength);

  return Buffer.from(bytes).toString("base64url");
}

/**
 * Generates a random token suitable for use as an opaque identifier.
 *
 * The returned token contains only URL-safe characters.
 */
export async function randomToken(
  byteLength = 32,
  provider?: CryptoProvider,
): Promise<string> {
  return randomBase64Url(byteLength, provider);
}

/**
 * Generates a random numeric code.
 *
 * Leading zeroes are preserved. Each digit is drawn uniformly.
 */
export async function randomNumericCode(
  length = 6,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertLength(length);

  return randomFromAlphabet(length, "0123456789", provider);
}

/**
 * Generates a random alphanumeric token.
 */
export async function randomAlphanumeric(
  length: number,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  return randomFromAlphabet(
    length,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    provider,
  );
}

/**
 * Generates random characters from a caller-provided alphabet.
 *
 * `length` counts Unicode code points (so astral characters count once),
 * the alphabet must not be empty, and each character is drawn uniformly.
 */
export async function randomFromAlphabet(
  length: number,
  alphabet: string,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertLength(length);

  if (typeof alphabet !== "string" || alphabet.length === 0) {
    throw new RangeError("alphabet must not be empty.");
  }

  const characters = Array.from(alphabet);

  const result: string[] = [];

  while (result.length < length) {
    const index = await provider.randomInt(0, characters.length);

    result.push(characters[index]!);
  }

  return result.join("");
}
