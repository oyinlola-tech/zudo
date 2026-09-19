/**
 * Support for the authorization engine: configuration validation, the
 * decision-cache key, and the audit-event wrapper every decision path uses.
 *
 * @module evaluator/engineSupport
 */

export {
  invalidRulePattern,
  validatePolicy,
  validateRole,
  validateRoles,
  validateRule,
} from "./authorizationEngine.validation.js";
export { decisionCacheKey } from "./evaluator.cacheKey.js";
export { observed, resourceTypeOf } from "./evaluator.observed.js";
