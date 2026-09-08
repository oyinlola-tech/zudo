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
import {
  PermissionDeniedError,
  InvalidRoleError,
} from "../permissionErrors/index.js";
import { isValidPermission } from "../permission/permission.core.js";
import { memoizeRoleLookup } from "../role/roleHierarchy.js";
import type { PermissionEventEmitter } from "../observability/observability.core.js";

/** Anything the engine will accept as its source of roles. */
export interface RoleSource {
  get(name: string): RoleDefinition | undefined;
}

/** Anything the engine will accept as its source of policies. */
export interface PolicySource {
  names(): readonly string[];
  get(name: string): PermissionPolicyDefinition | undefined;
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
  /** Expands a permission into the permissions it implies. */
  readonly expandImplied?: (permission: string) => readonly string[];
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

  /** Re-read the role source, discarding the memoized lookups. */
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

function validateRoles(roles: readonly RoleDefinition[]): void {
  const seen = new Set<string>();

  for (const role of roles) {
    if (!role.name || role.name.trim() === "") {
      throw new InvalidRoleError("Role name cannot be empty");
    }
    if (seen.has(role.name)) {
      throw new InvalidRoleError(
        `Role "${role.name}" is defined more than once`,
      );
    }
    seen.add(role.name);

    for (const permission of role.permissions) {
      if (!isValidPermission(permission)) {
        // A malformed grant can never match, so it is a silent no-op unless
        // it is rejected here.
        throw new InvalidRoleError(
          `Role "${role.name}" grants "${permission}", which is not a valid ` +
            `"resource:action" permission`,
        );
      }
    }
  }
}

/**
 * Create a permission engine.
 */
export function createPermissionEngine(
  options?: PermissionEngineOptions,
): PermissionEngine {
  const validateConfiguration = options?.validateConfiguration ?? true;

  let roleLookup: (name: string) => RoleDefinition | undefined;
  let invalidateRoleCache: () => void;

  if (isRoleSource(options?.roles)) {
    const source = options.roles;
    const memo = memoizeRoleLookup((name) => source.get(name));
    roleLookup = memo.lookup;
    invalidateRoleCache = memo.invalidate;
  } else {
    const list = (options?.roles ?? []) as readonly RoleDefinition[];
    if (validateConfiguration) validateRoles(list);
    const roleMap = new Map(list.map((role) => [role.name, role]));
    roleLookup = (name) => roleMap.get(name);
    invalidateRoleCache = () => {};
  }

  const policySource = isPolicySource(options?.policies)
    ? options.policies
    : undefined;
  const policyList = policySource
    ? undefined
    : ((options?.policies ?? []) as readonly PermissionPolicyDefinition[]);

  const resolvePolicies = (): readonly PermissionPolicyDefinition[] => {
    if (!policySource) return policyList ?? [];
    return policySource
      .names()
      .map((name) => policySource.get(name))
      .filter(
        (policy): policy is PermissionPolicyDefinition => policy !== undefined,
      );
  };

  const evaluatorOptions = (): EvaluatorOptions => ({
    getRole: roleLookup,
    policies: resolvePolicies(),
    rules: options?.rules,
    policyTimeout: options?.policyTimeout,
    algorithm: options?.algorithm,
    cache: options?.cache,
    cacheTtlMs: options?.cacheTtlMs,
    permissionResolver: options?.permissionResolver,
    roleResolver: options?.roleResolver,
    expandImplied: options?.expandImplied,
    onError: options?.onError,
  });

  const emitter = options?.emitter;

  /**
   * Runs a check and emits an audit event whichever way it ends — including
   * when it throws. An authorization trail that records only the successful
   * paths is not a trail.
   */
  async function runCheck(
    actor: PermissionActor,
    permission: string,
    resource: unknown,
    authOptions?: AuthorizationOptions,
  ): Promise<PermissionDecision> {
    const start = performance.now();
    let decision: PermissionDecision | undefined;
    let failure: unknown;

    try {
      decision = await evaluate(
        actor,
        permission,
        resource,
        evaluatorOptions(),
        authOptions,
      );
      return decision;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      emitter?.emit({
        actorId: actor.id,
        permission,
        resourceType: resourceTypeOf(resource),
        allowed: decision?.allowed ?? false,
        reason:
          decision?.reason ??
          (failure instanceof Error ? `error:${failure.name}` : undefined),
        durationMs: performance.now() - start,
        errored: failure !== undefined,
      });
    }
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
      return evaluateWithTrace(
        actor,
        permission,
        resource,
        evaluatorOptions(),
        authOptions,
      );
    },

    createAbility(actor) {
      return createAbility(actor, evaluatorOptions(), emitter);
    },

    async invalidateActor(actorId) {
      await options?.cache?.invalidateActor(actorId);
    },

    invalidateRoles() {
      invalidateRoleCache();
    },
  };
}

/** Best-effort resource type for an audit event. */
function resourceTypeOf(resource: unknown): string | undefined {
  if (typeof resource !== "object" || resource === null) return undefined;
  const record = resource as {
    type?: unknown;
    constructor?: { name?: string };
  };
  if (typeof record.type === "string") return record.type;
  const name = record.constructor?.name;
  return name && name !== "Object" ? name : undefined;
}
