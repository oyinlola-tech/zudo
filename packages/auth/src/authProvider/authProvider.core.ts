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
import { createLoginThrottleGate } from "./authProvider.throttle.js";
import {
  createExternalSessionStarter,
  type ExternalSessionOptions,
} from "./authProvider.external.js";
import { normalizeLoginIdentifier } from "../authUtils/authUtils.identifier.js";
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
import { assertTokenSecrets } from "../authToken/authToken.signing.js";
import { assertPositiveSeconds } from "../authSession/authSession.core.js";
import {
  AccountDeactivatedError,
  AuthConfigurationError,
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
const DUMMY_PASSWORD_HASH = `v1$scrypt$16384$8$5$${"A".repeat(43)}.${"A".repeat(
  86,
)}`;

export { throttleKey } from "./authProvider.throttle.js";

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
  /**
   * Accept access and refresh tokens that carry no `sid` claim (default:
   * `false`).
   *
   * Every pair `login()` mints is session-bound, so by default
   * `verifyToken()` and `refresh()` reject a token without a `sid`: such a
   * token cannot be revoked by `logout()` or `logoutAll()`, and accepting
   * it let a session-less refresh chain outlive "sign out everywhere". Set
   * this only if you also mint tokens with the standalone `createTokenPair()`
   * and verify them through this service.
   */
  readonly allowSessionlessTokens?: boolean;
  /**
   * Methods `createSessionForUser()` may start a session for, e.g.
   * `["oauth"]`. Default: none, so `createSessionForUser()` throws.
   *
   * That method checks no credential — your code asserts the user is
   * already authenticated — so it is off until you name the flows that
   * verify authentication themselves (an OAuth callback that validated
   * `state` and exchanged the code).
   */
  readonly externalSessionMethods?: readonly string[];
  /**
   * How `login()` normalizes the submitted identifier before `findUser()`
   * sees it. Default: {@link normalizeLoginIdentifier} (NFKC, trim, and
   * lower-case for an email). Pass `false` to hand `findUser()` the raw
   * string, or your own function to match how you store identifiers.
   */
  readonly normalizeIdentifier?: false | ((identifier: string) => string);
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
  /**
   * Start a session for a user your code has already authenticated some
   * other way — OAuth (`@zudojs/auth-oauth`), a passkey, a magic link — and
   * return tokens exactly as `login()` does, without a password check.
   *
   * Only for methods listed in `externalSessionMethods`; otherwise it throws
   * `AuthConfigurationError`. The user is loaded with `findUserById()`, and
   * an unknown user (`InvalidCredentialsError`) or a deactivated one
   * (`AccountDeactivatedError`) is refused. Never pass it a user id taken
   * from the request.
   */
  createSessionForUser(
    userId: UserId,
    options: ExternalSessionOptions,
  ): Promise<LoginResult>;
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
    allowSessionlessTokens,
    externalSessionMethods,
    normalizeIdentifier,
  } = config;

  // Fail at construction, not at the first login: a bad secret or a NaN
  // lifetime (`Number(process.env.X)` with X unset) otherwise surfaced as
  // a runtime error on the request path — or, for the session TTL, not at
  // all, because a NaN idle timeout produced sessions that never expired.
  assertTokenSecrets(tokenConfig);
  assertPositiveSeconds(sessionTtlSeconds, "sessionTtlSeconds");
  assertPositiveSeconds(absoluteSessionTtlSeconds, "absoluteSessionTtlSeconds");

  const throttle = createLoginThrottleGate(loginThrottle);
  const normalize =
    normalizeIdentifier === false
      ? (identifier: string) => identifier
      : (normalizeIdentifier ?? normalizeLoginIdentifier);
  const createSessionForUser = createExternalSessionStarter({
    methods: externalSessionMethods,
    findUserById,
    sessionStore,
    tokenConfig,
    sessionTtlSeconds,
    absoluteSessionTtlSeconds,
  });

  /**
   * Reject the token unless the session it was issued against is still
   * alive; refresh the session's idle timer when it is.
   */
  async function requireLiveSession(
    payload: TokenPayload,
  ): Promise<SessionId | undefined> {
    const sid = payload.sid;
    if (!sid) {
      if (allowSessionlessTokens) return undefined;
      throw new TokenInvalidError("Token is not bound to a session");
    }
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
     *
     * The identifier is normalized first (see `normalizeIdentifier`), so
     * `findUser()` and the lockout counters see one spelling of it.
     */
    async login(
      credentials: UserCredentials,
      context?: { readonly userAgent?: string; readonly ip?: string },
    ): Promise<LoginResult> {
      const identifier = normalize(credentials.identifier);
      const slot = await throttle.begin(identifier);

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
        await throttle.fail(identifier, slot);
        throw new InvalidCredentialsError();
      }

      // The credentials were correct, so the attempt counter is cleared even
      // if the account turns out to be unusable.
      await throttle.succeed(identifier);

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

    createSessionForUser,

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
