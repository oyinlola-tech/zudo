/**
 * Main auth service — coordinates password, token, session, and permissions.
 *
 * @module authProvider/authProvider
 */

import type {
  AuthUser,
  UserCredentials,
  UserId,
} from "../authTypes/authUser.type.js";
import type {
  TokenPair,
  TokenPayload,
  TokenConfig,
  TokenId,
  TokenRevocationStore,
} from "../authTypes/authToken.type.js";
import type { SessionStore, SessionId } from "../authTypes/authSession.type.js";
import type { LoginThrottleConfig } from "../authTypes/authAttempt.type.js";
import type { GuardContext, GuardResult } from "../authTypes/authRbac.type.js";
import type { PermissionEngine } from "@zudojs/permissions";
import {
  hashPassword,
  verifyPassword,
} from "../authPassword/authPassword.core.js";
import {
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
} from "../authToken/authToken.core.js";
import {
  AccountDeactivatedError,
  AccountLockedError,
  AuthConfigurationError,
  AuthRateLimitError,
  InvalidCredentialsError,
  SessionExpiredError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
} from "../authErrors/authError.base.js";

/**
 * A syntactically valid hash that no password matches.
 *
 * Verifying against it costs the same scrypt work as a real verification, so
 * the unknown-user path takes comparable time to the wrong-password path and
 * the response time does not disclose whether an account exists.
 */
const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${"0".repeat(64)}$${"0".repeat(
  128,
)}`;

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_SECONDS = 900;
const DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 20;
const DEFAULT_WINDOW_SECONDS = 60;

/** User lookup function provided by the consumer, keyed by login identifier. */
export type UserLookup = (identifier: string) => Promise<AuthUser | null>;
/** User lookup function provided by the consumer, keyed by user id. */
export type UserByIdLookup = (userId: UserId) => Promise<AuthUser | null>;
/** Password verifier function provided by the consumer. */
export type PasswordVerifier = (
  userId: UserId,
  password: string,
) => Promise<boolean>;

/**
 * Auth service configuration.
 */
export interface AuthServiceConfig {
  /** JWT token configuration */
  readonly token: TokenConfig;
  /** Session store */
  readonly sessionStore: SessionStore;
  /** User lookup function, keyed by the identifier submitted at login */
  readonly findUser: UserLookup;
  /**
   * User lookup keyed by user id (the `sub` claim).
   *
   * Used by `refresh()` to re-load the user on every rotation so that
   * deactivation and role changes take effect instead of being frozen into
   * the refresh token for its whole lifetime.
   *
   * Required. `findUser` is keyed by the login identifier, which for most
   * deployments is an email or username rather than an id — silently reusing
   * it here would make every refresh fail closed at runtime. Requiring this
   * surfaces the mismatch at compile time instead. If your `findUser` really
   * is id-keyed, pass it for both.
   */
  readonly findUserById: UserByIdLookup;
  /** Password verifier function */
  readonly verifyPassword: PasswordVerifier;
  /** Session idle TTL in seconds */
  readonly sessionTtlSeconds: number;
  /**
   * Absolute maximum session lifetime in seconds. Without it, a session that
   * is used at least once per idle window never expires.
   */
  readonly absoluteSessionTtlSeconds?: number;
  /** Optional permission engine */
  readonly permissions?: PermissionEngine;
  /**
   * Optional revocation store. When provided, `refresh()` rotates refresh
   * tokens atomically: the used token's `jti` is revoked so it cannot be
   * replayed, and a replay attempt destroys the user's sessions.
   */
  readonly revocationStore?: TokenRevocationStore;
  /** Optional brute-force lockout and login rate limiting. */
  readonly loginThrottle?: LoginThrottleConfig;
  /**
   * Allow `checkAccess()` to fall back to the built-in `simpleGuard` when no
   * `permissions` engine is configured.
   *
   * The fallback grants a resource owner *every* permission and grants the
   * `admin` role everything, so it is opt-in: without this flag,
   * `checkAccess()` throws instead of silently returning `allowed: true`.
   */
  readonly allowInsecureFallbackGuard?: boolean;
  /** Role name the fallback guard treats as superuser (default: "admin"). */
  readonly fallbackAdminRole?: string;
}

/**
 * Auth service interface.
 */
export interface AuthService {
  login(
    credentials: UserCredentials,
    context?: { readonly userAgent?: string; readonly ip?: string },
  ): Promise<LoginResult>;
  /**
   * Verify an access token and return its payload.
   *
   * Async because a token carrying a `sid` claim is only accepted while its
   * session is still alive.
   */
  verifyToken(token: string): Promise<TokenPayload>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(sessionId: SessionId, refreshToken?: string): Promise<void>;
  logoutAll(userId: UserId): Promise<void>;
  checkAccess(context: GuardContext): Promise<GuardResult>;
  hashPassword(password: string): Promise<string>;
  verifyPasswordHash(password: string, hash: string): Promise<boolean>;
}

/**
 * Result of a login attempt.
 */
export interface LoginResult {
  /** Authenticated user */
  readonly user: AuthUser;
  /** Token pair */
  readonly tokens: TokenPair;
  /** Session ID */
  readonly sessionId: SessionId;
}

/**
 * Create an auth service.
 */
export function createAuthService(config: AuthServiceConfig): AuthService {
  const {
    token: tokenConfig,
    sessionStore,
    findUser,
    findUserById,
    verifyPassword: verifyPwd,
    sessionTtlSeconds,
    absoluteSessionTtlSeconds,
    permissions,
    revocationStore,
    loginThrottle,
    allowInsecureFallbackGuard,
    fallbackAdminRole,
  } = config;

  const maxFailedAttempts =
    loginThrottle?.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS;
  const lockoutSeconds =
    loginThrottle?.lockoutSeconds ?? DEFAULT_LOCKOUT_SECONDS;
  const maxAttemptsPerWindow =
    loginThrottle?.maxAttemptsPerWindow ?? DEFAULT_MAX_ATTEMPTS_PER_WINDOW;
  const windowSeconds = loginThrottle?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  /** Throw if the identifier is locked out or over its attempt budget. */
  async function enforceThrottle(identifier: string): Promise<void> {
    if (!loginThrottle) return;
    const now = Date.now();
    const current = await loginThrottle.store.get(identifier);
    if (current.lockedUntil !== undefined && current.lockedUntil > now) {
      throw new AccountLockedError(undefined, {
        retryAfterSeconds: Math.ceil((current.lockedUntil - now) / 1000),
      });
    }
    const updated = await loginThrottle.store.recordAttempt(identifier);
    if (updated.attempts > maxAttemptsPerWindow) {
      throw new AuthRateLimitError(undefined, {
        retryAfterSeconds: windowSeconds,
      });
    }
  }

  /** Record a failed authentication and lock the identifier if warranted. */
  async function recordFailure(identifier: string): Promise<void> {
    if (!loginThrottle) return;
    const updated = await loginThrottle.store.recordFailure(identifier);
    if (updated.failures >= maxFailedAttempts) {
      await loginThrottle.store.lock(
        identifier,
        Date.now() + lockoutSeconds * 1000,
      );
    }
  }

  /**
   * Reject the token unless the session it was issued against is still
   * alive; refresh the session's idle timer when it is.
   */
  async function requireLiveSession(
    payload: TokenPayload,
  ): Promise<SessionId | undefined> {
    const sid = payload.sid;
    // Tokens minted by `createTokenPair` directly carry no `sid`; they cannot
    // be forged, and there is no session to check for them.
    if (!sid) return undefined;
    const session = await sessionStore.get(sid);
    if (!session) {
      throw new SessionExpiredError("Session is no longer active");
    }
    await sessionStore.touch(sid);
    return sid;
  }

  /**
   * Atomically claim the used refresh token id.
   *
   * @returns true when this call was the one that revoked it.
   */
  async function claimRefreshToken(
    store: TokenRevocationStore,
    jti: TokenId,
    exp: number,
  ): Promise<boolean> {
    if (store.revokeIfNotRevoked) {
      return store.revokeIfNotRevoked(jti, exp);
    }
    // Racy fallback for stores predating `revokeIfNotRevoked`.
    if (await store.isRevoked(jti)) return false;
    await store.revoke(jti, exp);
    return true;
  }

  return {
    /**
     * Authenticate a user with credentials and return tokens + session.
     *
     * Unknown user, wrong password and (before the password is proven)
     * deactivated account are indistinguishable to the caller: the same
     * `InvalidCredentialsError` is thrown, and the unknown-user path performs
     * the same scrypt work as the known-user path.
     */
    async login(
      credentials: UserCredentials,
      context?: { readonly userAgent?: string; readonly ip?: string },
    ): Promise<LoginResult> {
      const identifier = credentials.identifier;
      await enforceThrottle(identifier);

      const user = await findUser(identifier);

      let authenticated = false;
      if (user) {
        authenticated = await verifyPwd(user.id, credentials.password);
      } else {
        // Burn comparable work so response time does not reveal that the
        // account does not exist.
        await verifyPassword(credentials.password, DUMMY_PASSWORD_HASH);
      }

      if (!user || !authenticated) {
        await recordFailure(identifier);
        throw new InvalidCredentialsError();
      }

      // The credentials were correct, so the attempt counter is cleared even
      // if the account turns out to be unusable.
      await loginThrottle?.store.reset(identifier);

      // Account state is only disclosed once the password has been proven,
      // so it cannot be probed without a valid credential.
      if (!user.active) {
        throw new AccountDeactivatedError();
      }

      const session = await sessionStore.create({
        userId: user.id,
        userAgent: context?.userAgent,
        ip: context?.ip,
        ttlSeconds: sessionTtlSeconds,
        absoluteTtlSeconds: absoluteSessionTtlSeconds,
      });

      const tokens = createTokenPair(user.id, tokenConfig, {
        roles: user.roles,
        sessionId: session.id,
      });

      return { user, tokens, sessionId: session.id };
    },

    /**
     * Verify an access token and return the payload.
     *
     * @throws {TokenExpiredError} expired token
     * @throws {TokenInvalidError} malformed, mis-signed or wrong-type token
     * @throws {SessionExpiredError} the session the token was issued against
     *   has been destroyed (logout) or expired
     */
    async verifyToken(token: string): Promise<TokenPayload> {
      const result = verifyAccessToken(token, tokenConfig);
      if (!result.valid || !result.payload) {
        if (result.error === "Token expired") {
          throw new TokenExpiredError(result.error);
        }
        throw new TokenInvalidError(
          result.error ?? "Token verification failed",
        );
      }
      const payload = result.payload;
      await requireLiveSession(payload);
      return payload;
    },

    /**
     * Refresh an access token using a refresh token.
     *
     * Rotation is atomic when the revocation store implements
     * `revokeIfNotRevoked`: exactly one of two concurrent refreshes of the
     * same token wins, and the loser is treated as a replay — the user's
     * sessions are destroyed and `TokenRevokedError` is thrown.
     *
     * The user is re-loaded on every refresh, so deactivation and role
     * changes take effect immediately rather than at the end of the refresh
     * token's 7-day life.
     */
    async refresh(refreshToken: string): Promise<TokenPair> {
      const result = verifyRefreshToken(refreshToken, tokenConfig);
      if (!result.valid || !result.payload) {
        if (result.error === "Token expired") {
          throw new TokenExpiredError("Refresh token has expired");
        }
        throw new TokenInvalidError("Refresh token is invalid");
      }

      const payload = result.payload;
      const { sub, jti, exp } = payload;

      const sid = await requireLiveSession(payload);

      if (revocationStore) {
        const claimed = await claimRefreshToken(revocationStore, jti, exp);
        if (!claimed) {
          // Reuse of an already-rotated refresh token: assume the chain is
          // compromised and terminate every session for the user
          // (RFC 6819 §5.2.2.3).
          await sessionStore.destroyAllForUser(sub);
          throw new TokenRevokedError("Refresh token has already been used");
        }
      }

      const user = await findUserById(sub);
      if (!user || !user.active) {
        throw new AccountDeactivatedError("User account is no longer active");
      }

      return createTokenPair(user.id, tokenConfig, {
        roles: user.roles,
        ...(sid ? { sessionId: sid } : {}),
      });
    },

    /**
     * Logout — destroy the session, which invalidates every access and
     * refresh token carrying that `sid`.
     *
     * @param refreshToken - The refresh token being surrendered. When given
     *   alongside a revocation store, its `jti` is revoked too, so the token
     *   stays dead even if it is later presented against a new session.
     */
    async logout(sessionId: SessionId, refreshToken?: string): Promise<void> {
      await sessionStore.destroy(sessionId);
      if (refreshToken && revocationStore) {
        const result = verifyRefreshToken(refreshToken, tokenConfig);
        if (result.valid && result.payload) {
          await revocationStore.revoke(result.payload.jti, result.payload.exp);
        }
      }
    },

    /**
     * Sign out everywhere — destroy every session for a user. Tokens bound
     * to those sessions stop verifying immediately.
     */
    async logoutAll(userId: UserId): Promise<void> {
      await sessionStore.destroyAllForUser(userId);
    },

    /**
     * Check if a user has a specific permission.
     * Delegates to the @zudojs/permissions engine when configured.
     *
     * @throws {AuthConfigurationError} when no engine is configured and
     *   `allowInsecureFallbackGuard` was not set.
     */
    async checkAccess(context: GuardContext): Promise<GuardResult> {
      const { userId, roles: userRoles, permission, resourceOwnerId } = context;
      if (permissions) {
        const actor = { id: userId, roles: [...userRoles] };
        const resource = resourceOwnerId
          ? { ownerId: resourceOwnerId }
          : undefined;
        const decision = await permissions.check(actor, permission, resource);
        return {
          allowed: decision.allowed,
          reason: decision.reason,
          requiredPermission: permission,
          userRoles: [...userRoles],
        };
      }

      if (!allowInsecureFallbackGuard) {
        throw new AuthConfigurationError(
          "checkAccess() requires a `permissions` engine. Set " +
            "`allowInsecureFallbackGuard: true` to opt into the built-in " +
            "fallback, which grants resource owners every permission.",
        );
      }

      return simpleGuard(
        userRoles,
        permission,
        userId,
        resourceOwnerId,
        fallbackAdminRole ?? "admin",
      );
    },

    /**
     * Hash a password (for user registration).
     */
    hashPassword(password: string): Promise<string> {
      return hashPassword(password);
    },

    /**
     * Verify a password against a hash.
     */
    verifyPasswordHash(password: string, hash: string): Promise<boolean> {
      return verifyPassword(password, hash);
    },
  };
}

/**
 * Simple fallback guard used only when no permissions engine is configured
 * *and* the consumer opted in with `allowInsecureFallbackGuard`.
 *
 * It grants a resource owner every permission and grants the configured
 * admin role everything — it does no permission matching at all. Every
 * allowed result carries a `reason` naming the fallback so the decision is
 * distinguishable from an engine-backed one in an audit log.
 */
function simpleGuard(
  userRoles: readonly string[],
  permission: string,
  userId: string,
  resourceOwnerId: string | undefined,
  adminRole: string,
): GuardResult {
  // Ownership check — note this ignores `permission` entirely.
  if (resourceOwnerId && resourceOwnerId === userId) {
    return {
      allowed: true,
      reason: "granted by fallback guard: resource ownership",
      requiredPermission: permission,
      userRoles: [...userRoles],
    };
  }

  if (userRoles.includes(adminRole)) {
    return {
      allowed: true,
      reason: `granted by fallback guard: "${adminRole}" role`,
      requiredPermission: permission,
      userRoles: [...userRoles],
    };
  }

  return {
    allowed: false,
    reason: `User lacks required permission: ${permission}`,
    requiredPermission: permission,
    userRoles: [...userRoles],
  };
}
