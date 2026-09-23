/**
 * Core permission evaluator.
 *
 * One evaluation path, with an optional trace collector. `check` and
 * `explain` used to be ninety duplicated lines kept in sync by hand — in the
 * one pair of functions that must agree, since `explain` exists to say why
 * `check` decided what it did.
 *
 * @module evaluator/evaluator
 */

import type {
  PermissionActor,
  PermissionRule,
  PermissionContext,
  PermissionDecision,
  ExplainStep,
  ExplainResult,
  AuthorizationOptions,
  RuleEvaluation,
} from "../permissionTypes/index.js";
import {
  parsePermissionSafe,
  matches,
  permissionsOverlap,
} from "../permission/permission.core.js";
import { InvalidPermissionError } from "../permissionErrors/index.js";
import { compileRules, findMatchingRules } from "../rule/ruleCompiler.js";
import { evaluateRules } from "../rule/rule.core.js";
import { isWildcardTarget } from "../rule/rule.pattern.js";
import {
  assertNotAborted,
  evaluatePolicies,
  resolveActorGrants,
  toMetadataMap,
  type EvaluatorOptions,
} from "./evaluator.pipeline.js";
import { decisionCacheKey } from "./engineSupport/index.js";

export { evaluateWithExplain } from "./evaluator.explain.js";

/** Collects the steps that explain a decision. */
export interface TraceCollector {
  push(step: ExplainStep): void;
}

/** A public message that names nothing internal. */
const PUBLIC_DENIED = "Access denied";

function denied(
  reason: string,
  extra?: Partial<PermissionDecision>,
): PermissionDecision {
  return Object.freeze({
    allowed: false,
    reason,
    publicReason: PUBLIC_DENIED,
    ...extra,
  });
}

/**
 * Evaluate a single permission check and return a decision.
 *
 * Every failure path denies. An unparsable permission, an unknown role, a
 * policy that throws or times out — all of them produce a denial with a
 * reason, never an exception that some outer handler might turn into a pass.
 * The one exception is cancellation, which throws `AuthorizationAbortedError`
 * because the caller asked for the work to stop.
 */
export async function evaluate(
  actor: PermissionActor,
  permissionStr: string,
  resource: unknown,
  options: EvaluatorOptions,
  authOptions?: AuthorizationOptions,
  trace?: TraceCollector,
): Promise<PermissionDecision> {
  const signal = authOptions?.signal;
  assertNotAborted(signal);

  const permission = parsePermissionSafe(permissionStr);
  if (!permission) {
    trace?.push({
      type: "deny",
      detail: `Malformed permission: ${permissionStr}`,
      matched: false,
    });
    return denied("invalid_permission");
  }

  /* ── Explicit denies ─────────────────────────────────────────────────── */

  // Denies are checked before the cache is consulted. `deniedPermissions`
  // travels on the actor object, which is per-request data the cache key
  // knows nothing about, so a cached allow from an earlier call would
  // otherwise be served to a caller who has since denied the permission.
  for (const deny of actor.deniedPermissions ?? []) {
    // Denies go through the same matcher as grants. Comparing them as exact
    // strings meant `*:delete` was ignored while `*:delete` as a grant was
    // honoured — an asymmetry a deny list cannot survive.
    if (!parsePermissionSafe(deny)) {
      // A malformed deny can never match, so it would silently grant what it
      // was written to forbid. Report it rather than dropping it in silence.
      options.onError?.(
        new InvalidPermissionError(deny),
        "Actor.deniedPermissions",
      );
      trace?.push({
        type: "deny",
        detail: `Malformed deny ignored: ${deny}`,
        matched: false,
      });
      continue;
    }
    // Overlap, not match: for a concrete target the two are the same, but a
    // wildcard target (`post:*`) asks about every action under it, and a
    // deny on one of them has to refuse it.
    if (permissionsOverlap(deny, permissionStr)) {
      trace?.push({
        type: "deny",
        detail: `Explicit deny: ${deny}`,
        matched: true,
      });
      return denied("explicit_deny", { matchedPermission: deny });
    }
  }

  /* ── Cache ───────────────────────────────────────────────────────────── */

  const cacheKey = decisionCacheKey(
    actor,
    permissionStr,
    resource,
    options,
    authOptions,
  );

  if (options.cache && cacheKey) {
    try {
      const cached = await options.cache.get(cacheKey);
      if (cached) {
        trace?.push({
          type: "cache",
          detail: `Cache hit: ${cached.allowed ? "allow" : "deny"}`,
          matched: cached.allowed,
        });
        return cached;
      }
    } catch (error) {
      options.onError?.(error, "PermissionCache.get");
    }
  }

  /* ── Grants ──────────────────────────────────────────────────────────── */

  const grants = await resolveActorGrants(actor, options, signal);
  assertNotAborted(signal);

  for (const role of grants.unknownRoles) {
    options.onError?.(
      new Error(`Unknown role "${role}" for actor "${actor.id}"`),
      "RoleHierarchy",
    );
    trace?.push({
      type: "role",
      detail: `Unknown role: ${role}`,
      matched: false,
    });
  }

  if (trace) {
    for (const role of actor.roles ?? []) {
      trace.push({
        type: "role",
        detail: `Role: ${role}`,
        matched: !grants.unknownRoles.includes(role),
      });
    }
  }

  const matchedPermissions = grants.permissions.filter((granted) =>
    matches(granted, permissionStr),
  );

  if (trace) {
    // Only the grants that bear on this decision. Listing every permission
    // the actor holds turns a trace into a dump of their whole grant set.
    for (const granted of matchedPermissions) {
      trace.push({
        type: "permission",
        detail: `Permission: ${granted}`,
        matched: true,
      });
    }
    if (matchedPermissions.length === 0) {
      trace.push({
        type: "permission",
        detail: `No permission matched "${permissionStr}" among ${grants.permissions.length} granted`,
        matched: false,
      });
    }
  }

  /* ── Rules ───────────────────────────────────────────────────────────── */

  const context: PermissionContext = {
    actor,
    permission,
    resource,
    metadata: toMetadataMap(authOptions?.metadata),
    signal,
  };

  const rules: PermissionRule[] = [
    ...matchedPermissions.map((granted): PermissionRule => ({
      effect: "allow",
      resource: parsePermissionSafe(granted)?.resource ?? granted,
      action: parsePermissionSafe(granted)?.action ?? "*",
    })),
    ...grants.rules,
  ];

  // A wildcard target is not a key the index can look up, and the deny
  // rules that merely overlap it are exactly the ones an index lookup misses,
  // so it is checked against every rule.
  let conditionFailed = false;
  const ruleResult = await evaluateRules(
    isWildcardTarget(permission)
      ? rules
      : findMatchingRules(compileRules(rules), permission),
    permission,
    context,
    {
      algorithm: options.algorithm,
      onConditionError: (rule, error) => {
        conditionFailed = true;
        options.onError?.(error, `RuleCondition.${rule.name ?? "unnamed"}`);
      },
    },
  );

  if (trace) {
    for (const rule of ruleResult.applicable) {
      trace.push({
        type: "rule",
        detail: `Rule ${rule.effect}: ${rule.name ?? `${String(rule.resource)}:${String(rule.action)}`}`,
        matched: true,
      });
    }
  }

  /* ── Policies ────────────────────────────────────────────────────────── */

  const outcome = await evaluatePolicies(
    context,
    options.policies ?? [],
    options,
    authOptions,
  );

  if (trace) {
    for (const name of outcome.evaluated) {
      trace.push({
        type: "policy",
        detail: `Policy: ${name}`,
        matched: outcome.decision?.allowed ?? true,
      });
    }
  }

  const decision = combine(
    ruleResult,
    outcome.decision,
    outcome.grants,
    permissionStr,
  );

  /* ── Cache write ─────────────────────────────────────────────────────── */

  // A decision forced by a condition that threw describes the failure, not
  // the actor, and must not outlive it.
  if (options.cache && cacheKey && outcome.cacheable && !conditionFailed) {
    try {
      await options.cache.set(cacheKey, decision, {
        ttl: options.cacheTtlMs,
      });
    } catch (error) {
      options.onError?.(error, "PermissionCache.set");
    }
  }

  return decision;
}

/**
 * Combine the rule outcome with the policy outcome.
 *
 * A denying policy always wins. An allowing policy is, by default, only an
 * extra condition: the actor's roles, permissions or rules must still grant
 * the permission. It used to grant on its own, so a "business-hours" policy
 * handed `task:delete` to an actor with no roles at all. Only a policy with
 * `effect: "grant"` (or an engine with `defaultPolicyEffect: "grant"`) can
 * grant access the rules did not — and even then it never overrides a
 * denial, including one the *rules* produced. "The rules did not allow"
 * covers two cases: no rule matched, and a deny rule matched. Treating them
 * alike let an allowing policy for `post:*` cancel a `deny post:update` rule
 * — the exact inversion of `deny-overrides`.
 */
function combine(
  ruleResult: RuleEvaluation,
  policyDecision: PermissionDecision | null,
  policyGrants: boolean,
  permissionStr: string,
): PermissionDecision {
  if (policyDecision && !policyDecision.allowed) return policyDecision;

  const denyRule =
    !ruleResult.allowed && ruleResult.matchedRule?.effect === "deny"
      ? ruleResult.matchedRule
      : undefined;
  if (denyRule) {
    return denied("rule_deny", {
      matchedPermission: permissionStr,
      ...(denyRule.name ? { policy: denyRule.name } : {}),
    });
  }

  if (ruleResult.allowed) {
    return Object.freeze({
      allowed: true,
      reason: "role_permission",
      matchedPermission: permissionStr,
      ...(policyDecision?.policy ? { policy: policyDecision.policy } : {}),
    });
  }

  if (policyDecision?.allowed && policyGrants) return policyDecision;

  return denied("no_matching_rule");
}

/**
 * Evaluate and collect the trace, in one pass.
 *
 * `check` and `explain` share this, so a trace can never describe a decision
 * other than the one that was made.
 */
export async function evaluateWithTrace(
  actor: PermissionActor,
  permissionStr: string,
  resource: unknown,
  options: EvaluatorOptions,
  authOptions?: AuthorizationOptions,
): Promise<ExplainResult> {
  const steps: ExplainStep[] = [];
  const decision = await evaluate(
    actor,
    permissionStr,
    resource,
    options,
    authOptions,
    { push: (step) => steps.push(step) },
  );

  steps.push({
    type: decision.allowed ? "permission" : "deny",
    detail: `Decision: ${decision.allowed ? "allow" : "deny"} (${decision.reason ?? "unknown"})`,
    matched: decision.allowed,
  });

  return Object.freeze({
    allowed: decision.allowed,
    steps: Object.freeze(steps),
    decision,
  });
}
