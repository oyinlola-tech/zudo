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

/**
 * How a policy's decision combines with RBAC/ABAC, once its own `effect`
 * and the engine default are resolved.
 *
 * - `"constrain"`: an allow is "no objection", a deny denies.
 * - `"grant"` (a policy's own `effect: "grant"`): an allow grants, a deny
 *   *abstains* — the policy can add access but never take away what roles,
 *   permissions or rules grant.
 * - `"legacyGrant"` (a policy with no `effect` under an engine with
 *   `defaultPolicyEffect: "grant"`): the pre-1.4 behaviour, kept for
 *   backward compatibility — an allow grants and a deny denies.
 */
export type ResolvedPolicyMode = "constrain" | "grant" | "legacyGrant";

/**
 * Resolves a policy's {@link ResolvedPolicyMode}. Only the exact value
 * `"grant"` grants; any other explicit value constrains.
 *
 * @param policy - The policy.
 * @param defaultEffect - The engine's `defaultPolicyEffect`.
 */
export function resolvePolicyMode(
  policy: PermissionPolicyDefinition,
  defaultEffect: PolicyEffect = DEFAULT_POLICY_EFFECT,
): ResolvedPolicyMode {
  if (policy.effect === "grant") return "grant";
  if (policy.effect !== undefined) return "constrain";
  return defaultEffect === "grant" ? "legacyGrant" : "constrain";
}
