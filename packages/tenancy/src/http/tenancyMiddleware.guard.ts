/**
 * Tenant guard and propagation middleware.
 *
 * @module http/tenancyMiddleware.guard
 */

import type { Tenant, TenantContext } from "../tenancyTypes/tenantInterface.js";
import type { TenantRepository } from "../tenancyTypes/repositoryTypes.js";
import type { TenantContextStorage } from "../context/contextStorage.core.js";
import type { HttpMiddleware } from "./httpTypes.js";
import { createForbidden } from "./httpHelpers.js";
import {
  TENANT_STATE_KEY,
  TENANT_CONTEXT_STATE_KEY,
} from "./tenancyMiddleware.core.js";

// ─── Options ──────────────────────────────────────────────────────────────

/** Options for the tenant guard middleware. */
export interface TenantGuardMiddlewareOptions {
  /**
   * Repository consulted for the tenant's current status.
   *
   * Optional. Supplied, the guard re-reads the tenant rather than trusting
   * the copy an earlier middleware placed in request state — which is what
   * lets a tenant suspended mid-request be refused. Omitted, the guard checks
   * the state copy only.
   *
   * The previous shape required this field and a `storage` field, and read
   * neither.
   */
  readonly repository?: TenantRepository;
}

// ─── Middleware Factories ──────────────────────────────────────────────────

/**
 * Create middleware that validates tenant status.
 *
 * Ensures the resolved tenant is active before proceeding.
 */
export function createTenantGuardMiddleware(
  options: TenantGuardMiddlewareOptions = {},
): HttpMiddleware {
  return async (context, next) => {
    const tenant = context.state.get<Tenant>(TENANT_STATE_KEY);
    if (!tenant) return next();

    // A tenant that disappeared between resolution and this check must be
    // refused, not waved through on the stale state copy.
    const current = options.repository
      ? await options.repository.findById(tenant.id)
      : tenant;

    if (!current) {
      return createForbidden(`Tenant "${tenant.id}" is no longer available`);
    }

    if (current.status !== "active") {
      return createForbidden(
        `Tenant "${current.id}" is not available (status: ${current.status})`,
      );
    }

    return next();
  };
}

/**
 * Create middleware that propagates tenant context from state
 * into AsyncLocalStorage for downstream handlers.
 */
export function createTenantPropagationMiddleware(
  storage: TenantContextStorage,
): HttpMiddleware {
  return async (context, next) => {
    const tenant = context.state.get<Tenant>(TENANT_STATE_KEY);
    const tenantCtx = context.state.get<TenantContext>(
      TENANT_CONTEXT_STATE_KEY,
    );

    if (tenant && tenantCtx) {
      return storage.run(
        {
          mode: "tenant",
          tenant,
          context: tenantCtx,
        },
        () => next(),
      );
    }

    return next();
  };
}
