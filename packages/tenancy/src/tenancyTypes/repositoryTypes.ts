/**
 * Repository, cache, manager, and provisioner types.
 *
 * @module tenancyTypes/repositoryTypes
 */

import type { TenantId, TenantIsolationStrategy } from "./tenantIdentity.js";
import type { Tenant } from "./tenantInterface.js";

/** Repository for loading tenants. */
export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | undefined>;
  findBySlug?(slug: string): Promise<Tenant | undefined>;
  findByDomain?(domain: string): Promise<Tenant | undefined>;
}

/** Cache for tenant data. */
export interface TenantCache {
  get(id: TenantId): Promise<Tenant | undefined>;
  set(tenant: Tenant): Promise<void>;
  delete(id: TenantId): Promise<void>;
}

/** High-level tenant orchestration. */
export interface TenantManager {
  resolve(context: unknown): Promise<Tenant | undefined>;
  get(id: TenantId): Promise<Tenant | undefined>;
  require(id: TenantId): Promise<Tenant>;
}

/** Handles tenant setup operations. */
export interface TenantProvisioner {
  provision(tenant: Tenant): Promise<void>;
}

/** Isolation configuration for a tenant. */
export interface TenantIsolationConfig {
  readonly strategy: TenantIsolationStrategy;
  readonly identifier?: string;
}

/** Tenant configuration provider. */
export interface TenantConfigurationProvider {
  get<T = unknown>(tenantId: TenantId, key: string): Promise<T | undefined>;
  set<T = unknown>(tenantId: TenantId, key: string, value: T): Promise<void>;
}
