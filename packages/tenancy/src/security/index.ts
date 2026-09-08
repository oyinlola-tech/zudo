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
