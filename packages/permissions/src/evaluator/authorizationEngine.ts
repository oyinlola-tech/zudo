/**
 * Authorization engine — the main public API for permission checks.
 *
 * @module evaluator/authorizationEngine
 */

import type {
  PermissionActor,
  PermissionDecision,
  ExplainResult,
  PermissionRule,
  PermissionPolicyDefinition,
  PermissionCache,
  PermissionResolver,
  RoleResolver,
  RoleDefinition,
  RuleCombiningAlgorithm,
  AuthorizationOptions,
} from "../permissionTypes/index.js";
import { evaluate, evaluateWithTrace } from "./evaluator.core.js";
import type { EvaluatorOptions } from "./evaluator.pipeline.js";
import { createAbility, type Ability } from "../ability/ability.core.js";
import { PermissionDeniedError } from "../permissionErrors/index.js";
import { memoizeRoleLookup } from "../role/roleHierarchy.js";
import { freezeRoleDefinition } from "../role/roleRegistry.js";
import type { PermissionEventEmitter } from "../observability/observability.core.js";
import {
  validatePolicy,
  validateRole,
  validateRoles,
  validateRule,
} from "./engineSupport/index.js";
import { observed } from "./engineSupport/index.js";

/**
 * Anything the engine will accept as its source of roles.
 *
 * A source with `subscribe` (every `createRoleRegistry()`) is watched: a
 * `define`, `remove` or `clear` discards the engine's memoized roles and
 * every cached decision, so revoking a role takes effect on the next check.
 */
export interface RoleSource {
  get(name: string): RoleDefinition | undefined;
  subscribe?(listener: () => void): () => void;
}

/**
 * Anything the engine will accept as its source of policies.
 *
 * A source with `subscribe` (every `createPolicyRegistry()`) is watched the
 * same way, so a policy added or removed is not bypassed by a cached decision.
 */
export interface PolicySource {
  names(): readonly string[];
  get(name: string): PermissionPolicyDefinition | undefined;
  subscribe?(listener: () => void): () => void;
}

/**
 * Anything the engine will accept as its source of permission implications.
 *
 * A source with `subscribe` (every `createPermissionRegistry()`) is watched
 * like the role and policy registries: revoking an implication drops every
 * decision that was cached while it stood. A bare function cannot announce a
 * change, so an engine given one caches nothing — see
 * {@link PermissionEngineOptions.expandImplied}.
 */
export interface ImpliedPermissionSource {
  expandImplied(permission: string): readonly string[];
  subscribe?(listener: () => void): () => void;
}

/** Configuration for the permission engine. */
export interface PermissionEngineOptions {
  /**
   * Roles available to the engine — an array, or a registry created with
   * `createRoleRegistry()`.
   */
  readonly roles?: readonly RoleDefinition[] | RoleSource;
  /**
   * Policies to evaluate during authorization — an array, or a registry
   * created with `createPolicyRegistry()`.
   */
  readonly policies?: readonly PermissionPolicyDefinition[] | PolicySource;
  /** Static rules evaluated alongside the actor's permissions. */
  readonly rules?: readonly PermissionRule[];
  /** Default timeout for async policy evaluation (ms). */
  readonly policyTimeout?: number;
  /** How competing rules combine. Default: `"deny-overrides"`. */
  readonly algorithm?: RuleCombiningAlgorithm;
  /** Caches decisions. Create one with `createMemoryPermissionCache()`. */
  readonly cache?: PermissionCache;
  /** Time-to-live for cached decisions, in ms. */
  readonly cacheTtlMs?: number;
  /** Loads additional rules for an actor from an external source. */
  readonly permissionResolver?: PermissionResolver;
  /** Loads additional roles for an actor from an external source. */
  readonly roleResolver?: RoleResolver;
  /**
   * Describes the state a resolver is answering from, so that decisions it
   * influenced can be cached safely.
   *
   * A resolver reads authorization data the engine does not own and cannot
   * see change — a grants table, another service. Nothing about it is in the
   * decision-cache key, so an entry written while the resolver said "allow"
   * kept answering after the grant was withdrawn upstream. Resolver-backed
   * engines therefore **do not cache at all** unless this is supplied.
   *
   * Return a value that changes whenever the resolver's answer for this actor
   * could change — a version column, an `updatedAt` stamp, a grants-table
   * generation. Return `undefined` for an actor whose state cannot be
   * described, and that actor's decisions stay uncached.
   */
  readonly resolverCacheKey?: (actor: PermissionActor) => string | undefined;
  /**
   * Expands a permission into the permissions it implies.
   *
   * Prefer passing a `createPermissionRegistry()` — the engine subscribes to
   * it, so revoking an implication invalidates the decisions cached under it.
   * A bare function cannot announce a change, so an engine given one caches
   * no decisions rather than serving one from a revoked implication.
   */
  readonly expandImplied?:
    ((permission: string) => readonly string[]) | ImpliedPermissionSource;
  /** Emits an event for every completed check, including failures. */
  readonly emitter?: PermissionEventEmitter;
  /** Reports a failure authorization swallowed to stay fail-closed. */
  readonly onError?: (error: unknown, source: string) => void;
  /**
   * Rejects malformed configuration at construction instead of letting a
   * grant that can never match sit in the role table. Default: `true`.
   */
  readonly validateConfiguration?: boolean;
}

/**
 * The public permission engine API.
 */
export interface PermissionEngine {
  /**
   * Check if the actor can perform the action. Returns boolean.
   */
  can(
    actor: PermissionActor,
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<boolean>;

  /**
   * Full authorization check with decision details.
   */
  check(
    actor: PermissionActor,
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<PermissionDecision>;

  /**
   * Throw PermissionDeniedError if the actor is not authorized.
   */
  authorize(
    actor: PermissionActor,
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<void>;

  /**
   * Explain the authorization decision with step-by-step trace.
   */
  explain(
    actor: PermissionActor,
    permission: string,
    resource?: unknown,
    options?: AuthorizationOptions,
  ): Promise<ExplainResult>;

  /**
   * Create a pre-resolved Ability for an actor.
   */
  createAbility(actor: PermissionActor): Ability;

  /** Drop cached decisions for one actor. */
  invalidateActor(actorId: string): Promise<void>;

  /**
   * Re-read the role source, discarding the memoized lookups and every
   * cached decision. Registries created with `createRoleRegistry()` and
   * `createPolicyRegistry()` trigger this themselves on every change.
   */
  invalidateRoles(): void;
}

function isRoleSource(
  roles: PermissionEngineOptions["roles"],
): roles is RoleSource {
  return (
    roles !== undefined &&
    !Array.isArray(roles) &&
    typeof (roles as RoleSource).get === "function"
  );
}

function isPolicySource(
  policies: PermissionEngineOptions["policies"],
): policies is PolicySource {
  return (
    policies !== undefined &&
    !Array.isArray(policies) &&
    typeof (policies as PolicySource).names === "function"
  );
}

function isImpliedPermissionSource(
  source: PermissionEngineOptions["expandImplied"],
): source is ImpliedPermissionSource {
  return (
    source !== undefined &&
    typeof source !== "function" &&
    typeof source.expandImplied === "function"
  );
}

/**
 * Create a permission engine.
 */
export function createPermissionEngine(
  options?: PermissionEngineOptions,
): PermissionEngine {
  const validateConfiguration = options?.validateConfiguration ?? true;
  if (validateConfiguration) {
    for (const rule of options?.rules ?? []) validateRule(rule);
  }

  let roleLookup: (name: string) => RoleDefinition | undefined;
  let invalidateRoleCache: () => void;

  if (isRoleSource(options?.roles)) {
    const source = options.roles;
    // A role source is looked up lazily, so `validateConfiguration` has to be
    // applied lazily too. Checking only the array form left a registry-backed
    // engine accepting grants that can never match — the exact silent no-op
    // the option exists to prevent.
    const memo = memoizeRoleLookup((name) => {
      const role = source.get(name);
      if (role && validateConfiguration) validateRole(role);
      return role;
    });
    roleLookup = memo.lookup;
    invalidateRoleCache = memo.invalidate;
  } else {
    const list = (options?.roles ?? []) as readonly RoleDefinition[];
    if (validateConfiguration) validateRoles(list);
    // Copy each role, so a caller still holding the arrays it passed in
    // cannot widen a grant after validation has run.
    const roleMap = new Map(
      list.map((role) => [role.name, freezeRoleDefinition(role)]),
    );
    roleLookup = (name) => roleMap.get(name);
    invalidateRoleCache = () => {};
  }

  const policySource = isPolicySource(options?.policies)
    ? options.policies
    : undefined;
  const policyList = policySource
    ? undefined
    : ((options?.policies ?? []) as readonly PermissionPolicyDefinition[]);
  if (validateConfiguration) policyList?.forEach(validatePolicy);

  // A policy source is read lazily, so its validation is lazy too. Each
  // definition is checked once; a malformed one makes the check throw, which
  // never reads as an allow.
  const validatedPolicies = new WeakSet<PermissionPolicyDefinition>();
  const resolvePolicies = (): readonly PermissionPolicyDefinition[] => {
    if (!policySource) return policyList ?? [];
    return policySource
      .names()
      .map((name) => policySource.get(name))
      .filter(
        (policy): policy is PermissionPolicyDefinition => policy !== undefined,
      )
      .map((policy) => {
        if (validateConfiguration && !validatedPolicies.has(policy)) {
          validatePolicy(policy);
          validatedPolicies.add(policy);
        }
        return policy;
      });
  };

  // Every change to the configuration bumps the generation, which is part
  // of every decision-cache key: an entry written under an older role or
  // policy set can no longer be found, whatever cache adapter is in use.
  let generation = 0;
  const invalidateConfiguration = (): void => {
    generation += 1;
    invalidateRoleCache();
    const cleared = options?.cache?.clear?.();
    cleared?.catch((error: unknown) => {
      options?.onError?.(error, "PermissionCache.clear");
    });
  };
  if (isRoleSource(options?.roles)) {
    options.roles.subscribe?.(invalidateConfiguration);
  }
  policySource?.subscribe?.(invalidateConfiguration);

  // The third registry the README wires in. Without this, revoking an
  // implication left every decision it granted in the cache for the full TTL
  // — `skipCache: true` said "deny" while `can()` kept saying "allow".
  const impliedSource = isImpliedPermissionSource(options?.expandImplied)
    ? options.expandImplied
    : undefined;
  const expandImplied = impliedSource
    ? (permission: string): readonly string[] =>
        impliedSource.expandImplied(permission)
    : (options?.expandImplied as
        ((permission: string) => readonly string[]) | undefined);
  const impliedWatched =
    impliedSource?.subscribe?.(invalidateConfiguration) !== undefined;

  // Two inputs the cache key cannot describe. An implication source that
  // cannot announce a change, and a resolver reading state the engine does
  // not own, both make a cached allow outlive the grant behind it — so the
  // decision is not cached at all unless the caller closes the gap.
  const impliedUnwatched = expandImplied !== undefined && !impliedWatched;
  const resolverConfigured =
    options?.permissionResolver !== undefined ||
    options?.roleResolver !== undefined;
  const resolverCacheKey = options?.resolverCacheKey;

  const cacheScope = (actor: PermissionActor): string | undefined => {
    if (impliedUnwatched) return undefined;
    if (!resolverConfigured) return `g${generation}`;
    if (!resolverCacheKey) return undefined;
    const scope = resolverCacheKey(actor);
    return scope === undefined ? undefined : `g${generation}|r${scope}`;
  };

  // One live view over the configuration. `policies` is a getter so a
  // registry-backed engine re-reads the registry on every evaluation — an
  // Ability used to capture a snapshot of the policy list when it was
  // created, so a policy defined afterwards was enforced by `engine.can()`
  // and ignored by `ability.can()` for the same actor.
  const liveOptions: EvaluatorOptions = {
    getRole: (name) => roleLookup(name),
    get policies() {
      return resolvePolicies();
    },
    rules: options?.rules,
    policyTimeout: options?.policyTimeout,
    algorithm: options?.algorithm,
    cache: options?.cache,
    cacheTtlMs: options?.cacheTtlMs,
    permissionResolver: options?.permissionResolver,
    roleResolver: options?.roleResolver,
    expandImplied,
    onError: options?.onError,
    cacheScope,
  };
  const evaluatorOptions = (): EvaluatorOptions => liveOptions;

  const emitter = options?.emitter;

  /** Runs a check and emits an audit event whichever way it ends. */
  function runCheck(
    actor: PermissionActor,
    permission: string,
    resource: unknown,
    authOptions?: AuthorizationOptions,
  ): Promise<PermissionDecision> {
    return observed(
      emitter,
      actor,
      permission,
      resource,
      () =>
        evaluate(actor, permission, resource, evaluatorOptions(), authOptions),
      (decision) => decision,
    );
  }

  return {
    async can(actor, permission, resource, authOptions) {
      const decision = await runCheck(actor, permission, resource, authOptions);
      return decision.allowed;
    },

    async check(actor, permission, resource, authOptions) {
      return runCheck(actor, permission, resource, authOptions);
    },

    async authorize(actor, permission, resource, authOptions) {
      const decision = await runCheck(actor, permission, resource, authOptions);
      if (!decision.allowed) {
        // The public message names nothing internal; the reason and the
        // policy travel in metadata for the log.
        throw new PermissionDeniedError(
          decision.publicReason ?? "Access denied",
          {
            actorId: actor.id,
            permission,
            reason: decision.reason,
            policy: decision.policy,
          },
        );
      }
    },

    async explain(actor, permission, resource, authOptions) {
      return observed(
        emitter,
        actor,
        permission,
        resource,
        () =>
          evaluateWithTrace(
            actor,
            permission,
            resource,
            evaluatorOptions(),
            authOptions,
          ),
        (result) => result.decision,
      );
    },

    createAbility(actor) {
      return createAbility(actor, evaluatorOptions(), emitter);
    },

    async invalidateActor(actorId) {
      await options?.cache?.invalidateActor(actorId);
    },

    invalidateRoles() {
      invalidateConfiguration();
    },
  };
}
