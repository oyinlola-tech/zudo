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

/** Minimum interval between full sweeps of the revocation map. */
const DEFAULT_PURGE_INTERVAL_MS = 60_000;

/**
 * Create an in-memory token revocation store.
 *
 * Expired entries are dropped lazily: the key being read is checked on every
 * access (O(1)), and a full sweep runs at most once per `purgeIntervalMs`.
 * The sweep is deliberately *not* driven by a timer — an interval would keep
 * the process alive and leak without a `dispose()`.
 *
 * @param options.purgeIntervalMs - Minimum gap between full sweeps
 *   (default: 60000). Set to 0 to sweep on every access.
 */
export function createMemoryTokenRevocationStore(options?: {
  readonly purgeIntervalMs?: number;
}): TokenRevocationStore {
  const revoked = new Map<TokenId, number>();
  const purgeIntervalMs = options?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  let lastPurge = 0;

  /** Full sweep, rate-limited so a large map cannot be walked per request. */
  function maybePurgeExpired(): void {
    const nowMs = Date.now();
    if (nowMs - lastPurge < purgeIntervalMs) return;
    lastPurge = nowMs;
    const now = Math.floor(nowMs / 1000);
    for (const [id, expiresAt] of revoked) {
      if (expiresAt < now) {
        revoked.delete(id);
      }
    }
  }

  /** O(1) expiry check for a single key. */
  function isLive(tokenId: TokenId): boolean {
    const expiresAt = revoked.get(tokenId);
    if (expiresAt === undefined) return false;
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      revoked.delete(tokenId);
      return false;
    }
    return true;
  }

  return {
    async revoke(tokenId: TokenId, expiresAt: number): Promise<void> {
      maybePurgeExpired();
      revoked.set(tokenId, expiresAt);
    },

    async isRevoked(tokenId: TokenId): Promise<boolean> {
      maybePurgeExpired();
      return isLive(tokenId);
    },

    async revokeIfNotRevoked(
      tokenId: TokenId,
      expiresAt: number,
    ): Promise<boolean> {
      // The check and the write happen in one synchronous block with no
      // intervening await, so two concurrent callers cannot both win.
      maybePurgeExpired();
      if (isLive(tokenId)) return false;
      revoked.set(tokenId, expiresAt);
      return true;
    },
  };
}
