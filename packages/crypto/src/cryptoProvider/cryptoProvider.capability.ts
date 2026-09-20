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
 * flag does: a provider that cannot describe itself is not one a
 * secret-handling path should call blind.
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
 * Throws unless the provider declares `random`. @see assertProviderCapability
 *
 * Every helper that draws bytes — tokens, salts, ids, nonces — calls this, so
 * the operation name is fixed in one place rather than at each call site.
 */
export function assertRandomCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "random", CryptoOperation.RANDOM);
}

/** Throws unless the provider declares `hash`. @see assertProviderCapability */
export function assertHashCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "hash", CryptoOperation.HASH);
}

/** Throws unless the provider declares `hmac`. @see assertProviderCapability */
export function assertHmacCapability(provider: CryptoProvider): void {
  assertProviderCapability(provider, "hmac", CryptoOperation.HASH);
}

/**
 * Throws unless the provider declares `passwordHashing`.
 *
 * `verifyPassword` answers `false` for anything wrong with the password, so a
 * provider that cannot hash would read as "wrong password" forever. That is a
 * configuration failure, and it throws.
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
