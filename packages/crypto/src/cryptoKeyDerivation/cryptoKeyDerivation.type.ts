import type {
  CryptoProvider,
  Pbkdf2Digest,
} from "../cryptoProvider/index.js";

/**
 * Options for PBKDF2 key derivation.
 */
export interface Pbkdf2Options {
  readonly iterations?: number;
  readonly keyLength?: number;
  readonly digest?: Pbkdf2Digest;
  readonly salt?: Uint8Array;
  readonly saltLength?: number;
  readonly provider?: CryptoProvider;
}

/**
 * Options for scrypt key derivation.
 */
export interface ScryptOptions {
  readonly keyLength?: number;
  readonly cost?: number;
  readonly blockSize?: number;
  readonly parallelization?: number;
  readonly salt?: Uint8Array;
  readonly saltLength?: number;
  /** Memory upper bound in bytes; defaults to a value derived from cost/blockSize/parallelization. */
  readonly maxMemory?: number;
  readonly provider?: CryptoProvider;
}
