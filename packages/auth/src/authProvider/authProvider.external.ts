/**
 * Sessions for users authenticated outside `login()` — OAuth, passkeys,
 * magic links.
 *
 * @module authProvider/authProvider.external
 */

import type { AuthUser, UserId } from "../authTypes/authUser.type.js";
import type { TokenConfig, TokenPair } from "../authTypes/authToken.type.js";
import type { SessionId, SessionStore } from "../authTypes/authSession.type.js";
import { createTokenPair } from "../authToken/authToken.core.js";
import {
  AccountDeactivatedError,
  AuthConfigurationError,
  InvalidCredentialsError,
} from "../authErrors/authError.base.js";

/** Options for `AuthService.createSessionForUser()`. */
export interface ExternalSessionOptions {
  /**
   * How your code authenticated the user — `"oauth"`, `"passkey"`,
   * `"magic-link"`. It must be listed in the service's
   * `externalSessionMethods`, and is recorded on the session as
   * `metadata.authMethod`.
   */
  readonly method: string;
  /** Client user-agent string, recorded on the session. */
  readonly userAgent?: string;
  /** Client IP address, recorded on the session. */
  readonly ip?: string;
  /** Extra session metadata, e.g. `{ provider: "github" }`. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** What `createSessionForUser()` returns: the same shape as `login()`. */
export interface ExternalSessionResult {
  readonly user: AuthUser;
  readonly tokens: TokenPair;
  readonly sessionId: SessionId;
}

/** The parts of the service configuration the starter needs. */
export interface ExternalSessionDependencies {
  readonly methods: readonly string[] | undefined;
  readonly findUserById: (userId: UserId) => Promise<AuthUser | null>;
  readonly sessionStore: SessionStore;
  readonly tokenConfig: TokenConfig;
  readonly sessionTtlSeconds: number;
  readonly absoluteSessionTtlSeconds: number | undefined;
}

/**
 * Build `createSessionForUser()`.
 *
 * It performs no credential check: the caller asserts the user is already
 * authenticated. It is therefore off unless the service lists the method in
 * `externalSessionMethods` — a route that forwards a client-supplied user id
 * cannot reach it by default — and it still refuses unknown and deactivated
 * users.
 */
export function createExternalSessionStarter(
  deps: ExternalSessionDependencies,
): (userId: UserId, options: ExternalSessionOptions) => Promise<ExternalSessionResult> {
  const allowed = new Set(deps.methods ?? []);

  return async (userId, options) => {
    const method = options?.method;
    if (typeof method !== "string" || !allowed.has(method)) {
      throw new AuthConfigurationError(
        `createSessionForUser(): method "${String(method)}" is not enabled. ` +
          "List it in `externalSessionMethods` once your code verifies that " +
          "authentication itself (e.g. the OAuth callback).",
      );
    }
    if (typeof userId !== "string" || userId.length === 0) {
      throw new InvalidCredentialsError();
    }

    const user = await deps.findUserById(userId);
    if (!user) throw new InvalidCredentialsError();
    if (!user.active) throw new AccountDeactivatedError();

    const session = await deps.sessionStore.create({
      userId: user.id,
      userAgent: options.userAgent,
      ip: options.ip,
      ttlSeconds: deps.sessionTtlSeconds,
      absoluteTtlSeconds: deps.absoluteSessionTtlSeconds,
      metadata: { ...options.metadata, authMethod: method },
    });

    const tokens = createTokenPair(user.id, deps.tokenConfig, {
      roles: user.roles,
      sessionId: session.id,
      claims: user.claims,
    });

    return { user, tokens, sessionId: session.id };
  };
}
