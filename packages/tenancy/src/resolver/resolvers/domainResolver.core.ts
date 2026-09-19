/**
 * Custom-domain tenant resolver.
 *
 * @module resolvers/domainResolver
 */

import type {
  TenantResolver,
  TenantResolution,
} from "../../tenancyTypes/resolverTypes.js";
import type { TenantId } from "../../tenancyTypes/tenantIdentity.js";
import type { Tenant } from "../../tenancyTypes/tenantInterface.js";
import { hostnameOf } from "./subdomainResolver.core.js";

/** Context type with a getHost method. */
export interface DomainContext {
  getHost(): string | undefined;
}

/** Where a domain is looked up. Supply one of the two. */
export interface DomainResolverOptions {
  /** A registry from `createDomainRegistry()`, or anything shaped like it. */
  readonly registry?: {
    resolve(domain: string): TenantId | undefined;
  };
  /** A repository with `findByDomain`, e.g. `createMemoryTenantRepository()`. */
  readonly repository?: {
    findByDomain?(domain: string): Promise<Tenant | undefined>;
  };
  /** Defaults to 75, between the header (80) and subdomain (70) resolvers. */
  readonly priority?: number;
}

/**
 * Create a tenant resolver that maps the request's host to a tenant through
 * a registered custom domain.
 *
 * Example: `acme.io` registered to tenant `t-1001` → tenant `t-1001`, source
 * `domain`, trust `verified`. A host nobody registered resolves to nothing,
 * so the chain moves on.
 */
export function createDomainResolver(
  options: DomainResolverOptions,
): TenantResolver<DomainContext> {
  const priority = options.priority ?? 75;

  return {
    name: "domain",
    priority,

    async resolve(
      context: DomainContext,
    ): Promise<TenantResolution | undefined> {
      const host = context.getHost();
      const hostname = host ? hostnameOf(host)?.toLowerCase() : undefined;
      if (!hostname) return undefined;

      const tenantId =
        options.registry?.resolve(hostname) ??
        (await options.repository?.findByDomain?.(hostname))?.id;
      if (!tenantId) return undefined;

      return { tenantId, source: "domain", trust: "verified" };
    },
  };
}
