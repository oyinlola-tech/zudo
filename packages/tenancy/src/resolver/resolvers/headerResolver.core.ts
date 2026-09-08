/**
 * Header-based tenant resolver.
 *
 * @module resolvers/headerResolver
 */

import type {
  TenantResolver,
  TenantResolution,
} from "../../tenancyTypes/resolverTypes.js";
import type { TenantTrustLevel } from "../../tenancyTypes/tenantInterface.js";
import { tryCreateTenantId } from "../../tenancyTypes/tenantIdentity.js";

/** Context type with a getHeader method. */
export interface HeaderContext {
  getHeader(name: string): string | undefined;
}

/** Options for the header resolver. */
export interface HeaderResolverOptions {
  readonly headerName?: string;
  readonly priority?: number;
  /**
   * Trust to assign to a tenant resolved from this header.
   *
   * Defaults to `untrusted`, because the header is client-supplied on the
   * wire. Raise it to `verified` only when a trusted proxy strips and re-sets
   * the header at the edge, so a client cannot forge it.
   */
  readonly trust?: TenantTrustLevel;
}

/**
 * Create a tenant resolver that reads from an HTTP header.
 */
export function createHeaderResolver(
  options?: HeaderResolverOptions,
): TenantResolver<HeaderContext> {
  const headerName = options?.headerName ?? "x-tenant-id";
  const priority = options?.priority ?? 80;
  const trust = options?.trust ?? "untrusted";

  return {
    name: "header",
    priority,

    async resolve(
      context: HeaderContext,
    ): Promise<TenantResolution | undefined> {
      const tenantId = tryCreateTenantId(context.getHeader(headerName));
      if (!tenantId) return undefined;

      return { tenantId, source: "header", trust };
    },
  };
}
