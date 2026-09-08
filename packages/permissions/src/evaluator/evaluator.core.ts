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
} from "../permissionTypes/index.js";
import { parsePermissionSafe, matches } from "../permission/permission.core.js";
import { compileRules, findMatchingRules } from "../rule/ruleCompiler.js";
import { evaluateRules } from "../rule/rule.core.js";
import {
  assertNotAborted,
  evaluatePolicies,
  resolveActorGrants,
  toMetadataMap,
  type EvaluatorOptions,
} from "./evaluator.pipeline.js";
import { permissionCacheKey } from "../cache/cache.core.js";

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

  /* ── Cache ───────────────────────────────────────────────────────────── */

  const cacheKey =
    options.cache && authOptions?.skipCache !== true
      ? permissionCacheKey(
          actor.id,
          permissionStr,
          authOptions?.resourceId ?? resourceIdOf(resource),
        )
      : undefined;

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

  /* ── Explicit denies ─────────────────────────────────────────────────── */

  for (const deny of actor.deniedPermissions ?? []) {
    // Denies go through the same matcher as grants. Comparing them as exact
    // strings meant `*:delete` was ignored while `*:delete` as a grant was
    // honoured — an asymmetry a deny list cannot survive.
    if (matches(deny, permissionStr)) {
      trace?.push({
        type: "deny",
        detail: `Explicit deny: ${deny}`,
        matched: true,
      });
      return denied("explicit_deny", { matchedPermission: deny });
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

  const ruleResult = await evaluateRules(
    findMatchingRules(compileRules(rules), permission),
    permission,
    context,
    {
      algorithm: options.algorithm,
      onConditionError: (rule, error) => {
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

  const decision = combine(ruleResult.allowed, outcome.decision, permissionStr);

  /* ── Cache write ─────────────────────────────────────────────────────── */

  if (options.cache && cacheKey && outcome.cacheable) {
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
 * A denying policy always wins. An allowing policy can grant access the rules
 * did not, which is what makes a policy an ABAC escape hatch rather than a
 * filter — but it can never override a denial.
 */
function combine(
  ruleAllowed: boolean,
  policyDecision: PermissionDecision | null,
  permissionStr: string,
): PermissionDecision {
  if (policyDecision && !policyDecision.allowed) return policyDecision;

  if (ruleAllowed) {
    return Object.freeze({
      allowed: true,
      reason: "role_permission",
      matchedPermission: permissionStr,
      ...(policyDecision?.policy ? { policy: policyDecision.policy } : {}),
    });
  }

  if (policyDecision?.allowed) return policyDecision;

  return denied("no_matching_rule");
}

/** Best-effort resource identity for the cache key. */
function resourceIdOf(resource: unknown): string | undefined {
  if (typeof resource !== "object" || resource === null) return undefined;
  const id = (resource as { id?: unknown }).id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return undefined;
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
