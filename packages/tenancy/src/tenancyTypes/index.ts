/**
 * Core tenancy type definitions.
 *
 * @module tenancyTypes
 */

export {
  type TenantId,
  MAX_TENANT_ID_LENGTH,
  createTenantId,
  tryCreateTenantId,
  isValidTenantId,
  type TenantStatus,
} from "./tenantIdentity.js";

export {
  type Tenant,
  type TenantResolutionSource,
  type TenantTrustLevel,
  type TenantContext,
  type SystemContext,
  type TenantExecutionContext,
  type ExecutionTenantContext,
  type TenantRequirement,
  type TenantResource,
} from "./tenantInterface.js";

export {
  type TenantResolution,
  type TenantResolutionResult,
  type TenantResolver,
  type ResolverChainOptions,
} from "./resolverTypes.js";

export {
  type TenantRepository,
  type TenantCache,
} from "./repositoryTypes.js";

export { type TenantDomain } from "./repositoryTypes.js";
