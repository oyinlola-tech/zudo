/**
 * In-memory token revocation store.
 *
 * @module authToken/authToken.revocation
 *
 * Good for development and single-process deployments. For production,
 * implement TokenRevocationStore with Redis or a database so revocations
 * are shared across instances.
 */

import type { Clock } from "@zudojs/types";
import type {
  TokenId,
  TokenRevocationStore,
} from "../authTypes/authToken.type.js";
import { AuthConfigurationError } from "../authErrors/authError.base.js";

/** Minimum interval between full sweeps of the revocation map. */
const DEFAULT_PURGE_INTERVAL_MS = 60_000;

/** `code` of the process warning emitted for a non-atomic revocation store. */
export const RACY_REVOCATION_WARNING_CODE = "ZUDO_AUTH_RACY_REVOCATION";

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
 * @param options.clock - Time source for expiry (default: `Date.now`).
 */
export function createMemoryTokenRevocationStore(options?: {
  readonly purgeIntervalMs?: number;
  readonly clock?: Clock;
}): TokenRevocationStore {
  const revoked = new Map<TokenId, number>();
  const purgeIntervalMs = options?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  const clock = options?.clock;
  const nowMs = (): number => (clock ? clock.now() : Date.now());
  let lastPurge = 0;

  /** Full sweep, rate-limited so a large map cannot be walked per request. */
  function maybePurgeExpired(): void {
    const current = nowMs();
    if (current - lastPurge < purgeIntervalMs) return;
    lastPurge = current;
    const now = Math.floor(current / 1000);
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
    if (expiresAt < Math.floor(nowMs() / 1000)) {
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

/**
 * Check that a revocation store can claim a refresh token atomically.
 *
 * Without `revokeIfNotRevoked`, `createAuthService().refresh()` falls back
 * to `isRevoked()` then `revoke()`, which leaves a window in which two
 * concurrent replays of one refresh token both mint a valid pair. That
 * used to happen silently. Now a `SecurityWarning` with code
 * {@link RACY_REVOCATION_WARNING_CODE} is emitted through
 * `process.emitWarning` at construction, or, with `required`, the service
 * refuses to start.
 *
 * @throws {AuthConfigurationError} when `required` and the method is absent.
 */
export function assertAtomicRevocationStore(
  store: TokenRevocationStore,
  required: boolean,
): void {
  if (typeof store.revokeIfNotRevoked === "function") return;
  const message =
    "TokenRevocationStore does not implement revokeIfNotRevoked(); " +
    "refresh() falls back to isRevoked() + revoke(), which is racy: two " +
    "concurrent replays of one refresh token can both succeed. Implement " +
    "revokeIfNotRevoked (SET NX in Redis) in any store used in production.";
  if (required) {
    throw new AuthConfigurationError(
      `${message} Set requireAtomicRevocation: false to accept the fallback.`,
    );
  }
  process.emitWarning(message, {
    type: "SecurityWarning",
    code: RACY_REVOCATION_WARNING_CODE,
  });
}
