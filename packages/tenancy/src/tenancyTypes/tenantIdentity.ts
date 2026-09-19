/**
 * Tenant identity types.
 *
 * @module tenancyTypes/tenantIdentity
 */

import type { TenantId } from "@zudojs/constants";

import { InvalidTenantIdError } from "../tenancyErrors/tenancyError.types.js";

/**
 * A tenant identifier.
 *
 * Owned by `@zudojs/constants` and re-exported here, so the monorepo has one
 * branded `TenantId`: a value typed by either package is accepted by both.
 * Tenancy used to declare its own, incompatible brand. `createTenantId` below
 * is the validating constructor; the one in `@zudojs/constants` only brands.
 */
export type { TenantId };

/**
 * Characters a tenant id may contain.
 *
 * Deliberately narrow. A tenant id is concatenated into cache keys, log lines,
 * schema names and file paths, so anything that could act as a separator or a
 * path segment in one of those contexts is rejected here rather than escaped
 * at every use site.
 */
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;

/** Maximum accepted tenant id length. */
export const MAX_TENANT_ID_LENGTH = 64;

/**
 * Create a validated TenantId.
 *
 * Input is trimmed, Unicode-normalized and lowercased before validation, so
 * two spellings of the same identifier cannot become two tenants.
 *
 * @param value - The candidate identifier.
 * @returns The normalized, validated tenant id.
 * @throws {InvalidTenantIdError} when the value is not a valid tenant id.
 */
export function createTenantId(value: string): TenantId {
  if (typeof value !== "string") throw new InvalidTenantIdError(String(value));

  const normalized = value.normalize("NFKC").trim().toLowerCase();

  if (normalized.length === 0 || normalized.length > MAX_TENANT_ID_LENGTH) {
    throw new InvalidTenantIdError(value);
  }

  if (!TENANT_ID_PATTERN.test(normalized)) {
    throw new InvalidTenantIdError(value);
  }

  return normalized as TenantId;
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
