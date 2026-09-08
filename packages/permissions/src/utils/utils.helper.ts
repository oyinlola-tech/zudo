/**
 * Utility helpers for the permissions package.
 *
 * @module utils/utils
 */

import type { PermissionActor } from "../permissionTypes/index.js";
import { permissionCacheKey } from "../cache/cache.core.js";
import { createPermissionActor } from "../actor/actor.core.js";
import {
  formatPermission,
  parsePermissionSafe,
} from "../permission/permission.core.js";

/**
 * Create a permission check cache key.
 *
 * @deprecated Use `permissionCacheKey` from `@zudojs/permissions`. Two key
 * formats meant entries written with one were invisible to the invalidation
 * that understood the other; this now delegates to the canonical builder.
 */
export function createCacheKey(
  actorId: string,
  permission: string,
  resourceId?: string,
): string {
  return permissionCacheKey(actorId, permission, resourceId);
}

/**
 * Extract the resource type from a permission string.
 *
 * @example extractResource("post:update") → "post"
 * @example extractResource("billing.invoice:refund") → "billing.invoice"
 */
export function extractResource(permission: string): string {
  return parsePermissionSafe(permission)?.resource ?? permission;
}

/**
 * Extract the action from a permission string.
 *
 * @example extractAction("post:update") → "update"
 */
export function extractAction(permission: string): string {
  return parsePermissionSafe(permission)?.action ?? "";
}

/**
 * Build a permission string from resource and action.
 */
export function buildPermission(resource: string, action: string): string {
  return formatPermission(resource, action);
}

/**
 * Create a quick actor object.
 *
 * @deprecated Use `createPermissionActor`. This used to build an actor whose
 * role and permission arrays were not frozen, so two functions with the same
 * job produced objects with different mutability.
 */
export function createActor(
  id: string,
  options?: {
    readonly type?: string;
    readonly roles?: readonly string[];
    readonly permissions?: readonly string[];
    readonly deniedPermissions?: readonly string[];
  },
): PermissionActor {
  return createPermissionActor(id, options);
}
