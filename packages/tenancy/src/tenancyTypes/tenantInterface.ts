/**
 * Tenant and context types.
 *
 * @module tenancyTypes/tenantInterface
 */

import type { TenantId, TenantStatus } from "./tenantIdentity.js";

/** A tenant entity. */
export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  readonly slug?: string;
  readonly status: TenantStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/** How the tenant was resolved. */
export type TenantResolutionSource =
  | "header"
  | "subdomain"
  | "domain"
  | "path"
  | "jwt"
  | "api-key"
  | "manual"
  | "system"
  | "custom";

/** Tenant trust level for resolution sources. */
export type TenantTrustLevel = "trusted" | "verified" | "untrusted";

/** A resolved tenant context for the current execution. */
export interface TenantContext {
  readonly tenantId: TenantId;
  readonly source: TenantResolutionSource;
  readonly trust: TenantTrustLevel;
  readonly resolvedAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** System-level execution context (no tenant). */
export interface SystemContext {
  readonly mode: "system";
}

/** Tenant-scoped execution context. */
export interface TenantExecutionContext {
  readonly mode: "tenant";
  readonly tenant: Tenant;
  readonly context: TenantContext;
}

/** Union of system and tenant execution contexts. */
export type ExecutionTenantContext = SystemContext | TenantExecutionContext;

/** Tenant requirement for routes/operations. */
export type TenantRequirement = "required" | "optional" | "forbidden";

/** Resource that belongs to a tenant. */
export interface TenantResource {
  readonly tenantId: TenantId;
}
