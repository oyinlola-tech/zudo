import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import type {
  CryptoProvider,
  HashAlgorithm,
  CryptoInput,
} from "../cryptoProvider/index.js";

import { isHashAlgorithmName } from "../cryptoProvider/cryptoProvider.type.js";

import type {
  HashResult,
  HashEncoding,
} from "../cryptoProvider/types/cryptoHash.type.js";

export type {
  HashResult,
  HashEncoding,
} from "../cryptoProvider/types/cryptoHash.type.js";

import { encodeDigest } from "./cryptoHash.codec.js";

/**
 * Converts supported input data into bytes.
 */
export type HashInput = CryptoInput;

/**
 * Options for hashing data.
 */
export interface HashOptions {
  readonly algorithm?: HashAlgorithm;
  readonly encoding?: HashEncoding;
  readonly provider?: CryptoProvider;
}

/**
 * Hashes arbitrary data using a cryptographic hash algorithm.
 *
 * Only the SHA-2 and SHA-3 family is accepted; weak digests such as md5
 * or sha1 are rejected at runtime even when passed as plain strings.
 */
export async function hash(
  input: HashInput,
  options: HashOptions = {},
): Promise<HashResult> {
  const algorithm = options.algorithm ?? "sha256";

  if (!isHashAlgorithmName(algorithm)) {
    throw new TypeError(`Unsupported hash algorithm: ${String(algorithm)}.`);
  }

  const provider = options.provider ?? getDefaultCryptoProvider();

  const digest = await provider.hash(algorithm, input);

  const encoding = options.encoding ?? "hex";

  return Object.freeze({
    algorithm,
    digest,
    encoded: encodeDigest(digest, encoding),
  });
}
