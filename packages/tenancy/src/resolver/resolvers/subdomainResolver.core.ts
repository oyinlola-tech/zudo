/**
 * Subdomain-based tenant resolver.
 *
 * @module resolvers/subdomainResolver
 */

import type {
  TenantResolver,
  TenantResolution,
} from "../../tenancyTypes/resolverTypes.js";
import { tryCreateTenantId } from "../../tenancyTypes/tenantIdentity.js";

/** Context type with a getHost method. */
export interface SubdomainContext {
  getHost(): string | undefined;
}

/** Options for the subdomain resolver. */
export interface SubdomainResolverOptions {
  /** Base domain to strip (e.g. "example.com"). If not set, uses first segment. */
  readonly baseDomain?: string;
  readonly priority?: number;
  /** Subdomains that never name a tenant. Defaults to `www`. */
  readonly reserved?: readonly string[];
  /**
   * Whether a multi-label subdomain may name a tenant.
   *
   * Off by default: with a base domain of `example.com`, `a.b.example.com`
   * would otherwise resolve to the tenant `a.b`, silently creating a second
   * identity for a host nobody provisioned.
   */
  readonly allowMultiLabel?: boolean;
}

/**
 * Strip the port from an authority, handling bracketed IPv6 literals.
 */
function hostnameOf(host: string): string | undefined {
  const trimmed = host.trim();
  if (trimmed.length === 0) return undefined;

  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close === -1 ? undefined : trimmed.slice(0, close + 1);
  }

  const [name] = trimmed.split(":");
  return name && name.length > 0 ? name : undefined;
}

/**
 * Create a tenant resolver that extracts tenant from subdomain.
 *
 * Example: "acme.example.com" → tenant "acme"
 */
export function createSubdomainResolver(
  options?: SubdomainResolverOptions,
): TenantResolver<SubdomainContext> {
  const priority = options?.priority ?? 70;
  const reserved = new Set(
    (options?.reserved ?? ["www"]).map((entry) => entry.toLowerCase()),
  );

  return {
    name: "subdomain",
    priority,

    async resolve(
      context: SubdomainContext,
    ): Promise<TenantResolution | undefined> {
      const host = context.getHost();
      if (!host) return undefined;

      const hostname = hostnameOf(host)?.toLowerCase();
      if (!hostname) return undefined;

      let subdomain: string | undefined;

      if (options?.baseDomain) {
        const base = options.baseDomain.toLowerCase();
        if (hostname.endsWith(`.${base}`)) {
          subdomain = hostname.slice(0, -(base.length + 1));
        }
      } else {
        const parts = hostname.split(".");
        if (parts.length > 2) subdomain = parts[0];
      }

      if (!subdomain) return undefined;
      if (reserved.has(subdomain)) return undefined;
      if (!options?.allowMultiLabel && subdomain.includes(".")) {
        return undefined;
      }

      const tenantId = tryCreateTenantId(subdomain);
      if (!tenantId) return undefined;

      return { tenantId, source: "subdomain", trust: "verified" };
    },
  };
}
