/**
 * Policy registry — manages named authorization policies.
 *
 * @module policy/policyRegistry
 */

import type { PermissionPolicyDefinition } from "../permissionTypes/index.js";
import { DuplicatePolicyError } from "../permissionErrors/index.js";
import { selectPolicies } from "../evaluator/evaluator.pipeline.js";
import { validatePolicy } from "../evaluator/engineSupport/index.js";
import { createChangeNotifier } from "../utils/utils.notifier.js";

/** Options for the policy registry. */
export interface PolicyRegistryOptions {
  /** Allow overwriting an existing policy. Defaults to false. */
  readonly allowOverride?: boolean;
  /**
   * Reject permission patterns that are not `resource:action`. Defaults to
   * true — a policy scoped to a pattern that never matches never runs, so a
   * mistyped lockdown would deny nothing.
   */
  readonly validatePermissions?: boolean;
}

/** A policy registry, usable directly as the engine's `policies` source. */
export interface PolicyRegistry {
  define(definition: PermissionPolicyDefinition): void;
  get(name: string): PermissionPolicyDefinition | undefined;
  has(name: string): boolean;
  forPermission(permission: string): readonly PermissionPolicyDefinition[];
  names(): readonly string[];
  all(): readonly PermissionPolicyDefinition[];
  remove(name: string): boolean;
  clear(): void;
  /**
   * Be told whenever the policy set changes. Returns an unsubscribe function.
   * An engine built on this registry subscribes itself, so a policy change
   * is not bypassed by a cached decision.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Create a policy registry.
 *
 * Pass it straight to `createPermissionEngine({ policies: registry })`.
 */
export function createPolicyRegistry(
  options?: PolicyRegistryOptions,
): PolicyRegistry {
  const policies = new Map<string, PermissionPolicyDefinition>();
  const allowOverride = options?.allowOverride ?? false;
  const validatePermissions = options?.validatePermissions ?? true;
  const changes = createChangeNotifier();

  return {
    /**
     * Register a policy.
     *
     * Re-registering a name is rejected unless `allowOverride` was set: a
     * second `define("owner-only", …)` used to replace the first in silence,
     * which is an authorization rule vanishing without a trace.
     *
     * @throws {InvalidPermissionError} when a permission pattern is malformed.
     */
    define(definition: PermissionPolicyDefinition): void {
      if (validatePermissions) validatePolicy(definition);
      if (policies.has(definition.name) && !allowOverride) {
        throw new DuplicatePolicyError(definition.name);
      }
      // Copy the permission list: a caller mutating the array it passed in
      // must not re-scope the policy after registration.
      policies.set(
        definition.name,
        Object.freeze({
          ...definition,
          permissions: Object.freeze([...definition.permissions]),
        }),
      );
      changes.notify();
    },

    get(name: string): PermissionPolicyDefinition | undefined {
      return policies.get(name);
    },

    has(name: string): boolean {
      return policies.has(name);
    },

    /**
     * Policies that apply to a permission, highest priority first.
     *
     * Delegates to the evaluator's own selection, so this and the engine can
     * never disagree about which policies cover a permission — they were two
     * copies of the same filter-and-sort before.
     */
    forPermission(permission: string): readonly PermissionPolicyDefinition[] {
      return selectPolicies([...policies.values()], permission);
    },

    names(): readonly string[] {
      return [...policies.keys()];
    },

    all(): readonly PermissionPolicyDefinition[] {
      return [...policies.values()];
    },

    remove(name: string): boolean {
      const removed = policies.delete(name);
      if (removed) changes.notify();
      return removed;
    },

    clear(): void {
      policies.clear();
      changes.notify();
    },

    subscribe(listener: () => void): () => void {
      return changes.subscribe(listener);
    },
  };
}
