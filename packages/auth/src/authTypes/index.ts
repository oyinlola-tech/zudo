/**
 * Core auth types: users, tokens, sessions, credentials, and RBAC.
 *
 * @module authTypes
 */

export {
  type UserId,
  toUserId,
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
  toSessionId,
  type AuthSession,
  type CreateSessionOptions,
  type SessionStore,
} from "./authSession.type.js";
export {
  type PasswordCredentials,
  type ApiKeyCredentials,
} from "./authCredentials.type.js";
export {
  type LoginAttemptRecord,
  type LoginAttemptStore,
  type LoginThrottleConfig,
} from "./authAttempt.type.js";
export {
  type Permission,
  type Role,
  type GuardResult,
  type GuardContext,
} from "./authRbac.type.js";
