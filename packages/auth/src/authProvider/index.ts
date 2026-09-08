/**
 * Main auth service: login, token verification, RBAC checks.
 *
 * @module authProvider
 */

export {
  createAuthService,
  type AuthService,
  type AuthServiceConfig,
  type LoginResult,
  type UserLookup,
  type UserByIdLookup,
  type PasswordVerifier,
} from "./authProvider.core.js";
export { createMemoryLoginAttemptStore } from "./authAttempt.memory.js";
