/**
 * Tenant identity types.
 *
 * @module tenancyTypes/tenantIdentity
 */

import {
  createTenantId as createConstantsTenantId,
  MAX_TENANT_ID_LENGTH,
  TENANT_ID_PATTERN,
  type TenantId,
} from "@zudojs/constants";

import { InvalidTenantIdError } from "../tenancyErrors/tenancyError.types.js";

/**
 * A tenant identifier.
 *
 * Owned by `@zudojs/constants` and re-exported here, so the monorepo has one
 * branded `TenantId`: a value typed by either package is accepted by both.
 * Tenancy used to declare its own, incompatible brand.
 */
export type { TenantId };

/**
 * Maximum accepted tenant id length, and the allowed character pattern.
 *
 * Both are owned by `@zudojs/constants` and re-exported, so tenancy and
 * constants apply one rule. A tenant id is concatenated into cache keys, log
 * lines, schema names and file paths, so anything that could act as a
 * separator or a path segment is rejected rather than escaped at every use.
 */
export { MAX_TENANT_ID_LENGTH, TENANT_ID_PATTERN };

/**
 * Create a validated TenantId.
 *
 * Delegates to `createTenantId` in `@zudojs/constants` (NFKC-normalize,
 * trim, lowercase, then {@link TENANT_ID_PATTERN} and
 * {@link MAX_TENANT_ID_LENGTH}), so the two packages cannot disagree, and
 * rethrows its rejection as this package's {@link InvalidTenantIdError}.
 *
 * @param value - The candidate identifier.
 * @returns The normalized, validated tenant id.
 * @throws {InvalidTenantIdError} when the value is not a valid tenant id.
 */
export function createTenantId(value: string): TenantId {
  if (typeof value !== "string") throw new InvalidTenantIdError(String(value));
  try {
    return createConstantsTenantId(value);
  } catch {
    throw new InvalidTenantIdError(value);
  }
}

/**
 * Create a validated TenantId, or undefined when the value is unusable.
 *
 * Resolvers use this: an unparseable candidate means "this resolver found
 * nothing", not "the request is malformed".
 *
 * @param value - The candidate identifier.
 * @returns The tenant id, or undefined.
 */
export function tryCreateTenantId(value: unknown): TenantId | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return createTenantId(value);
  } catch {
    return undefined;
  }
}

/** Whether a value is a well-formed tenant id. */
export function isValidTenantId(value: unknown): value is TenantId {
  return tryCreateTenantId(value) !== undefined;
}

/** Tenant lifecycle status. */
export type TenantStatus =
  "provisioning" | "active" | "inactive" | "suspended" | "deleting" | "deleted";
