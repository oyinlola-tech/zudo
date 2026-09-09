/**
 * Access-related permission errors.
 */

import { ErrorCode } from "@zudojs/errors";
import { PermissionError } from "./permissionError.base.js";

/**
 * Access denied — the actor is not authorized.
 *
 * `AuthorizationError` exposes its body to the client, so the identifying
 * details go in `internal` rather than `metadata`: `actorId` is an internal
 * identifier and a policy name describes the shape of the authorization
 * model, neither of which belongs in a 403 body.
 */
export class PermissionDeniedError extends PermissionError {
  /** Detail for logs and audit trails. Never serialized to a client. */
  readonly details: {
    readonly actorId?: string;
    readonly permission?: string;
    readonly resourceType?: string;
    readonly reason?: string;
    readonly policy?: string;
  };

  constructor(
    message = "Access denied",
    options?: {
      readonly actorId?: string;
      readonly permission?: string;
      readonly resourceType?: string;
      readonly reason?: string;
      readonly policy?: string;
    },
  ) {
    super(message, {
      code: ErrorCode.ACCESS_DENIED,
      // Only the permission name, which the caller already knows because
      // they attempted it.
      metadata: { permission: options?.permission },
    });
    this.details = Object.freeze({ ...options });
  }
}

/**
 * A referenced permission does not exist in the registry.
 */
export class PermissionNotFoundError extends PermissionError {
  constructor(permission: string) {
    super(`Permission not found: ${permission}`, {
      code: ErrorCode.NOT_FOUND,
      metadata: { permission },
    });
  }
}

/**
 * A duplicate permission was registered.
 */
export class DuplicatePermissionError extends PermissionError {
  constructor(permission: string) {
    super(`Duplicate permission: ${permission}`, {
      code: ErrorCode.CONFLICT,
      metadata: { permission },
    });
  }
}

/**
 * A referenced role does not exist in the registry.
 */
export class RoleNotFoundError extends PermissionError {
  constructor(role: string) {
    super(`Role not found: ${role}`, {
      code: ErrorCode.NOT_FOUND,
      metadata: { role },
    });
  }
}

/**
 * A duplicate role was registered.
 */
export class DuplicateRoleError extends PermissionError {
  constructor(role: string) {
    super(`Duplicate role: ${role}`, {
      code: ErrorCode.CONFLICT,
      metadata: { role },
    });
  }
}

/**
 * A duplicate policy was registered.
 *
 * Silently replacing a policy is how an authorization rule disappears without
 * anyone noticing, so the registry rejects it unless override is asked for.
 */
export class DuplicatePolicyError extends PermissionError {
  constructor(policy: string) {
    super(`Duplicate policy: ${policy}`, {
      code: ErrorCode.CONFLICT,
      metadata: { policy },
    });
  }
}
