/**
 * In-memory tenant repository and domain registry.
 *
 * @module repository/repository
 */

import type { TenantId } from "../tenancyTypes/tenantIdentity.js";
import type { Tenant } from "../tenancyTypes/tenantInterface.js";
import type {
  TenantDomain,
  TenantRepository,
} from "../tenancyTypes/repositoryTypes.js";
import { TenantAlreadyExistsError } from "../tenancyErrors/tenancyError.types.js";

/** A tenant plus the custom domains that resolve to it. */
export interface TenantWithDomains {
  readonly tenant: Tenant;
  readonly domains?: readonly string[];
}

/** Normalizes a domain for case-insensitive lookup. */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/** The in-memory repository plus its write surface. */
export interface MemoryTenantRepository extends TenantRepository {
  /** Look a tenant up by its slug. Always present on this implementation. */
  findBySlug(slug: string): Promise<Tenant | undefined>;
  /** Look a tenant up by a registered custom domain. */
  findByDomain(domain: string): Promise<Tenant | undefined>;
  /**
   * Insert or replace a tenant, re-indexing its slug and domains.
   *
   * @throws {TenantAlreadyExistsError} when the slug or one of the domains is
   *   already indexed to a different tenant.
   */
  add(tenant: Tenant, domains?: readonly string[]): void;
  /** Remove a tenant and every index entry pointing at it. */
  remove(id: TenantId): void;
  /** Every tenant currently stored. */
  all(): readonly Tenant[];
  /** Domains mapped to the given tenant. */
  domainsOf(id: TenantId): readonly string[];
}

/**
 * Create an in-memory tenant repository.
 *
 * Secondary indexes are rebuilt on every write. A tenant whose slug or domain
 * changed must not stay reachable under its previous one: the stale entry
 * would keep serving the pre-update record, including its pre-suspension
 * status.
 */
export function createMemoryTenantRepository(): MemoryTenantRepository {
  const tenants = new Map<string, Tenant>();
  const bySlug = new Map<string, TenantId>();
  const byDomain = new Map<string, TenantId>();

  function unindex(id: TenantId): void {
    for (const [slug, owner] of bySlug) {
      if (owner === id) bySlug.delete(slug);
    }
    for (const [domain, owner] of byDomain) {
      if (owner === id) byDomain.delete(domain);
    }
  }

  return {
    async findById(id: TenantId): Promise<Tenant | undefined> {
      return tenants.get(id);
    },

    async findBySlug(slug: string): Promise<Tenant | undefined> {
      const id = bySlug.get(slug.trim().toLowerCase());
      return id ? tenants.get(id) : undefined;
    },

    async findByDomain(domain: string): Promise<Tenant | undefined> {
      const id = byDomain.get(normalizeDomain(domain));
      return id ? tenants.get(id) : undefined;
    },

    add(tenant: Tenant, domains?: readonly string[]): void {
      // A slug or a domain already pointing at a different tenant must not be
      // silently reassigned: `findByDomain` is a tenant resolution path, so a
      // silent steal is a cross-tenant takeover, not a bookkeeping detail.
      const slug = tenant.slug?.trim().toLowerCase();
      if (slug) {
        const owner = bySlug.get(slug);
        if (owner !== undefined && owner !== tenant.id) {
          throw new TenantAlreadyExistsError(
            `slug "${slug}" is already registered to tenant "${owner}"`,
          );
        }
      }

      const normalizedDomains = (domains ?? []).map(normalizeDomain);
      for (const domain of normalizedDomains) {
        const owner = byDomain.get(domain);
        if (owner !== undefined && owner !== tenant.id) {
          throw new TenantAlreadyExistsError(
            `domain "${domain}" is already registered to tenant "${owner}"`,
          );
        }
      }

      unindex(tenant.id);
      tenants.set(tenant.id, tenant);

      if (slug) bySlug.set(slug, tenant.id);
      for (const domain of normalizedDomains) {
        byDomain.set(domain, tenant.id);
      }
    },

    remove(id: TenantId): void {
      unindex(id);
      tenants.delete(id);
    },

    all(): readonly Tenant[] {
      return Array.from(tenants.values());
    },

    domainsOf(id: TenantId): readonly string[] {
      return Array.from(byDomain.entries())
        .filter(([, owner]) => owner === id)
        .map(([domain]) => domain);
    },
  };
}

/**
 * Create a domain-to-tenant registry.
 */
export function createDomainRegistry() {
  const domains = new Map<string, TenantId>();

  return {
    /**
     * Map a domain to a tenant.
     *
     * @throws {TenantAlreadyExistsError} when the domain already resolves to
     *   a different tenant. Re-registering the same pair is a no-op.
     */
    register(domain: string, tenantId: TenantId): void {
      const normalized = normalizeDomain(domain);
      const owner = domains.get(normalized);

      if (owner !== undefined && owner !== tenantId) {
        throw new TenantAlreadyExistsError(
          `domain "${normalized}" is already registered to tenant "${owner}"`,
        );
      }

      domains.set(normalized, tenantId);
    },

    unregister(domain: string): void {
      domains.delete(normalizeDomain(domain));
    },

    resolve(domain: string): TenantId | undefined {
      return domains.get(normalizeDomain(domain));
    },

    all(): readonly TenantDomain[] {
      return Array.from(domains.entries()).map(([domain, tenantId]) => ({
        domain,
        tenantId,
      }));
    },
  };
}
