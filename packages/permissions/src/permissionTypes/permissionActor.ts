/**
 * Core domain types: actor, permission, and permission string.
 *
 * @module permissionTypes/permissionActor
 */

/** An entity requesting access — user, service, worker, bot, etc. */
export interface PermissionActor {
  /** Unique identifier for the actor. */
  readonly id: string;
  /** Actor type (e.g. "user", "service", "system"). */
  readonly type?: string;
  /** Roles assigned to this actor. */
  readonly roles?: readonly string[];
  /** Direct permissions granted to this actor. */
  readonly permissions?: readonly string[];
  /** Permissions explicitly denied to this actor. */
  readonly deniedPermissions?: readonly string[];
}

/** A parsed permission with resource and action. */
export interface Permission {
  /** Resource being accessed (e.g. "post", "billing.invoice"). */
  readonly resource: string;
  /** Action being performed (e.g. "read", "update", "*"). */
  readonly action: string;
}

/**
 * Permission string format: "resource:action" or wildcards like "post:*",
 * "*:*".
 *
 * Kept as a plain `string` so existing call sites (values read from
 * configuration, databases or tokens) keep compiling. Use
 * {@link TypedPermissionString} where you want the compiler to insist on the
 * `resource:action` shape, and `toPermissionString()` / `isValidPermission()`
 * to move a runtime string into it.
 */
export type PermissionString = string;

/**
 * A permission string whose `resource:action` shape is checked by the
 * compiler: `"post:read"` and `"billing.*:refund"` are accepted,
 * `"postread"` is a type error. The full grammar (segment alphabet, no
 * partial wildcards) is still enforced at runtime by `parsePermission()`.
 */
export type TypedPermissionString = `${string}:${string}`;
