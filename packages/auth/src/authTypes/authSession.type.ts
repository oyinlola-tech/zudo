/**
 * Session types and interfaces.
 *
 * @module authSession/authSession
 */

import type { UserId } from "../authTypes/authUser.type.js";
import type { SessionId } from "@zudojs/constants";

export type { SessionId } from "@zudojs/constants";

/**
 * Brands a plain string as a {@link SessionId}.
 *
 * `SessionId` is a branded type with no public constructor, so callers holding
 * an id from a session store, a cookie or a request parameter have no way to
 * produce one without a cast. This is that constructor.
 *
 * @param value - Non-empty session identifier.
 * @returns The same string, typed as a `SessionId`.
 * @throws {TypeError} If `value` is not a non-empty string.
 */
export function toSessionId(value: string): SessionId {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("toSessionId: value must be a non-empty string.");
  }
  return value as SessionId;
}

/**
 * Server-side session representation.
 */
export interface AuthSession {
  /** Unique session identifier */
  readonly id: SessionId;
  /** User who owns this session */
  readonly userId: UserId;
  /** Client user-agent string */
  readonly userAgent?: string;
  /** Client IP address */
  readonly ip?: string;
  /** Session creation time */
  readonly createdAt: Date;
  /** Last activity time */
  readonly lastActivityAt: Date;
  /**
   * Session expiration time.
   *
   * With sliding expiration this moves forward on every `touch()`, but never
   * past `createdAt + absoluteTtlSeconds` when an absolute lifetime was
   * requested.
   */
  readonly expiresAt: Date;
  /**
   * Hard deadline for the session, when one was requested at creation.
   * `touch()` never extends `expiresAt` beyond this.
   */
  readonly absoluteExpiresAt?: Date;
  /** Session metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Options for creating a session.
 */
export interface CreateSessionOptions {
  readonly userId: UserId;
  readonly userAgent?: string;
  readonly ip?: string;
  /** Idle timeout in seconds; refreshed by `touch()` (default: 86400). */
  readonly ttlSeconds?: number;
  /**
   * Absolute maximum session lifetime in seconds, measured from creation.
   * Without it a session that is touched once per idle window never expires,
   * so a stolen session id is valid indefinitely.
   */
  readonly absoluteTtlSeconds?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Session store interface.
 */
export interface SessionStore {
  /** Create a new session */
  create(options: CreateSessionOptions): Promise<AuthSession>;
  /** Get a session by ID */
  get(sessionId: SessionId): Promise<AuthSession | null>;
  /** Update session activity */
  touch(sessionId: SessionId): Promise<void>;
  /** Destroy a session */
  destroy(sessionId: SessionId): Promise<void>;
  /** Destroy all sessions for a user */
  destroyAllForUser(userId: UserId): Promise<void>;
}
