/**
 * Options and guard types.
 *
 * @module tenancyTypes/tenancyOptions
 */

import type { TenantId } from "./tenantIdentity.js";
import type { TenantRequirement } from "./tenantInterface.js";
import type { TenantResolver } from "./resolverTypes.js";
import type {
  TenantRepository,
  TenantCache,
  TenantProvisioner,
  TenantConfigurationProvider,
} from "./repositoryTypes.js";

/** Options for creating a tenancy service. */
export interface TenancyOptions {
  /** Resolvers for determining tenant from context. */
  readonly resolvers?: readonly TenantResolver[];
  /** Repository for loading tenants. */
  readonly repository?: TenantRepository;
  /** Cache for tenant data. */
  readonly cache?: TenantCache;
  /** Provisioner for tenant setup. */
  readonly provisioner?: TenantProvisioner;
  /** Configuration provider. */
  readonly configuration?: TenantConfigurationProvider;
  /** Default tenant requirement for routes. */
  readonly defaultRequirement?: TenantRequirement;
  /** Detect conflicts between resolvers. */
  readonly detectConflicts?: boolean;
}

/** Tenant domain mapping. */
export interface TenantDomain {
  readonly domain: string;
  readonly tenantId: TenantId;
}

/** Options for tenant scoping. */
export interface TenantScopeOptions {
  readonly prefix?: string;
  readonly separator?: string;
}
