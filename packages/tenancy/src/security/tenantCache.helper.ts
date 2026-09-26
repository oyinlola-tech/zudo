/**
 * Tenant scoping for `@zudojs/cache`.
 *
 * @module security/tenantCache
 *
 * `createTenantCacheKey` builds `tenant:<id>:<key>`, which `@zudojs/cache`
 * refuses: its key parts may not contain the `:` separator, precisely so a
 * raw key cannot forge a namespace. The cache's own tenant boundary is the
 * `namespace` option, so the compatible shape is a namespace derived from
 * the tenant id plus the caller's key, passed separately:
 *
 * ```ts
 * const scope = createTenantCacheScope(tenantId, "dashboard.totals");
 * await cache.get(scope.key, { namespace: scope.namespace });
 * ```
 */

import { ValidationError } from "@zudojs/errors";
import type { TenantId } from "../tenancyTypes/tenantIdentity.js";

/**
 * The alphabet `@zudojs/cache` accepts for a key part
 * (`CACHE_KEY_PATTERN` there). Mirrored rather than imported: tenancy sits
 * below cache in the dependency tiers.
 */
export const TENANT_CACHE_PART_PATTERN: RegExp = /^[a-zA-Z0-9._-]+$/;

/** Prefix that keeps tenant namespaces apart from any other namespace. */
const NAMESPACE_PREFIX = "tenant.";

/** A tenant-scoped cache address: pass both halves to `@zudojs/cache`. */
export interface TenantCacheScope {
  /** Cache namespace for the tenant, e.g. `tenant.kola-motors`. */
  readonly namespace: string;
  /** The caller's key, unchanged. */
  readonly key: string;
}

/**
 * Cache namespace for a tenant: `tenant.<tenantId>`.
 *
 * Tenant ids are already constrained to `^[a-z0-9][a-z0-9_-]*$`, so the
 * result always satisfies the cache's part alphabet.
 */
export function createTenantCacheNamespace(tenantId: TenantId): string {
  return `${NAMESPACE_PREFIX}${tenantId}`;
}

/**
 * Build a tenant-scoped cache address that `@zudojs/cache` accepts.
 *
 * Isolation comes from the namespace, not from string concatenation, so two
 * tenants can never share a fully-qualified key whatever `key` is.
 *
 * @param tenantId - The owning tenant.
 * @param key - The resource key within that tenant. Must match
 *   {@link TENANT_CACHE_PART_PATTERN}; in particular it may not contain `:`.
 * @throws {ValidationError} when `key` would fail the cache's validation.
 */
export function createTenantCacheScope(
  tenantId: TenantId,
  key: string,
): TenantCacheScope {
  if (typeof key !== "string" || !TENANT_CACHE_PART_PATTERN.test(key)) {
    throw new ValidationError(
      `Tenant cache key ${JSON.stringify(key)} must match ${String(
        TENANT_CACHE_PART_PATTERN,
      )}; use "." or "-" instead of ":" to separate segments.`,
    );
  }
  return Object.freeze({
    namespace: createTenantCacheNamespace(tenantId),
    key,
  });
}
