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
  TokenConfig,
  TokenRevocationStore,
} from "../authTypes/authToken.type.js";
import type {
  SessionStore,
  CreateSessionOptions,
  SessionId,
} from "../authTypes/authSession.type.js";
import type { GuardResult } from "../authTypes/authRbac.type.js";
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
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
  AccountDeactivatedError,
} from "../authErrors/authError.base.js";

/** User lookup function provided by the consumer. */
export type UserLookup = (identifier: string) => Promise<AuthUser | null>;
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
  /** User lookup function */
  readonly findUser: UserLookup;
  /** Password verifier function */
  readonly verifyPassword: PasswordVerifier;
  /** Session TTL in seconds */
  readonly sessionTtlSeconds: number;
  /** Optional permission engine */
  readonly permissions?: PermissionEngine;
  /**
   * Optional revocation store. When provided, `refresh()` rotates refresh
   * tokens: the used token's `jti` is revoked so it cannot be replayed.
   */
  readonly revocationStore?: TokenRevocationStore;
}

/**
 * Auth service interface.
 */
export interface AuthService {
  login(
    credentials: UserCredentials,
    context?: { readonly userAgent?: string; readonly ip?: string },
  ): Promise<LoginResult>;
  verifyToken(token: string): Record<string, unknown>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(sessionId: SessionId): Promise<void>;
  checkAccess(
    userId: UserId,
    userRoles: readonly string[],
    permission: string,
    resourceOwnerId?: UserId,
  ): Promise<GuardResult>;
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
    verifyPassword: verifyPwd,
    sessionTtlSeconds,
    permissions,
    revocationStore,
  } = config;

  return {
    /**
     * Authenticate a user with credentials and return tokens + session.
     */
    async login(
      credentials: UserCredentials,
      context?: { readonly userAgent?: string; readonly ip?: string },
    ): Promise<LoginResult> {
      const user = await findUser(credentials.identifier);
      if (!user) {
        throw new InvalidCredentialsError();
      }
      if (!user.active) {
        throw new AccountDeactivatedError();
      }

      const valid = await verifyPwd(user.id, credentials.password);
      if (!valid) {
        throw new InvalidCredentialsError();
      }

      const tokens = createTokenPair(user.id, tokenConfig, {
        roles: user.roles,
      });
      const session = await sessionStore.create({
        userId: user.id,
        userAgent: context?.userAgent,
        ip: context?.ip,
        ttlSeconds: sessionTtlSeconds,
      });

      return { user, tokens, sessionId: session.id };
    },

    /**
     * Verify an access token and return the payload.
     */
    verifyToken(token: string) {
      const result = verifyAccessToken(token, tokenConfig);
      if (!result.valid) {
        if (result.error === "Token expired") {
          throw new TokenExpiredError(result.error);
        }
        throw new TokenInvalidError(
          result.error ?? "Token verification failed",
        );
      }
      return result.payload!;
    },

    /**
     * Refresh an access token using a refresh token.
     *
     * When a revocation store is configured, the used refresh token is
     * revoked (rotation) so it cannot be replayed.
     */
    async refresh(refreshToken: string): Promise<TokenPair> {
      const result = verifyRefreshToken(refreshToken, tokenConfig);
      if (!result.valid || !result.payload) {
        if (result.error === "Token expired") {
          throw new TokenExpiredError("Refresh token has expired");
        }
        throw new TokenInvalidError("Refresh token is invalid");
      }

      const { sub, jti, exp, roles } = result.payload;

      if (revocationStore && (await revocationStore.isRevoked(jti))) {
        throw new TokenRevokedError("Refresh token has been revoked");
      }

      const tokens = createTokenPair(sub, tokenConfig, { roles });

      if (revocationStore) {
        await revocationStore.revoke(jti, exp);
      }

      return tokens;
    },

    /**
     * Logout — destroy the session.
     */
    async logout(sessionId: SessionId): Promise<void> {
      await sessionStore.destroy(sessionId);
    },

    /**
     * Check if a user has a specific permission.
     * Delegates to @zudojs/permissions engine when configured.
     */
    async checkAccess(
      userId: UserId,
      userRoles: readonly string[],
      permission: string,
      resourceOwnerId?: UserId,
    ): Promise<GuardResult> {
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

      // Fallback: simple wildcard matching (no engine configured)
      return simpleGuard(userRoles, permission, userId, resourceOwnerId);
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
 * Simple fallback guard when no permissions engine is configured.
 * Grants access to resource owners and to the "admin" role only —
 * configure @zudojs/permissions for real role/permission matching.
 */
function simpleGuard(
  userRoles: readonly string[],
  permission: string,
  userId: UserId,
  resourceOwnerId?: UserId,
): GuardResult {
  // Ownership check
  if (resourceOwnerId && resourceOwnerId === userId) {
    return { allowed: true, userRoles: [...userRoles] };
  }

  if (userRoles.includes("admin")) {
    return { allowed: true, userRoles: [...userRoles] };
  }

  return {
    allowed: false,
    reason: `User lacks required permission: ${permission}`,
    requiredPermission: permission,
    userRoles: [...userRoles],
  };
}
