/**
 * Tenant repository and manager.
 *
 * @module repository
 */

export {
  createMemoryTenantRepository,
  createDomainRegistry,
} from "./repository.core.js";
export type {
  MemoryTenantRepository,
  TenantWithDomains,
} from "./repository.core.js";

export {
  DEFAULT_TENANT_CACHE_TTL_MS,
  createTenantManager,
  type TenantManagerOptions,
} from "./tenantManager.core.js";
