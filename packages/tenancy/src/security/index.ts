/**
 * Tenant security — validation, isolation, and access control.
 *
 * @module security
 */

export {
  getDefaultTrust,
  meetsTrustLevel,
  assertTenantUsable,
  assertTenantOwnership,
  assertTrustLevel,
  assertSameTenant,
  tenantKey,
  createTenantCacheKey,
} from "./guard.core.js";

export {
  createTenantCacheNamespace,
  createTenantCacheScope,
  TENANT_CACHE_PART_PATTERN,
  type TenantCacheScope,
} from "./tenantCache.helper.js";
