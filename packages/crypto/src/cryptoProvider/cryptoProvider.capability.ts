/**
 * Capability checks for a crypto provider.
 *
 * `CryptoCapabilities` is required on every provider, but nothing read it:
 * a provider declaring `signing: false` still had `sign` called, and a
 * provider that only implements part of the interface only failed once the
 * missing method was reached — as a bare `TypeError` from deep inside an
 * unrelated operation. Both are checked here instead, so an unsupported
 * operation is refused by name at the boundary.
 *
 * @module cryptoProvider/cryptoProvider.capability
 */

import { CryptoError, CryptoOperation, ErrorCode } from "@zudojs/errors";

import type { CryptoProvider } from "./cryptoProvider.core.js";
import type { CryptoCapabilities } from "./cryptoProvider.type.js";

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

/** The provider's reported name, without trusting it to be a string. */
function providerName(provider: CryptoProvider): string {
  return typeof provider.name === "string" && provider.name.length > 0
    ? provider.name
    : "unnamed";
}

/**
 * Throws unless the provider declares the capability an operation needs.
 *
 * A missing or malformed `capabilities` object fails the same way a `false`
 * flag does: a provider that cannot describe itself is not one an
 * authorization- or secret-handling path should call blind.
 *
 * @param provider - The provider about to be used.
 * @param capability - The capability the operation requires.
 * @param operation - The operation being attempted, for the error.
 * @throws {CryptoError} when the capability is not declared.
 */
export function assertProviderCapability(
  provider: CryptoProvider,
  capability: keyof CryptoCapabilities,
  operation: CryptoOperation,
): void {
  const capabilities = provider.capabilities as
    | CryptoCapabilities
    | undefined
    | null;

  if (
    typeof capabilities !== "object" ||
    capabilities === null ||
    capabilities[capability] !== true
  ) {
    throw new CryptoError(
      `Crypto provider "${providerName(provider)}" does not support ` +
        `${capability}: the "${operation}" operation was refused.`,
      { code: ErrorCode.CRYPTO, operation },
    );
  }
}

/**
 * Throws unless the provider declares `random`.
 *
 * Every helper that draws bytes — tokens, salts, ids, nonces — goes through
 * one of these, so the check is kept in one place rather than repeated with
 * a different operation name at each call site.
 *
 * @param provider - The provider about to be used.
 * @throws {CryptoError} when `random` is not declared.
 */
export function assertRandomCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "random", CryptoOperation.RANDOM);
}

/**
 * Throws unless the provider declares `hash`.
 *
 * @param provider - The provider about to be used.
 * @throws {CryptoError} when `hash` is not declared.
 */
export function assertHashCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "hash", CryptoOperation.HASH);
}

/**
 * Throws unless the provider declares `hmac`.
 *
 * @param provider - The provider about to be used.
 * @throws {CryptoError} when `hmac` is not declared.
 */
export function assertHmacCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "hmac", CryptoOperation.HASH);
}

/**
 * Throws unless the provider declares `passwordHashing`.
 *
 * `verifyPassword` answers `false` for anything that goes wrong with the
 * password, so a provider that cannot hash at all would read as "wrong
 * password" forever. That is a configuration failure, and it throws.
 *
 * @param provider - The provider about to be used.
 * @throws {CryptoError} when `passwordHashing` is not declared.
 */
export function assertPasswordHashingCapability(
  provider: CryptoProvider,
): void {
  assertProviderCapability(
    provider,
    "passwordHashing",
    CryptoOperation.KEY_DERIVATION,
  );
}

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
