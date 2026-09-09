/**
 * Repository, cache, manager, and provisioner types.
 *
 * @module tenancyTypes/repositoryTypes
 */

import type { TenantId } from "./tenantIdentity.js";
import type { Tenant } from "./tenantInterface.js";

/** Repository for loading tenants. */
export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | undefined>;
  findBySlug?(slug: string): Promise<Tenant | undefined>;
  findByDomain?(domain: string): Promise<Tenant | undefined>;
}

/** A custom domain mapped to the tenant it serves. */
export interface TenantDomain {
  readonly domain: string;
  readonly tenantId: TenantId;
}

/** Cache for tenant data. */
export interface TenantCache {
  get(id: TenantId): Promise<Tenant | undefined>;
  set(tenant: Tenant): Promise<void>;
  delete(id: TenantId): Promise<void>;
}

