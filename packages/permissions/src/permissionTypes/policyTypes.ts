/**
 * Role, resolver, cache, policy, explain, and options types.
 *
 * @module permissionTypes/policyTypes
 */

import type { PermissionActor } from "./permissionActor.js";
import type {
  PermissionRule,
  PermissionContext,
  PermissionDecision,
} from "./ruleTypes.js";

/** A role definition with permissions and optional inheritance. */
export interface RoleDefinition {
  /** Role name (e.g. "admin", "editor"). */
  readonly name: string;
  /**
   * Permissions granted by this role. May be empty for a role that exists
   * only to combine others through {@link RoleDefinition.inherits}.
   */
  readonly permissions: readonly string[];
  /** Roles this role inherits from. */
  readonly inherits?: readonly string[];
  /** Rules granted by this role, for ABAC beyond a permission string. */
  readonly rules?: readonly PermissionRule[];
  /** Role description. */
  readonly description?: string;
  /** Whether this is a system role (cannot be deleted). */
  readonly system?: boolean;
}

/** Resolves permissions for an actor from an external source. */
export interface PermissionResolver {
  resolvePermissions(
    actor: PermissionActor,
  ): Promise<readonly PermissionRule[]>;
}

/** Resolves roles for an actor from an external source. */
export interface RoleResolver {
  resolveRoles(actor: PermissionActor): Promise<readonly string[]>;
}

/** Cache adapter for authorization decisions. */
export interface PermissionCache {
  get(key: string): Promise<PermissionDecision | undefined>;
  set(
    key: string,
    value: PermissionDecision,
    options?: { readonly ttl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateActor(actorId: string): Promise<void>;
  /** Drops every entry. */
  clear?(): Promise<void>;
}

/** A named authorization policy. */
export interface PermissionPolicyDefinition {
  readonly name: string;
  /**
   * Permissions this policy applies to. Wildcards are honoured, so
   * `["post:*"]` covers `post:update` — the same matching grants use.
   */
  readonly permissions: readonly string[];
  /**
   * Whether a decision from this policy may be cached. A policy that reads
   * mutable state outside the actor and resource should set this to `false`.
   * Default: `true`.
   */
  readonly cacheable?: boolean;
  /** Higher priority policies are evaluated first. Default: 0. */
  readonly priority?: number;
  evaluate(
    context: PermissionContext,
  ): PermissionDecision | Promise<PermissionDecision>;
}

/** A step in an explain trace. */
export interface ExplainStep {
  readonly type:
    "role" | "permission" | "rule" | "policy" | "condition" | "cache" | "deny";
  readonly detail: string;
  readonly matched: boolean;
}

/** Full explanation of an authorization decision. */
export interface ExplainResult {
  readonly allowed: boolean;
  readonly steps: readonly ExplainStep[];
  /** The decision the steps explain. */
  readonly decision: PermissionDecision;
}

/** Options for authorization checks. */
export interface AuthorizationOptions {
  /**
   * Cancels the check. Evaluation aborts with an
   * `AuthorizationAbortedError`; it does not silently allow.
   */
  readonly signal?: AbortSignal;
  /** Overrides the engine's policy timeout, in milliseconds. */
  readonly policyTimeout?: number;
  /**
   * Request-scoped metadata made available to conditions and policies as
   * `PermissionContext.metadata` — tenant, IP, time of day.
   */
  readonly metadata?: ReadonlyMap<string, unknown> | Record<string, unknown>;
  /** Skips the decision cache for this check. */
  readonly skipCache?: boolean;
  /** Identifies the resource for caching. Falls back to `resource.id`. */
  readonly resourceId?: string;
}
