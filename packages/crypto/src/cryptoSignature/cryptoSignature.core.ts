import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import type { CryptoInput } from "../cryptoProvider/index.js";

import type { SignatureAlgorithm } from "../cryptoProvider/index.js";

/**
 * Signature options.
 *
 * The algorithm binds the key type: RSA algorithms require RSA keys,
 * ECDSA algorithms require EC keys and `ed25519` requires an Ed25519 key.
 */
export type SignatureOptions = {
  readonly algorithm?: SignatureAlgorithm;
  readonly provider?: CryptoProvider;
};

/**
 * Signs arbitrary data using a private key (PEM text, DER bytes or KeyObject).
 */
export async function sign(
  data: Uint8Array,
  privateKey: CryptoInput,
  options: SignatureOptions = {},
): Promise<Uint8Array> {
  const provider = options.provider ?? getDefaultCryptoProvider();

  return provider.sign({
    key: privateKey,
    data,
    algorithm: options.algorithm ?? "ed25519",
  });
}

/**
 * Verifies a signature using a public key.
 *
 * Returns false for malformed keys or signatures; throws only when the
 * algorithm is unsupported or incompatible with the key type.
 */
export async function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoInput,
  options: SignatureOptions = {},
): Promise<boolean> {
  const provider = options.provider ?? getDefaultCryptoProvider();

  return provider.verify({
    key: publicKey,
    data,
    signature,
    algorithm: options.algorithm ?? "ed25519",
  });
}

/**
 * Signs UTF-8 text.
 */
export async function signString(
  data: string,
  privateKey: CryptoInput,
  options: SignatureOptions = {},
): Promise<Uint8Array> {
  return sign(Buffer.from(data, "utf8"), privateKey, options);
}

/**
 * Verifies a signature against UTF-8 text.
 */
export async function verifyString(
  data: string,
  signature: Uint8Array,
  publicKey: CryptoInput,
  options: SignatureOptions = {},
): Promise<boolean> {
  return verify(Buffer.from(data, "utf8"), signature, publicKey, options);
}
