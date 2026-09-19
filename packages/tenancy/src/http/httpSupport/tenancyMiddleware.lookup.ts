/**
 * Loading the tenant a resolution names.
 *
 * @module http/tenancyMiddleware.lookup
 */

import type { Tenant } from "../../tenancyTypes/tenantInterface.js";
import type { TenantResolution } from "../../tenancyTypes/resolverTypes.js";
import type { TenantRepository } from "../../tenancyTypes/repositoryTypes.js";

/** Sources whose value is a human-facing name, not necessarily the id. */
const SLUG_SOURCES = new Set<TenantResolution["source"]>(["subdomain", "path"]);

/**
 * Load the tenant for a resolution.
 *
 * A subdomain or path segment names a tenant by its slug as often as by its
 * id — `acme.example.com` for the tenant whose id is `t-1001`. The id is
 * tried first; for those two sources the repository's `findBySlug` is the
 * fallback, when it has one and `slugLookup` is not `false`. Without it,
 * every tenant whose id differs from its slug was unreachable.
 */
export async function loadResolvedTenant(
  repository: TenantRepository,
  resolution: TenantResolution,
  slugLookup: boolean,
): Promise<Tenant | undefined> {
  const byId = await repository.findById(resolution.tenantId);
  if (byId) return byId;
  if (!slugLookup || !SLUG_SOURCES.has(resolution.source)) return undefined;
  return repository.findBySlug?.(resolution.tenantId);
}
