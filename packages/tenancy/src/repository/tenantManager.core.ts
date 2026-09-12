/**
 * Tenant manager — high-level orchestration.
 *
 * @module repository/tenantManager
 */

import type { TenantId } from "../tenancyTypes/tenantIdentity.js";
import type { Tenant } from "../tenancyTypes/tenantInterface.js";
import type { TenantResolution } from "../tenancyTypes/resolverTypes.js";
import type {
  TenantCache,
  TenantRepository,
} from "../tenancyTypes/repositoryTypes.js";
import type { TenantContextStorage } from "../context/contextStorage.core.js";
import {
  TenantNotFoundError,
  TenantUnavailableError,
} from "../tenancyErrors/tenancyError.types.js";

/** Default lifetime of a cached tenant record, in milliseconds. */
export const DEFAULT_TENANT_CACHE_TTL_MS = 30_000;

/** Options for the tenant manager. */
export interface TenantManagerOptions {
  readonly repository: TenantRepository;
  readonly cache?: TenantCache;
  readonly storage: TenantContextStorage;
  /**
   * How long a cached tenant may be served before it is re-read.
   *
   * Bounds the window in which a suspended tenant keeps being served from
   * cache. Set to 0 to disable caching entirely.
   */
  readonly cacheTtlMs?: number;
}

/**
 * Create a tenant manager.
 */
export function createTenantManager(options: TenantManagerOptions) {
  const { repository, cache, storage } = options;
  const ttl = options.cacheTtlMs ?? DEFAULT_TENANT_CACHE_TTL_MS;
  const cachedAt = new Map<string, number>();

  function isFresh(id: TenantId): boolean {
    const at = cachedAt.get(id);
    return at !== undefined && Date.now() - at < ttl;
  }

  async function loadTenant(id: TenantId): Promise<Tenant | undefined> {
    if (cache && ttl > 0 && isFresh(id)) {
      const cached = await cache.get(id);
      if (cached) return cached;
    }

    const tenant = await repository.findById(id);

    if (cache && ttl > 0) {
      if (tenant) {
        await cache.set(tenant);
        cachedAt.set(id, Date.now());
      } else {
        await cache.delete(id);
        cachedAt.delete(id);
      }
    }

    return tenant;
  }

  function assertActive(tenant: Tenant): void {
    if (tenant.status !== "active") {
      throw new TenantUnavailableError(tenant.id, tenant.status);
    }
  }

  async function require(id: TenantId): Promise<Tenant> {
    const tenant = await loadTenant(id);
    if (!tenant) throw new TenantNotFoundError(id);
    return tenant;
  }

  return {
    /**
     * Resolve tenant from a resolution.
     */
    async resolve(resolution: TenantResolution): Promise<Tenant | undefined> {
      return loadTenant(resolution.tenantId);
    },

    /**
     * Get a tenant by ID.
     */
    async get(id: TenantId): Promise<Tenant | undefined> {
      return loadTenant(id);
    },

    /**
     * Require a tenant by ID — throws if not found.
     */
    require,

    /**
     * Require a tenant that is also in an active state.
     *
     * Does not read `this`, so it survives being detached from the manager.
     */
    async requireActive(id: TenantId): Promise<Tenant> {
      const tenant = await require(id);
      assertActive(tenant);
      return tenant;
    },

    /**
     * Validate that a tenant is in an active state.
     */
    assertActive,

    /**
     * Get the current tenant from context.
     */
    getCurrent(): Tenant | undefined {
      const ctx = storage.get();
      if (ctx?.mode === "tenant") return ctx.tenant;
      return undefined;
    },

    /**
     * Invalidate a cached tenant.
     *
     * Call after any write that changes a tenant's status, so the change is
     * visible before the TTL would have expired.
     */
    async invalidate(id: TenantId): Promise<void> {
      cachedAt.delete(id);
      if (cache) await cache.delete(id);
    },
  };
}
