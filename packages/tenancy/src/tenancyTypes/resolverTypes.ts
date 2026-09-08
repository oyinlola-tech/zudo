/**
 * Tenant resolver types.
 *
 * @module tenancyTypes/resolverTypes
 */

import type { TenantId } from "./tenantIdentity.js";
import type {
  TenantResolutionSource,
  TenantTrustLevel,
} from "./tenantInterface.js";

/** A tenant resolution result from a resolver. */
export interface TenantResolution {
  readonly tenantId: TenantId;
  readonly source: TenantResolutionSource;
  readonly trust: TenantTrustLevel;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Result of resolver chain execution with conflict detection. */
export interface TenantResolutionResult {
  readonly resolution: TenantResolution | undefined;
  readonly candidates: readonly TenantResolution[];
  readonly conflict: boolean;
}

/** Interface for tenant resolvers. */
export interface TenantResolver<Context = unknown> {
  readonly name: string;
  readonly priority: number;
  resolve(context: Context): Promise<TenantResolution | undefined>;
}

/** Options for resolver chain. */
export interface ResolverChainOptions {
  /** Name reported when the chain is used as a resolver. Defaults to "chain". */
  readonly name?: string;
  /** Priority when nested in another chain. Defaults to the highest member's. */
  readonly priority?: number;
  /**
   * Run every resolver and collect all candidates, rather than stopping at the
   * first match. Required for conflict detection.
   */
  readonly detectConflicts?: boolean;
  /**
   * Throw when candidates name different tenants. Defaults to true.
   *
   * Disagreement between a verified credential and a client-supplied header is
   * the signature of an attempted cross-tenant request.
   */
  readonly throwOnConflict?: boolean;
}
