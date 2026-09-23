/**
 * Policy registry and management for authorization.
 *
 * @module policy
 */

export {
  createPolicyRegistry,
  type PolicyRegistry,
  type PolicyRegistryOptions,
} from "./policyRegistry.js";

export { DEFAULT_POLICY_EFFECT, policyGrants } from "./policyEffect.core.js";
