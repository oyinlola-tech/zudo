import type { CryptoProvider } from "./cryptoProvider.core.js";

import { assertCryptoProvider } from "./cryptoProvider.capability.js";
import { createNodeCryptoProvider } from "../node/nodeCryptoProvider/nodeCryptoProvider.factory.js";

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
