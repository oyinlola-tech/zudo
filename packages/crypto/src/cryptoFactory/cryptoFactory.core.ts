import type { CryptoProvider } from "../cryptoProvider/index.js";
import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";
import {
  CryptoService,
  createCryptoService,
} from "../cryptoService/cryptoService.core.js";
import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";
import {
  generateCryptoKey,
  defaultKeyLength,
} from "../cryptoKey/cryptoKey.factory.js";
import { assertBinaryEncoding } from "../cryptoEncoding/cryptoEncoding.core.js";
import {
  factoryCreateToken,
  factoryCreateApiKey,
  factoryCreateSessionToken,
  factoryCreateRefreshToken,
  factoryCreateVerificationToken,
  factoryCreatePasswordResetToken,
  factoryCreateCsrfToken,
  factoryCreateOtp,
} from "./cryptoFactory.token.js";
import {
  factoryCreatePasswordHash,
  factoryVerifyPassword,
} from "./cryptoFactory.password.js";
import { factoryEncode, factoryDecode } from "./cryptoFactory.encoding.js";
import type { CryptoKey } from "../cryptoKey/cryptoKey.type.js";
import type { PasswordHashResult } from "../cryptoPassword/cryptoPassword.type.js";
import type { PasswordHashOptions } from "./cryptoFactory.password.js";
import type { CryptoEncoding } from "./cryptoFactory.encoding.js";
import type { TokenEncoding } from "../cryptoToken/cryptoToken.core.js";

/**
 * Configuration used to create a CryptoFactory.
 */
export interface CryptoFactoryOptions {
  readonly defaultKeyAlgorithm?: CryptoAlgorithm;
  /** Default scrypt parameters; per-call options are merged on top. */
  readonly password?: PasswordHashOptions;
  /** Default binary encoding for tokens and `encode`/`decode`. */
  readonly encoding?: TokenEncoding;
  /** Provider used for every operation. */
  readonly provider?: CryptoProvider;
}

interface ResolvedFactoryOptions {
  readonly defaultKeyAlgorithm: CryptoAlgorithm;
  readonly password: Readonly<PasswordHashOptions>;
  readonly encoding: TokenEncoding;
}

/**
 * Central factory for constructing and accessing crypto services.
 *
 * Options are deep-copied on construction, so later mutation of the
 * caller's option objects cannot change the factory's behaviour.
 */
export class CryptoFactory {
  private readonly options: ResolvedFactoryOptions;
  private readonly configuredProvider: CryptoProvider | undefined;
  private readonly service: CryptoService;

  constructor(options: CryptoFactoryOptions = {}) {
    const encoding = options.encoding ?? "base64url";

    assertBinaryEncoding(encoding);

    this.configuredProvider = options.provider;

    this.options = Object.freeze({
      defaultKeyAlgorithm:
        options.defaultKeyAlgorithm ?? CryptoAlgorithm.AES_256_GCM,
      password: Object.freeze({ ...(options.password ?? {}) }),
      encoding,
    });

    this.service = createCryptoService({ provider: options.provider });
  }

  private get provider(): CryptoProvider {
    return this.configuredProvider ?? getDefaultCryptoProvider();
  }

  /** Returns the configured crypto service. */
  getService(): CryptoService {
    return this.service;
  }

  /**
   * Returns the provider backing this factory (the process-wide default
   * when none was configured).
   */
  getProvider(): CryptoProvider {
    return this.provider;
  }

  /**
   * Generates a symmetric key using the configured default algorithm.
   *
   * Asymmetric algorithms are rejected.
   */
  async createKey(
    algorithm: CryptoAlgorithm = this.options.defaultKeyAlgorithm,
  ): Promise<CryptoKey> {
    return generateCryptoKey(
      defaultKeyLength(algorithm),
      { algorithm, extractable: true },
      this.provider,
    );
  }

  /** Generates a secure opaque token. */
  async createToken(bytes = 32, prefix?: string): Promise<string> {
    return factoryCreateToken(
      bytes,
      prefix,
      this.options.encoding,
      this.provider,
    );
  }

  /** Generates an API key. */
  async createApiKey(): Promise<string> {
    return factoryCreateApiKey(this.provider);
  }

  /** Generates a session token. */
  async createSessionToken(): Promise<string> {
    return factoryCreateSessionToken(this.provider);
  }

  /** Generates a refresh token. */
  async createRefreshToken(): Promise<string> {
    return factoryCreateRefreshToken(this.provider);
  }

  /** Generates an email or account verification token. */
  async createVerificationToken(): Promise<string> {
    return factoryCreateVerificationToken(this.provider);
  }

  /** Generates a password reset token. */
  async createPasswordResetToken(): Promise<string> {
    return factoryCreatePasswordResetToken(this.provider);
  }

  /** Generates a CSRF token. */
  async createCsrfToken(): Promise<string> {
    return factoryCreateCsrfToken(this.provider);
  }

  /** Generates a numeric one-time password. */
  async createOtp(digits = 6): Promise<string> {
    return factoryCreateOtp(digits, this.provider);
  }

  /**
   * Hashes a password using the configured password options.
   *
   * Per-call options are layered on top of the configured defaults.
   */
  async createPasswordHash(
    password: string,
    options?: PasswordHashOptions,
  ): Promise<PasswordHashResult> {
    return factoryCreatePasswordHash(
      password,
      { ...this.options.password, ...options },
      this.provider,
    );
  }

  /** Verifies a password against a stored hash. */
  async verifyPassword(
    password: string,
    encodedHash: string,
  ): Promise<boolean> {
    return factoryVerifyPassword(password, encodedHash, this.provider);
  }

  /** Encodes bytes using the configured default encoding. */
  encode(value: Uint8Array, encoding: CryptoEncoding = this.options.encoding): string {
    return factoryEncode(value, encoding);
  }

  /** Decodes binary data using the configured default encoding. */
  decode(
    value: string,
    encoding: CryptoEncoding = this.options.encoding,
  ): Uint8Array {
    return factoryDecode(value, encoding);
  }

  /** Returns a frozen copy of the factory configuration. */
  getOptions(): Readonly<Required<Omit<CryptoFactoryOptions, "provider">>> {
    return Object.freeze({
      defaultKeyAlgorithm: this.options.defaultKeyAlgorithm,
      encoding: this.options.encoding,
      password: Object.freeze({ ...this.options.password }),
    });
  }
}

/**
 * Creates a configured CryptoFactory.
 */
export function createCryptoFactory(
  options: CryptoFactoryOptions = {},
): CryptoFactory {
  return new CryptoFactory(options);
}

/**
 * Default application crypto factory.
 *
 * Construction is trivial (no provider is created until first use).
 */
export const cryptoFactory: CryptoFactory = createCryptoFactory();

/**
 * Returns the default application crypto factory.
 */
export function getCryptoFactory(): CryptoFactory {
  return cryptoFactory;
}
