/**
 * Tenant context manager — high-level API for tenant context operations.
 *
 * @module context/contextManager
 */

import type { Tenant } from "../tenancyTypes/tenantInterface.js";
import type { TenantContextStorage } from "./contextStorage.core.js";
import type {
  SystemContext,
  TenantExecutionContext,
  ExecutionTenantContext,
} from "../tenancyTypes/tenantInterface.js";
import { TenantContextMissingError } from "../tenancyErrors/tenancyError.types.js";
import { assertTenantUsable } from "../security/guard.core.js";

/** Options for the context manager. */
export interface ContextManagerOptions {
  readonly storage: TenantContextStorage;
  /**
   * Allow entering a context for a non-active tenant. Defaults to false.
   *
   * This is the entry point for background jobs and scripts, where no HTTP
   * guard runs, so a suspended tenant is refused unless explicitly permitted.
   */
  readonly allowInactive?: boolean;
}

/**
 * Create a tenant context manager.
 */
export function createContextManager(options: ContextManagerOptions) {
  const { storage } = options;
  const allowInactive = options.allowInactive ?? false;

  // Methods close over these rather than reading `this`, so a method pulled
  // off the manager (`const { requireCurrentTenant } = manager`) still works
  // instead of failing with a TypeError that masks the real error.
  function getCurrentTenant(): Tenant | undefined {
    const ctx = storage.get();
    if (ctx?.mode === "tenant") return ctx.tenant;
    return undefined;
  }

  function run<T>(tenant: Tenant, callback: () => T): T {
    if (!allowInactive) assertTenantUsable(tenant);

    const context: TenantExecutionContext = {
      mode: "tenant",
      tenant,
      context: {
        tenantId: tenant.id,
        source: "manual",
        trust: "trusted",
        resolvedAt: new Date(),
        metadata: {},
      },
    };
    return storage.run(context, callback);
  }

  return {
    /**
     * Get the current execution context.
     */
    getCurrent(): ExecutionTenantContext | undefined {
      return storage.get();
    },

    /**
     * Get the current tenant, if any.
     */
    getCurrentTenant,

    /**
     * Require a current tenant — throws if missing.
     */
    requireCurrentTenant(): Tenant {
      const tenant = getCurrentTenant();
      if (!tenant) throw new TenantContextMissingError();
      return tenant;
    },

    /**
     * Check if running in system mode.
     */
    isSystemMode(): boolean {
      const ctx = storage.get();
      return ctx?.mode === "system";
    },

    /**
     * Run a callback within a tenant context.
     *
     * @throws {TenantUnavailableError} when the tenant is not active and
     *   `allowInactive` was not set.
     */
    run,

    /**
     * Run a callback in system mode (no tenant).
     */
    runSystem<T>(callback: () => T): T {
      const context: SystemContext = { mode: "system" };
      return storage.run(context, callback);
    },

    /**
     * Run a callback with a specific tenant (for switching).
     */
    runAs<T>(tenant: Tenant, callback: () => T): T {
      return run(tenant, callback);
    },
  };
}
