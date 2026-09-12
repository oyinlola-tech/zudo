/**
 * In-memory session store implementation.
 *
 * @module authSession/authSession
 *
 * For production, implement SessionStore backed by Redis, database, etc.
 */

import type {
  AuthSession,
  CreateSessionOptions,
  SessionId,
  SessionStore,
} from "../authTypes/authSession.type.js";
import type { UserId } from "../authTypes/authUser.type.js";
import { AuthConfigurationError } from "../authErrors/authError.base.js";
import { randomBytes } from "node:crypto";

const DEFAULT_TTL_SECONDS = 86400; // 24 hours

/** Minimum interval between full sweeps of the session map. */
const DEFAULT_PURGE_INTERVAL_MS = 60_000;

/**
 * Create an in-memory session store.
 *
 * Good for development and testing. For production, implement SessionStore
 * with Redis or a database.
 *
 * Expired sessions are reclaimed on any access — `create`, `get` and `touch`
 * all run a rate-limited sweep — so a store that stops receiving logins
 * still releases its memory. The sweep is rate-limited rather than run per
 * call so that a large store does not turn an O(1) lookup into an O(n) walk.
 *
 * @param options.purgeIntervalMs - Minimum gap between full sweeps
 *   (default: 60000). Set to 0 to sweep on every access.
 */
export function createMemorySessionStore(storeOptions?: {
  readonly purgeIntervalMs?: number;
}): SessionStore {
  const sessions = new Map<SessionId, AuthSession>();
  const ttls = new Map<SessionId, number>();
  const purgeIntervalMs =
    storeOptions?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  let lastPurge = 0;

  function maybePurgeExpired(): void {
    const nowMs = Date.now();
    if (nowMs - lastPurge < purgeIntervalMs) return;
    lastPurge = nowMs;
    for (const [id, session] of sessions) {
      if (nowMs > session.expiresAt.getTime()) {
        sessions.delete(id);
        ttls.delete(id);
      }
    }
  }

  return {
    async create(options: CreateSessionOptions): Promise<AuthSession> {
      // A non-finite TTL (`Number(undefinedEnvVar)` is the usual source)
      // produced an `Invalid Date` expiry, and `now > NaN` is always false —
      // so the session never expired, not even at its absolute deadline.
      assertPositiveSeconds(options.ttlSeconds, "ttlSeconds");
      assertPositiveSeconds(options.absoluteTtlSeconds, "absoluteTtlSeconds");
      maybePurgeExpired();
      const id = generateSessionId();
      const now = new Date();
      const ttlMs = (options.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
      const absoluteExpiresAt =
        options.absoluteTtlSeconds !== undefined
          ? new Date(now.getTime() + options.absoluteTtlSeconds * 1000)
          : undefined;
      const expiresAt = clampToAbsolute(
        new Date(now.getTime() + ttlMs),
        absoluteExpiresAt,
      );

      const session: AuthSession = {
        id,
        userId: options.userId,
        userAgent: options.userAgent,
        ip: options.ip,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        absoluteExpiresAt,
        metadata: options.metadata,
      };

      sessions.set(id, session);
      ttls.set(id, ttlMs);
      return session;
    },

    async get(sessionId: SessionId): Promise<AuthSession | null> {
      maybePurgeExpired();
      const session = sessions.get(sessionId);
      if (!session) return null;
      if (Date.now() > session.expiresAt.getTime()) {
        sessions.delete(sessionId);
        ttls.delete(sessionId);
        return null;
      }
      return session;
    },

    async touch(sessionId: SessionId): Promise<void> {
      maybePurgeExpired();
      const session = sessions.get(sessionId);
      if (!session) return;
      const now = new Date();
      if (now.getTime() > session.expiresAt.getTime()) {
        sessions.delete(sessionId);
        ttls.delete(sessionId);
        return;
      }
      const ttlMs = ttls.get(sessionId) ?? DEFAULT_TTL_SECONDS * 1000;
      sessions.set(sessionId, {
        ...session,
        lastActivityAt: now,
        // Sliding expiration: activity extends the session by its TTL, but
        // never past the absolute deadline.
        expiresAt: clampToAbsolute(
          new Date(now.getTime() + ttlMs),
          session.absoluteExpiresAt,
        ),
      });
    },

    async destroy(sessionId: SessionId): Promise<void> {
      sessions.delete(sessionId);
      ttls.delete(sessionId);
    },

    async destroyAllForUser(userId: UserId): Promise<void> {
      for (const [id, session] of sessions) {
        if (session.userId === userId) {
          sessions.delete(id);
          ttls.delete(id);
        }
      }
    },
  };
}

/**
 * Reject a TTL that cannot produce a real expiry.
 *
 * @throws {AuthConfigurationError} when `value` is defined but is not a
 *   finite number greater than zero.
 */
export function assertPositiveSeconds(
  value: number | undefined,
  field: string,
): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AuthConfigurationError(
      `${field} must be a finite number of seconds greater than zero; ` +
        `got ${String(value)}. A NaN lifetime would create a session that never expires.`,
    );
  }
}

function clampToAbsolute(expiresAt: Date, absolute: Date | undefined): Date {
  if (!absolute) return expiresAt;
  return expiresAt.getTime() > absolute.getTime() ? absolute : expiresAt;
}

function generateSessionId(): SessionId {
  return randomBytes(32).toString("hex") as SessionId;
}
