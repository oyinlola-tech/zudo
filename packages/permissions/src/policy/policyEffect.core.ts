/**
 * Policy effect resolution: whether an allowing policy may grant access on
 * its own or only constrains what RBAC/ABAC already granted.
 *
 * @module policy/policyEffect.core
 */

import type {
  PermissionPolicyDefinition,
  PolicyEffect,
} from "../permissionTypes/index.js";

/** The effect a policy without its own `effect` has. */
export const DEFAULT_POLICY_EFFECT: PolicyEffect = "constrain";

/**
 * Whether a policy's allow is an independent grant.
 *
 * Only the exact value `"grant"` grants. A typo, a missing value or anything
 * else falls back to constraining, so a mistake narrows access instead of
 * widening it.
 *
 * @param policy - The policy that allowed.
 * @param defaultEffect - The engine's `defaultPolicyEffect`.
 */
export function policyGrants(
  policy: PermissionPolicyDefinition,
  defaultEffect: PolicyEffect = DEFAULT_POLICY_EFFECT,
): boolean {
  return (policy.effect ?? defaultEffect) === "grant";
}
