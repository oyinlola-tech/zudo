import type {
  CryptoInput,
  EncryptionAlgorithm,
} from "../cryptoProvider.type.js";

/**
 * Result of an encryption operation.
 */
export interface EncryptedData {
  readonly algorithm: EncryptionAlgorithm;
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly tag: Uint8Array;
}

/**
 * Options for encryption.
 *
 * When `nonce` is supplied it must be exactly 12 bytes and MUST be unique
 * per key: reusing a nonce under the same key with AES-GCM leaks the XOR
 * of the plaintexts and allows authentication-key recovery. Omit it to
 * have the provider draw a fresh random nonce.
 */
export interface EncryptOptions {
  readonly key: CryptoInput;
  readonly plaintext: CryptoInput;
  readonly associatedData?: CryptoInput;
  readonly nonce?: Uint8Array;
}

/**
 * Options for decryption.
 */
export interface DecryptOptions {
  readonly key: CryptoInput;
  readonly encrypted: EncryptedData;
  readonly associatedData?: CryptoInput;
}
