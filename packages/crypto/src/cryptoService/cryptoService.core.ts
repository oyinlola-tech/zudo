import type { CryptoProvider } from "../cryptoProvider/index.js";
import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";
import {
  generateCryptoKey,
  defaultKeyLength,
} from "../cryptoKey/cryptoKey.factory.js";
import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";
import { CryptoOperation } from "@zudojs/errors";
import {
  operationError,
  rethrowAsCryptoError,
} from "../cryptoErrors/cryptoErrors.helper.js";
import {
  serviceEncrypt,
  serviceDecrypt,
  type CipherOptions,
  type CipherResult,
} from "./operations/cryptoService.cipher.js";
import {
  serviceHash,
  serviceHashHex,
} from "./operations/cryptoService.hash.js";
import {
  serviceHashPassword,
  serviceVerifyPassword,
  type PasswordHashOptions,
  type PasswordHashResult,
} from "./operations/cryptoService.password.js";
import {
  serviceDeriveKey,
  type Pbkdf2Options,
  type ScryptOptions,
  type DerivedKeyResult,
} from "./cryptoService.derivation.js";
import {
  serviceGenerateToken,
  serviceGenerateOtp,
  serviceHashToken,
  serviceVerifyToken,
  type TokenOptions,
} from "./operations/cryptoService.token.js";
import {
  serviceEncode,
  serviceDecode,
  type CryptoEncoding,
} from "./cryptoService.encoding.js";
import type { CryptoKey as ZudojsCryptoKey } from "../cryptoKey/cryptoKey.type.js";

/**
 * Options for constructing a CryptoService.
 */
export interface CryptoServiceOptions {
  /** Provider used for every operation (defaults to the process-wide default). */
  readonly provider?: CryptoProvider;
}

/**
 * High-level service facade for cryptographic operations.
 *
 * Every failure is surfaced as a `CryptoError` whose `cause` holds the
 * underlying error, so misconfiguration (wrong key length, invalid
 * option) can be distinguished from environmental failures.
 */
export class CryptoService {
  private readonly configuredProvider: CryptoProvider | undefined;

  constructor(options: CryptoServiceOptions = {}) {
    this.configuredProvider = options.provider;
  }

  /**
   * Returns the provider backing this service.
   *
   * When none was configured, the process-wide default is resolved on
   * each call, so `setDefaultCryptoProvider` also affects this service.
   */
  getProvider(): CryptoProvider {
    return this.configuredProvider ?? getDefaultCryptoProvider();
  }

  private get provider(): CryptoProvider {
    return this.getProvider();
  }

  /**
   * Generates a random symmetric key sized for the algorithm.
   *
   * Asymmetric algorithms are rejected: random bytes are not a usable
   * signing key. Use `generateEd25519KeyPair` for those.
   */
  async generateKey(
    algorithm: CryptoAlgorithm = CryptoAlgorithm.AES_256_GCM,
  ): Promise<ZudojsCryptoKey> {
    try {
      return await generateCryptoKey(
        defaultKeyLength(algorithm),
        { algorithm, extractable: true },
        this.provider,
      );
    } catch (error) {
      return rethrowAsCryptoError(error, (cause) =>
        operationError(
          "Key generation failed.",
          CryptoOperation.KEY_GENERATION,
          cause,
        ),
      );
    }
  }

  /** Generates random bytes. */
  async randomBytes(length = 32): Promise<Uint8Array> {
    if (!Number.isInteger(length) || length <= 0) {
      throw new TypeError("Random byte length must be a positive integer.");
    }

    try {
      return await this.provider.randomBytes(length);
    } catch (error) {
      return rethrowAsCryptoError(error, (cause) =>
        operationError(
          "Failed to generate random bytes.",
          CryptoOperation.RANDOM,
          cause,
        ),
      );
    }
  }

  /** Encrypts data using the supplied key. */
  async encrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    options?: CipherOptions,
  ): Promise<CipherResult> {
    return serviceEncrypt(plaintext, key, options, this.provider);
  }

  /** Decrypts data using the supplied key. */
  async decrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array,
    authTag: Uint8Array,
    aad?: Uint8Array,
  ): Promise<Uint8Array> {
    return serviceDecrypt(ciphertext, key, iv, authTag, aad, this.provider);
  }

  /** Hashes arbitrary data with SHA-256. */
  async hash(value: string | Uint8Array): Promise<Uint8Array> {
    return serviceHash(value, this.provider);
  }

  /** Hashes arbitrary data and returns hexadecimal output. */
  async hashHex(value: string | Uint8Array): Promise<string> {
    return serviceHashHex(value, this.provider);
  }

  /** Hashes a password using scrypt. */
  async hashPassword(
    password: string,
    options?: PasswordHashOptions,
  ): Promise<PasswordHashResult> {
    return serviceHashPassword(password, options, this.provider);
  }

  /** Verifies a password against a stored password hash. */
  async verifyPassword(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    return serviceVerifyPassword(password, encodedHash, this.provider);
  }

  /** Derives a cryptographic key from password material. */
  async deriveKey(
    password: string | Uint8Array,
    algorithm: CryptoAlgorithm,
    options?: Pbkdf2Options | ScryptOptions,
  ): Promise<DerivedKeyResult> {
    return serviceDeriveKey(password, algorithm, options, this.provider);
  }

  /** Generates a cryptographically secure opaque token. */
  async generateToken(options?: TokenOptions): Promise<string> {
    return serviceGenerateToken(options, this.provider);
  }

  /** Generates a secure one-time password. */
  async generateOtp(digits = 6): Promise<string> {
    return serviceGenerateOtp(digits, this.provider);
  }

  /** Hashes an opaque token before database storage. */
  async hashToken(token: string): Promise<string> {
    return serviceHashToken(token, this.provider);
  }

  /** Verifies an opaque token against its stored hash. */
  async verifyToken(token: string, expectedHash: string): Promise<boolean> {
    return serviceVerifyToken(token, expectedHash, this.provider);
  }

  /** Encodes binary data. */
  encode(value: Uint8Array, encoding: CryptoEncoding = "base64url"): string {
    return serviceEncode(value, encoding);
  }

  /** Decodes encoded binary data. */
  decode(value: string, encoding: CryptoEncoding = "base64url"): Uint8Array {
    return serviceDecode(value, encoding);
  }
}

/**
 * Creates a new CryptoService instance.
 */
export function createCryptoService(
  options: CryptoServiceOptions = {},
): CryptoService {
  return new CryptoService(options);
}

/**
 * Default crypto service instance.
 *
 * Construction is trivial (no provider is created until first use).
 */
export const cryptoService: CryptoService = createCryptoService();

/**
 * Returns the default crypto service instance.
 */
export function getCryptoService(): CryptoService {
  return cryptoService;
}
