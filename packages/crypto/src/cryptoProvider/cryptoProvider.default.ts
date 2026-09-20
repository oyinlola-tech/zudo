import { CryptoError, CryptoOperation, ErrorCode } from "@zudojs/errors";

import type { CryptoProvider } from "./cryptoProvider.core.js";

import { createNodeCryptoProvider } from "../node/nodeCryptoProvider/nodeCryptoProvider.factory.js";

/** Every method a `CryptoProvider` must implement. */
export const CRYPTO_PROVIDER_METHODS = Object.freeze([
  "randomBytes",
  "randomInt",
  "randomUUID",
  "hash",
  "hmac",
  "encrypt",
  "decrypt",
  "sign",
  "verify",
  "deriveKey",
  "hashPassword",
  "verifyPassword",
] as const);

/** Every capability flag a `CryptoProvider` must declare. */
const CRYPTO_CAPABILITY_FLAGS = Object.freeze([
  "hash",
  "hmac",
  "encryption",
  "signing",
  "random",
  "passwordHashing",
  "keyDerivation",
] as const);

/**
 * Throws unless `provider` is a complete {@link CryptoProvider}.
 *
 * Installing `{}` as the process-wide default used to succeed and then fail
 * at the first `randomHex(16)` with a `TypeError` — arbitrarily far from the
 * call that caused it. Every method and every capability flag is checked
 * here, at install time.
 *
 * @param provider - The candidate provider.
 * @throws {CryptoError} when a method or a capability flag is missing.
 */
export function assertCryptoProvider(
  provider: CryptoProvider,
): asserts provider is CryptoProvider {
  const candidate = provider as unknown as Record<string, unknown>;

  for (const method of CRYPTO_PROVIDER_METHODS) {
    if (typeof candidate[method] !== "function") {
      throw new CryptoError(
        `Crypto provider is missing the "${method}" method: a provider must ` +
          `implement all ${CRYPTO_PROVIDER_METHODS.length} operations.`,
        { code: ErrorCode.CRYPTO, operation: CryptoOperation.UNKNOWN },
      );
    }
  }

  const capabilities = candidate.capabilities;
  if (typeof capabilities !== "object" || capabilities === null) {
    throw new CryptoError(
      "Crypto provider is missing its `capabilities` declaration.",
      { code: ErrorCode.CRYPTO, operation: CryptoOperation.UNKNOWN },
    );
  }

  const flags = capabilities as Record<string, unknown>;
  for (const flag of CRYPTO_CAPABILITY_FLAGS) {
    if (typeof flags[flag] !== "boolean") {
      throw new CryptoError(
        `Crypto provider capability "${flag}" must be a boolean.`,
        { code: ErrorCode.CRYPTO, operation: CryptoOperation.UNKNOWN },
      );
    }
  }
}

let defaultProvider: CryptoProvider | undefined;

/**
 * Returns the process-wide default crypto provider, creating the Node
 * provider lazily on first use.
 */
export function getDefaultCryptoProvider(): CryptoProvider {
  if (defaultProvider === undefined) {
    defaultProvider = createNodeCryptoProvider();
  }

  return defaultProvider;
}

/**
 * Replaces the process-wide default crypto provider.
 *
 * Every module-level helper (hash, encrypt, hashPassword, generateToken,
 * ...) that is not given an explicit provider uses this one.
 *
 * The provider is checked here rather than at first use: installing a partial
 * object succeeded and then failed much later, inside whichever operation
 * happened to reach the missing method first.
 *
 * @param provider - The provider to install process-wide.
 * @throws {CryptoError} when a method or a capability flag is missing.
 */
export function setDefaultCryptoProvider(provider: CryptoProvider): void {
  if (typeof provider !== "object" || provider === null) {
    throw new TypeError("Crypto provider must be an object.");
  }

  assertCryptoProvider(provider);

  defaultProvider = provider;
}

/**
 * Restores the built-in Node provider as the default.
 */
export function resetDefaultCryptoProvider(): void {
  defaultProvider = undefined;
}
