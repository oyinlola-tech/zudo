/**
 * In-memory token revocation store.
 *
 * @module authToken/authToken.revocation
 *
 * Good for development and single-process deployments. For production,
 * implement TokenRevocationStore with Redis or a database so revocations
 * are shared across instances.
 */

import type {
  TokenId,
  TokenRevocationStore,
} from "../authTypes/authToken.type.js";

/**
 * Create an in-memory token revocation store.
 *
 * Entries are purged lazily once their token would have expired anyway.
 */
export function createMemoryTokenRevocationStore(): TokenRevocationStore {
  const revoked = new Map<TokenId, number>();

  function purgeExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, expiresAt] of revoked) {
      if (expiresAt < now) {
        revoked.delete(id);
      }
    }
  }

  return {
    async revoke(tokenId: TokenId, expiresAt: number): Promise<void> {
      purgeExpired();
      revoked.set(tokenId, expiresAt);
    },

    async isRevoked(tokenId: TokenId): Promise<boolean> {
      purgeExpired();
      return revoked.has(tokenId);
    },
  };
}
