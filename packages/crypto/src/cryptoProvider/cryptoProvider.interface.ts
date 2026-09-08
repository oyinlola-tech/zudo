import type {
  HashAlgorithm,
  HmacAlgorithm,
  CryptoInput,
  CryptoCapabilities,
} from "./cryptoProvider.type.js";

import type {
  EncryptedData,
  EncryptOptions,
  DecryptOptions,
} from "./types/cryptoCipher.type.js";

import type {
  SignOptions,
  VerifyOptions,
} from "./types/cryptoSignature.type.js";

import type {
  DeriveKeyOptions,
  PasswordHashProviderOptions,
} from "./types/cryptoKeyDerivation.type.js";

/**
 * Provider for cryptographically secure random bytes.
 */
export interface RandomProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  randomBytes(length: number): Promise<Uint8Array>;
  randomInt(min: number, max: number): Promise<number>;
  randomUUID(): Promise<string>;
}

/**
 * Provider for cryptographic hashing.
 */
export interface HashProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  hash(algorithm: HashAlgorithm, data: CryptoInput): Promise<Uint8Array>;
}

/**
 * Provider for HMAC operations.
 */
export interface HmacProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  hmac(
    algorithm: HmacAlgorithm,
    key: CryptoInput,
    data: CryptoInput,
  ): Promise<Uint8Array>;
}

/**
 * Provider for symmetric encryption and decryption.
 */
export interface EncryptionProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  encrypt(options: EncryptOptions): Promise<EncryptedData>;

  decrypt(options: DecryptOptions): Promise<Uint8Array>;
}

/**
 * Provider for digital signing.
 */
export interface SigningProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  sign(options: SignOptions): Promise<Uint8Array>;

  verify(options: VerifyOptions): Promise<boolean>;
}

/**
 * Provider for key derivation.
 */
export interface KeyDerivationProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  deriveKey(options: DeriveKeyOptions): Promise<Uint8Array>;
}

/**
 * Provider for password hashing.
 */
export interface PasswordProvider {
  readonly name: string;
  readonly capabilities: CryptoCapabilities;

  hashPassword(
    password: CryptoInput,
    options?: PasswordHashProviderOptions,
  ): Promise<string>;

  verifyPassword(password: CryptoInput, hash: string): Promise<boolean>;
}
