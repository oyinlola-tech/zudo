/**
 * Core auth types: users, tokens, sessions, strategies, and RBAC.
 *
 * @module authTypes
 */

export {
  type UserId,
  type AuthUser,
  type UserCredentials,
  type UserRegistration,
} from "./authUser.type.js";
export {
  type JwtToken,
  type TokenId,
  type TokenPayload,
  type TokenPair,
  type TokenConfig,
  type TokenRevocationStore,
  type TokenVerificationResult,
} from "./authToken.type.js";
export {
  type SessionId,
  type AuthSession,
  type CreateSessionOptions,
  type SessionStore,
} from "./authSession.type.js";
export {
  type OAuthProvider,
  type OAuthConfig,
  type OAuthUserInfo,
  type OAuthResult,
  type AuthStrategy,
  type PasswordCredentials,
  type ApiKeyCredentials,
} from "./authStrategy.type.js";
export {
  type Permission,
  type Role,
  type GuardResult,
  type GuardContext,
} from "./authRbac.type.js";
