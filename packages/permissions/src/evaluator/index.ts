/**
 * Core permission evaluator — the heart of the authorization engine.
 *
 * @module evaluator
 */

export { evaluate, evaluateWithTrace } from "./evaluator.core.js";
export { evaluateWithExplain } from "./evaluator.explain.js";

export {
  resolveActorGrants,
  resolveActorPermissions,
  evaluatePolicies,
  selectPolicies,
  withTimeout,
  toMetadataMap,
  assertNotAborted,
  type EvaluatorOptions,
  type ResolvedGrants,
  type PolicyOutcome,
} from "./evaluator.pipeline.js";

export {
  createPermissionEngine,
  type PermissionEngine,
  type PermissionEngineOptions,
} from "./authorizationEngine.js";
