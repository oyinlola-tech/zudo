/**
 * Condition combinators for composing authorization policies.
 *
 * Conditions are evaluated by the rule engine: attach one to a
 * `PermissionRule` and the rule applies only when it returns `true`.
 *
 * @module conditions/conditions
 */

import type { PermissionConditionFn } from "../permissionTypes/index.js";

/**
 * All conditions must return true.
 */
export function allOf(
  ...conditions: readonly PermissionConditionFn[]
): PermissionConditionFn {
  return async (context) => {
    for (const condition of conditions) {
      if (!(await condition(context))) return false;
    }
    return true;
  };
}

/**
 * At least one condition must return true.
 */
export function anyOf(
  ...conditions: readonly PermissionConditionFn[]
): PermissionConditionFn {
  return async (context) => {
    for (const condition of conditions) {
      if (await condition(context)) return true;
    }
    return false;
  };
}

/**
 * Negate a condition.
 */
export function not(condition: PermissionConditionFn): PermissionConditionFn {
  return async (context) => !(await condition(context));
}

/**
 * Always allow — unconditional pass.
 */
export function always(): PermissionConditionFn {
  return () => true;
}

/**
 * Always deny — unconditional fail.
 */
export function never(): PermissionConditionFn {
  return () => false;
}

/** Compares two identifiers that may differ in type across a boundary. */
function sameId(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null) return false;
  if (right === undefined || right === null) return false;
  if (typeof left === typeof right) return left === right;
  // A numeric id from a database row against a string id from a token is the
  // common case, and a strict comparison silently denies.
  if (
    (typeof left === "string" || typeof left === "number") &&
    (typeof right === "string" || typeof right === "number")
  ) {
    return String(left) === String(right);
  }
  return false;
}

/**
 * Check that the actor owns the resource.
 *
 * @param ownerField - The field on the resource that holds the owner's ID. Defaults to "ownerId".
 */
export function isOwner(ownerField: string = "ownerId"): PermissionConditionFn {
  return (context) => {
    if (!context.resource || typeof context.resource !== "object") return false;
    const resource = context.resource as Record<string, unknown>;
    return sameId(resource[ownerField], context.actor.id);
  };
}

/**
 * Enforce tenant isolation — actor and resource must share the same tenant.
 *
 * The actor's tenant is read from `context.metadata`, which is supplied per
 * check through `AuthorizationOptions.metadata`:
 *
 * ```ts
 * engine.check(actor, "invoice:read", invoice, {
 *   metadata: { tenantId: request.tenantId },
 * });
 * ```
 *
 * @param actorTenantField - Key in the context metadata holding the actor's tenant. Defaults to "tenantId".
 * @param resourceTenantField - Field on the resource holding the tenant ID. Defaults to "tenantId".
 */
export function tenantIsolation(
  actorTenantField: string = "tenantId",
  resourceTenantField: string = "tenantId",
): PermissionConditionFn {
  return (context) => {
    const actorTenant = context.metadata?.get(actorTenantField);
    if (actorTenant === undefined || actorTenant === null) return false;
    if (!context.resource || typeof context.resource !== "object") return false;
    const resource = context.resource as Record<string, unknown>;
    return sameId(actorTenant, resource[resourceTenantField]);
  };
}

/** Check that a value in the context metadata equals an expected value. */
export function metadataEquals(
  key: string,
  expected: unknown,
): PermissionConditionFn {
  return (context) => context.metadata?.get(key) === expected;
}

/** Check that the resource field matches the expected value. */
export function resourceEquals(
  field: string,
  expected: unknown,
): PermissionConditionFn {
  return (context) => {
    if (!context.resource || typeof context.resource !== "object") return false;
    return (context.resource as Record<string, unknown>)[field] === expected;
  };
}
