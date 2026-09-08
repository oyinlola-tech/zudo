/**
 * Permission resolution and policy evaluation pipeline.
 *
 * @module evaluator/evaluator.pipeline
 */

import type {
  PermissionActor,
  PermissionContext,
  PermissionDecision,
  PermissionPolicyDefinition,
  PermissionRule,
  PermissionCache,
  PermissionResolver,
  RoleDefinition,
  RoleResolver,
  RuleCombiningAlgorithm,
  AuthorizationOptions,
} from "../permissionTypes/index.js";
import { resolveRolePermissions } from "../role/roleHierarchy.js";
import { matches } from "../permission/permission.core.js";
import {
  AuthorizationAbortedError,
  PolicyTimeoutError,
} from "../permissionErrors/index.js";

/** Configuration for the evaluator. */
export interface EvaluatorOptions {
  /** Function to look up a role definition by name. */
  readonly getRole?: (name: string) => RoleDefinition | undefined;
  /** Registered policies. */
  readonly policies?: readonly PermissionPolicyDefinition[];
  /** Static rules, evaluated alongside the actor's permissions. */
  readonly rules?: readonly PermissionRule[];
  /** Default timeout for async policy evaluation (ms). */
  readonly policyTimeout?: number;
  /** How competing rules combine. Default: `"deny-overrides"`. */
  readonly algorithm?: RuleCombiningAlgorithm;
  /** Decision cache. */
  readonly cache?: PermissionCache;
  /** Time-to-live for cached decisions, in ms. */
  readonly cacheTtlMs?: number;
  /** Loads additional rules for an actor from an external source. */
  readonly permissionResolver?: PermissionResolver;
  /** Loads additional roles for an actor from an external source. */
  readonly roleResolver?: RoleResolver;
  /**
   * Expands a permission into the ones it implies, so that granting
   * `post:admin` can carry `post:read` with it.
   */
  readonly expandImplied?: (permission: string) => readonly string[];
  /** Reports a failure that authorization swallowed to stay fail-closed. */
  readonly onError?: (error: unknown, source: string) => void;
}

/** The permissions and rules an actor holds, once everything is resolved. */
export interface ResolvedGrants {
  readonly permissions: readonly string[];
  readonly rules: readonly PermissionRule[];
  /** Roles that could not be resolved. Their permissions are absent. */
  readonly unknownRoles: readonly string[];
}

/** Throws if the caller has cancelled the check. */
export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AuthorizationAbortedError();
}

/** Normalizes caller-supplied metadata into the map conditions read. */
export function toMetadataMap(
  metadata: AuthorizationOptions["metadata"],
): ReadonlyMap<string, unknown> | undefined {
  if (!metadata) return undefined;
  if (metadata instanceof Map) return metadata;
  return new Map(Object.entries(metadata));
}

/**
 * Resolve everything an actor holds: direct permissions, role permissions
 * (following inheritance), resolver-supplied roles and rules.
 *
 * A role the lookup cannot find is reported rather than thrown. An unknown
 * role in a token is a data problem, and turning every request from that
 * actor into an exception hands the decision to whichever error handler
 * happens to be installed — which may well be more permissive than a denial.
 */
export async function resolveActorGrants(
  actor: PermissionActor,
  options: EvaluatorOptions,
  signal?: AbortSignal,
): Promise<ResolvedGrants> {
  const permissions = new Set<string>();
  const rules: PermissionRule[] = [...(options.rules ?? [])];
  const unknownRoles: string[] = [];

  for (const permission of actor.permissions ?? []) {
    permissions.add(permission);
  }

  const roleNames = new Set(actor.roles ?? []);
  if (options.roleResolver) {
    assertNotAborted(signal);
    try {
      for (const role of await options.roleResolver.resolveRoles(actor)) {
        roleNames.add(role);
      }
    } catch (error) {
      options.onError?.(error, "RoleResolver.resolveRoles");
    }
  }

  if (roleNames.size > 0 && options.getRole) {
    const resolution = resolveRolePermissions([...roleNames], options.getRole, {
      onUnknownRole: (name) => unknownRoles.push(name),
    });
    for (const permission of resolution.permissions)
      permissions.add(permission);
    rules.push(...resolution.rules);
  }

  if (options.permissionResolver) {
    assertNotAborted(signal);
    try {
      rules.push(
        ...(await options.permissionResolver.resolvePermissions(actor)),
      );
    } catch (error) {
      options.onError?.(error, "PermissionResolver.resolvePermissions");
    }
  }

  if (options.expandImplied) {
    for (const permission of [...permissions]) {
      for (const implied of options.expandImplied(permission)) {
        permissions.add(implied);
      }
    }
  }

  return {
    permissions: [...permissions],
    rules,
    unknownRoles,
  };
}

/**
 * Resolve all permission strings for an actor (direct + role-based).
 *
 * Kept for callers that only need the strings; the engine uses
 * {@link resolveActorGrants}, which also carries rules and unknown roles.
 */
export function resolveActorPermissions(
  actor: PermissionActor,
  options: EvaluatorOptions,
): readonly string[] {
  const permissions = new Set<string>(actor.permissions ?? []);

  if (actor.roles && options.getRole) {
    const resolution = resolveRolePermissions(actor.roles, options.getRole, {
      onUnknownRole: () => {},
    });
    for (const permission of resolution.permissions)
      permissions.add(permission);
  }

  return [...permissions];
}

/** Policies that apply to a permission, most important first. */
export function selectPolicies(
  policies: readonly PermissionPolicyDefinition[],
  permissionStr: string,
): readonly PermissionPolicyDefinition[] {
  return policies
    .filter((policy) =>
      // Wildcards work here for the same reason they work for grants: a
      // policy registered for "post:*" is meant to cover "post:update".
      policy.permissions.some((pattern) => matches(pattern, permissionStr)),
    )
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/** The outcome of running the applicable policies. */
export interface PolicyOutcome {
  /** `null` when no policy applied. */
  readonly decision: PermissionDecision | null;
  /** Whether every policy that ran allows the result to be cached. */
  readonly cacheable: boolean;
  readonly evaluated: readonly string[];
}

/**
 * Evaluate policies for a context.
 *
 * Policies are evaluated highest priority first and short-circuit on the
 * first denial. A policy that throws or times out denies — an authorization
 * check that cannot complete must not fall through to "allowed".
 */
export async function evaluatePolicies(
  context: PermissionContext,
  policies: readonly PermissionPolicyDefinition[],
  options: EvaluatorOptions,
  authOptions?: AuthorizationOptions,
): Promise<PolicyOutcome> {
  if (policies.length === 0) {
    return { decision: null, cacheable: true, evaluated: [] };
  }

  const permissionStr = `${context.permission.resource}:${context.permission.action}`;
  const applicable = selectPolicies(policies, permissionStr);

  if (applicable.length === 0) {
    return { decision: null, cacheable: true, evaluated: [] };
  }

  // The per-call timeout wins, but the engine-level default is what makes a
  // configured timeout mean anything at all.
  const timeoutMs = authOptions?.policyTimeout ?? options.policyTimeout;
  const evaluated: string[] = [];
  let cacheable = true;

  for (const policy of applicable) {
    assertNotAborted(context.signal ?? authOptions?.signal);
    evaluated.push(policy.name);
    if (policy.cacheable === false) cacheable = false;

    try {
      const result = await withTimeout(
        Promise.resolve(policy.evaluate(context)),
        timeoutMs,
        policy.name,
      );

      if (!result.allowed) {
        return {
          decision: Object.freeze({
            allowed: false,
            reason: result.reason ?? `policy:${policy.name}`,
            policy: policy.name,
            publicReason: result.publicReason ?? "Access denied",
          }),
          cacheable,
          evaluated,
        };
      }
    } catch (error) {
      if (error instanceof AuthorizationAbortedError) throw error;
      options.onError?.(error, `Policy.${policy.name}`);
      // Policy error — fail closed.
      return {
        decision: Object.freeze({
          allowed: false,
          reason: `policy_error:${policy.name}`,
          policy: policy.name,
          publicReason: "Access denied",
        }),
        cacheable: false,
        evaluated,
      };
    }
  }

  return {
    decision: Object.freeze({
      allowed: true,
      reason: "policy_allow",
      policy: applicable.map((policy) => policy.name).join(","),
    }),
    cacheable,
    evaluated,
  };
}

/**
 * Run a promise with an optional timeout.
 *
 * `0` means "expire immediately", not "no timeout" — treating a falsy value
 * as "disabled" silently turned `policyTimeout: 0` into no timeout at all.
 * Pass `undefined` to disable.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  policyName = "policy",
): Promise<T> {
  if (timeoutMs === undefined) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  // Keep the loser handled so a late rejection cannot escape as an unhandled
  // rejection once the race is over.
  void promise.catch(() => {});

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            reject(new PolicyTimeoutError(policyName, timeoutMs));
          },
          Math.max(0, timeoutMs),
        );
        if (typeof timer === "object" && "unref" in timer) timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
