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
  type TenantIsolationStrategy,
  type TenancyMode,
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
  type TenantManager,
  type TenantProvisioner,
  type TenantIsolationConfig,
  type TenantConfigurationProvider,
} from "./repositoryTypes.js";

export {
  type TenancyOptions,
  type TenantDomain,
  type TenantScopeOptions,
} from "./tenancyOptions.js";
