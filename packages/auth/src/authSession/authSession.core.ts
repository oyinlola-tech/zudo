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
import { randomBytes } from "node:crypto";

const DEFAULT_TTL_SECONDS = 86400; // 24 hours

/**
 * Create an in-memory session store.
 *
 * Good for development and testing. For production,
 * implement SessionStore with Redis or a database.
 */
export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<SessionId, AuthSession>();
  const ttls = new Map<SessionId, number>();

  function purgeExpired(): void {
    const now = new Date();
    for (const [id, session] of sessions) {
      if (now > session.expiresAt) {
        sessions.delete(id);
        ttls.delete(id);
      }
    }
  }

  return {
    async create(options: CreateSessionOptions): Promise<AuthSession> {
      purgeExpired();
      const id = generateSessionId();
      const now = new Date();
      const ttlMs = (options.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;

      const session: AuthSession = {
        id,
        userId: options.userId,
        userAgent: options.userAgent,
        ip: options.ip,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + ttlMs),
        active: true,
        metadata: options.metadata,
      };

      sessions.set(id, session);
      ttls.set(id, ttlMs);
      return session;
    },

    async get(sessionId: SessionId): Promise<AuthSession | null> {
      const session = sessions.get(sessionId);
      if (!session) return null;
      if (!session.active) return null;
      if (new Date() > session.expiresAt) {
        sessions.delete(sessionId);
        ttls.delete(sessionId);
        return null;
      }
      return session;
    },

    async touch(sessionId: SessionId): Promise<void> {
      const session = sessions.get(sessionId);
      if (session && session.active && new Date() <= session.expiresAt) {
        const now = new Date();
        const ttlMs = ttls.get(sessionId) ?? DEFAULT_TTL_SECONDS * 1000;
        sessions.set(sessionId, {
          ...session,
          lastActivityAt: now,
          // Sliding expiration: activity extends the session by its TTL
          expiresAt: new Date(now.getTime() + ttlMs),
        });
      }
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

function generateSessionId(): SessionId {
  return randomBytes(32).toString("hex") as SessionId;
}
