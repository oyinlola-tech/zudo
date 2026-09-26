import type { KeyObject } from "node:crypto";

import type {
  CryptoInput,
  SignatureAlgorithm,
} from "../cryptoProvider.type.js";

/**
 * Key material accepted by `sign`/`verify`: PEM text, DER bytes (PKCS#8 for
 * private keys, SPKI for public keys) or a Node `KeyObject` such as the ones
 * `generateEd25519KeyPair()` returns.
 */
export type SignatureKeyMaterial = CryptoInput | KeyObject;

/**
 * Options for signing.
 */
export interface SignOptions {
  readonly key: SignatureKeyMaterial;
  readonly data: CryptoInput;
  readonly algorithm?: SignatureAlgorithm;
}

/**
 * Options for verification.
 */
export interface VerifyOptions {
  readonly key: SignatureKeyMaterial;
  readonly data: CryptoInput;
  readonly signature: Uint8Array;
  readonly algorithm?: SignatureAlgorithm;
}
