import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import { encode } from "../cryptoEncoding/cryptoEncoding.core.js";

import { isHex } from "../cryptoEncoding/encoding/cryptoEncoding.hex.js";

import { timingSafeEqual } from "../compare/compare.helper.js";

import type { CryptoProvider } from "../cryptoProvider/index.js";

/**
 * Creates a deterministic SHA-256 identifier from a token.
 *
 * The returned value does not expose the original token.
 */
export async function hashToken(
  token: string,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertToken(token);

  const digest = await provider.hash("sha256", token);

  return encode(digest, "hex");
}

/**
 * Creates a Base64URL SHA-256 digest of a token.
 */
export async function hashTokenBase64Url(
  token: string,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<string> {
  assertToken(token);

  const digest = await provider.hash("sha256", token);

  return encode(digest, "base64url");
}

/**
 * Compares a token with a stored hex SHA-256 hash.
 *
 * The comparison is constant time and case-insensitive on the hex digits,
 * so hashes upper-cased by a database or copied from another tool still
 * match. Returns false for a malformed token or stored hash.
 */
export async function verifyTokenHash(
  token: string,
  expectedHash: string,
  provider?: CryptoProvider,
): Promise<boolean> {
  if (typeof expectedHash !== "string" || !isHex(expectedHash)) {
    return false;
  }

  try {
    const actual = await hashToken(token, provider);

    return timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(expectedHash.toLowerCase(), "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Hashes a token using SHA-256 before storage.
 *
 * This is useful when a raw bearer token must never be persisted.
 */
export async function hashTokenForStorage(
  token: string,
  provider?: CryptoProvider,
): Promise<string> {
  return hashToken(token, provider);
}

/**
 * Validates the basic shape of an opaque token.
 */
function assertToken(token: string): void {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Token must be a non-empty string.");
  }
}
