/**
 * Crypto provider abstraction.
 *
 * Provides capability-based provider interfaces for all
 * cryptographic operations, enabling testability and
 * runtime provider selection via `setDefaultCryptoProvider`
 * or per-call `provider` options.
 */
export type { CryptoProvider } from "./cryptoProvider.core.js";

export type {
  CryptoCapabilities,
  HashAlgorithm,
  HmacAlgorithm,
  Pbkdf2Digest,
  EncryptionAlgorithm,
  SignatureAlgorithm,
  KeyDerivationAlgorithm,
  EncodingFormat,
  CryptoInput,
} from "./cryptoProvider.type.js";

export {
  isHashAlgorithmName,
  isHmacAlgorithmName,
  isPbkdf2Digest,
  isSignatureAlgorithmName,
} from "./cryptoProvider.type.js";

export type {
  RandomProvider,
  HashProvider,
  HmacProvider,
  EncryptionProvider,
  SigningProvider,
  KeyDerivationProvider,
  PasswordProvider,
} from "./cryptoProvider.interface.js";

export {
  getDefaultCryptoProvider,
  setDefaultCryptoProvider,
  resetDefaultCryptoProvider,
} from "./cryptoProvider.default.js";

export * from "./types/index.js";
