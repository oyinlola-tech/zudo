/**
 * Core permission type definitions.
 *
 * @module permissionTypes
 */

export {
  type PermissionActor,
  type Permission,
  type PermissionString,
} from "./permissionActor.js";

export {
  type RuleEffect,
  type RuleCombiningAlgorithm,
  type RuleEvaluation,
  type PermissionRule,
  type PermissionConditionFn,
  type PermissionContext,
  type PermissionDecision,
} from "./ruleTypes.js";

export {
  type RoleDefinition,
  type PermissionResolver,
  type RoleResolver,
  type PermissionCache,
  type PermissionPolicyDefinition,
  type ExplainStep,
  type ExplainResult,
  type AuthorizationOptions,
} from "./policyTypes.js";
