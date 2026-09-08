/**
 * @zudojs/permissions
 *
 * Authorization engine for the Zudojs framework.
 *
 * Supports RBAC, ABAC, resource policies, wildcards, role hierarchy,
 * condition combinators, ability compilation, decision caching, audit events
 * and explain mode.
 *
 * @module @zudojs/permissions
 */

export * from "./permissionTypes/index.js";
export * from "./permissionErrors/index.js";
export * from "./permission/index.js";
export * from "./actor/index.js";
export * from "./role/index.js";
export * from "./rule/index.js";
export * from "./conditions/index.js";
export * from "./policy/index.js";
export * from "./ability/index.js";
export * from "./evaluator/index.js";
export * from "./resolvers/index.js";
export * from "./cache/index.js";
export * from "./observability/index.js";
export * from "./utils/index.js";
export * from "./http/index.js";

export type {
  RoleSource,
  PolicySource,
} from "./evaluator/authorizationEngine.js";
