import type {
  CryptoInput,
  SignatureAlgorithm,
} from "../cryptoProvider.type.js";

/**
 * Options for signing.
 */
export interface SignOptions {
  readonly key: CryptoInput;
  readonly data: CryptoInput;
  readonly algorithm?: SignatureAlgorithm;
}

/**
 * Options for verification.
 */
export interface VerifyOptions {
  readonly key: CryptoInput;
  readonly data: CryptoInput;
  readonly signature: Uint8Array;
  readonly algorithm?: SignatureAlgorithm;
}
