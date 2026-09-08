import type {
  HashAlgorithm,
  HmacAlgorithm,
} from "../../cryptoProvider/index.js";

/**
 * Normalizes any `CryptoInput` into bytes (strings are UTF-8 encoded).
 */
export function toBytes(input: Uint8Array | string | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (typeof input === "string") {
    return new Uint8Array(Buffer.from(input, "utf8"));
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  throw new TypeError("Input must be a string, Uint8Array, or ArrayBuffer.");
}

const NODE_HASH_ALGORITHMS: Readonly<Record<string, string>> = Object.freeze({
  sha256: "sha256",
  sha384: "sha384",
  sha512: "sha512",
  "sha3-256": "sha3-256",
  "sha3-384": "sha3-384",
  "sha3-512": "sha3-512",
});

/**
 * Maps a package hash algorithm name to the OpenSSL digest name.
 *
 * Only the allowlisted algorithms are accepted; anything else (md5, sha1,
 * arbitrary strings from configuration) throws.
 */
export function nodeHashAlgorithm(
  algorithm: HashAlgorithm | HmacAlgorithm,
): string {
  const name =
    typeof algorithm === "string" ? NODE_HASH_ALGORITHMS[algorithm] : undefined;

  if (name === undefined) {
    throw new TypeError(`Unsupported hash algorithm: ${String(algorithm)}.`);
  }

  return name;
}
