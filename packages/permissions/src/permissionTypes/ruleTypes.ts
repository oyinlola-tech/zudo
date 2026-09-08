/**
 * Rule, condition, context, and decision types.
 *
 * @module permissionTypes/ruleTypes
 */

import type { PermissionActor, Permission } from "./permissionActor.js";

/** Whether a rule allows or denies access. */
export type RuleEffect = "allow" | "deny";

/**
 * How competing rules are combined into one decision.
 *
 * - `"deny-overrides"` (the default) — any applicable deny wins, whatever its
 *   priority. This is the safe reading, and the one the documentation has
 *   always described.
 * - `"priority"` — the highest-priority rule wins; deny breaks a tie.
 */
export type RuleCombiningAlgorithm = "deny-overrides" | "priority";

/** A permission rule that grants or denies access under conditions. */
export interface PermissionRule {
  /** Allow or deny. */
  readonly effect: RuleEffect;
  /** Action(s) this rule applies to. */
  readonly action: string | readonly string[];
  /** Resource(s) this rule applies to. */
  readonly resource: string | readonly string[];
  /**
   * Optional condition for ABAC. A rule whose condition returns `false` does
   * not apply — neither to allow nor to deny.
   */
  readonly condition?: PermissionConditionFn;
  /** Rule priority — higher wins under the `"priority"` algorithm. */
  readonly priority?: number;
  /** Human-readable rule name for debugging. */
  readonly name?: string;
}

/** A function that evaluates whether a condition is met. */
export type PermissionConditionFn = (
  context: PermissionContext,
) => boolean | Promise<boolean>;

/** Context provided during authorization evaluation. */
export interface PermissionContext {
  /** The actor requesting access. */
  readonly actor: PermissionActor;
  /** The permission being checked, parsed into resource and action. */
  readonly permission: Permission;
  /** The target resource (optional). */
  readonly resource?: unknown;
  /**
   * Arbitrary metadata (IP, tenant, timestamp, etc.), supplied through
   * `AuthorizationOptions.metadata`. Conditions such as `tenantIsolation`
   * read the actor's tenant from here.
   */
  readonly metadata?: ReadonlyMap<string, unknown>;
  /** Cancels long-running conditions and policies. */
  readonly signal?: AbortSignal;
}

/** Result of an authorization check. */
export interface PermissionDecision {
  /** Whether the action is allowed. */
  readonly allowed: boolean;
  /**
   * Why the decision came out this way, as a stable machine-readable code.
   *
   * Internal by design: it names policies and rules, so it belongs in a log,
   * not in a response body. {@link PermissionDecision.publicReason} is the
   * one safe to return to a caller.
   */
  readonly reason?: string;
  /** Name of the policy/rule that produced the decision. */
  readonly policy?: string;
  /** The matched permission string. */
  readonly matchedPermission?: string;
  /** A caller-safe message, free of policy and rule names. */
  readonly publicReason?: string;
  /** Additional decision metadata. */
  readonly metadata?: unknown;
}

/** The outcome of evaluating a rule set. */
export interface RuleEvaluation {
  readonly allowed: boolean;
  readonly matchedRule?: PermissionRule;
  /** Rules that matched the target and whose condition passed. */
  readonly applicable: readonly PermissionRule[];
}
