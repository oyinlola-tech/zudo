/**
 * Tenant guard — validates tenant access and isolation.
 *
 * @module security/guard
 */

import type { TenantId } from "../tenancyTypes/tenantIdentity.js";
import type {
  Tenant,
  TenantResource,
} from "../tenancyTypes/tenantInterface.js";
import type {
  TenantResolutionSource,
  TenantTrustLevel,
} from "../tenancyTypes/tenantInterface.js";
import {
  TenantAccessDeniedError,
  TenantIsolationError,
  TenantTrustLevelError,
  TenantUnavailableError,
} from "../tenancyErrors/tenancyError.types.js";

/**
 * Trust levels for resolution sources.
 *
 * `header` is untrusted: the value arrives on the wire under the client's
 * control unless a trusted proxy overwrites it, and this package cannot know
 * whether one does. Applications that can attest to their edge raise it
 * explicitly via `createHeaderResolver({ trust: "verified" })`.
 */
const TRUST_MAP: Record<TenantResolutionSource, TenantTrustLevel> = {
  jwt: "trusted",
  "api-key": "trusted",
  manual: "trusted",
  system: "trusted",
  subdomain: "verified",
  domain: "verified",
  header: "untrusted",
  path: "untrusted",
  custom: "untrusted",
};

/** Trust levels in ascending order of confidence. */
const TRUST_ORDER: readonly TenantTrustLevel[] = [
  "untrusted",
  "verified",
  "trusted",
];

/**
 * Get the default trust level for a resolution source.
 */
export function getDefaultTrust(
  source: TenantResolutionSource,
): TenantTrustLevel {
  return TRUST_MAP[source] ?? "untrusted";
}

/**
 * Compare two trust levels.
 *
 * @returns True when `actual` is at least as trusted as `required`.
 */
export function meetsTrustLevel(
  actual: TenantTrustLevel,
  required: TenantTrustLevel,
): boolean {
  return TRUST_ORDER.indexOf(actual) >= TRUST_ORDER.indexOf(required);
}

/**
 * Validate that a tenant is usable.
 */
export function assertTenantUsable(tenant: Tenant): void {
  if (tenant.status !== "active") {
    throw new TenantUnavailableError(tenant.id, tenant.status);
  }
}

/**
 * Validate tenant ownership of a resource.
 */
export function assertTenantOwnership(
  resource: TenantResource,
  tenantId: TenantId,
): void {
  if (resource.tenantId !== tenantId) {
    throw new TenantIsolationError(tenantId, resource.tenantId);
  }
}

/**
 * Validate that a trust level is sufficient.
 *
 * @throws {TenantTrustLevelError} when the resolution is not trusted enough.
 */
export function assertTrustLevel(
  actual: TenantTrustLevel,
  required: TenantTrustLevel,
  source: TenantResolutionSource,
): void {
  if (!meetsTrustLevel(actual, required)) {
    throw new TenantTrustLevelError(source, required, actual);
  }
}

/**
 * Assert that a caller may act on a tenant other than its own.
 *
 * @throws {TenantAccessDeniedError} when the two tenants differ.
 */
export function assertSameTenant(actual: TenantId, expected: TenantId): void {
  if (actual !== expected) {
    throw new TenantAccessDeniedError(actual);
  }
}

/**
 * Escape a key segment so it cannot forge a separator boundary.
 *
 * Tenant ids are already constrained by `createTenantId`, but arbitrary keys
 * are not; without this, a key of `"cache:k"` under tenant `a` collides with
 * key `"k"` under a tenant literally named `a:cache`.
 */
function escapeSegment(segment: string, separator: string): string {
  return segment.split(separator).join(`\\${separator}`);
}

/**
 * Create a tenant key for scoped resources.
 *
 * @param tenantId - The owning tenant.
 * @param key - The resource key within that tenant.
 * @param separator - Segment separator. Defaults to ":".
 * @returns A key that no other tenant's key can collide with.
 */
export function tenantKey(
  tenantId: TenantId,
  key: string,
  separator: string = ":",
): string {
  return [
    "tenant",
    escapeSegment(tenantId, separator),
    escapeSegment(key, separator),
  ].join(separator);
}

/**
 * Create a tenant cache key.
 */
export function createTenantCacheKey(tenantId: TenantId, key: string): string {
  return tenantKey(tenantId, key, ":");
}
