/**
 * HTTP middleware adapter for @zudojs/tenancy.
 *
 * Provides middleware factories that resolve and enforce tenant context.
 *
 * @module http/tenancyMiddleware
 *
 * Requires @zudojs/http as a peer dependency.
 */

import type {
  Tenant,
  TenantContext,
  TenantRequirement,
  TenantTrustLevel,
} from "../tenancyTypes/tenantInterface.js";
import type {
  TenantResolver,
  TenantResolution,
} from "../tenancyTypes/resolverTypes.js";
import type { TenantRepository } from "../tenancyTypes/repositoryTypes.js";
import type { TenantContextStorage } from "../context/contextStorage.core.js";
import type { HttpMiddleware, HttpMiddlewareContext } from "./httpTypes.js";
import type {
  HttpResolverContext,
  TenantClaims,
} from "./httpResolverContext.js";
import { createHttpResolverContext } from "./httpResolverContext.js";
import {
  createBadRequest,
  createForbidden,
  createNotFound,
  createUnauthorized,
} from "./httpHelpers.js";
import { meetsTrustLevel } from "../security/guard.core.js";
import {
  TenantResolutionConflictError,
  TenantResolutionError,
} from "../tenancyErrors/tenancyError.types.js";

// ─── State Keys ───────────────────────────────────────────────────────────

/** State key for the resolved tenant. */
export const TENANT_STATE_KEY = "tenancy:tenant";

/** State key for the tenant context. */
export const TENANT_CONTEXT_STATE_KEY = "tenancy:context";

// ─── Options ──────────────────────────────────────────────────────────────

/** Options for the resolve tenant middleware. */
export interface ResolveTenantMiddlewareOptions {
  /** Resolver chain or single resolver to determine tenant. */
  readonly resolver: TenantResolver<HttpResolverContext>;
  /** Repository to load the full tenant after resolution. */
  readonly repository: TenantRepository;
  /** Tenant context storage for propagation. */
  readonly storage: TenantContextStorage;
  /**
   * Minimum trust the resolution must carry. Defaults to `untrusted`.
   *
   * Set this on any route where a tenant resolved from a URL path or an
   * unverified header must not be honoured.
   */
  readonly minimumTrust?: TenantTrustLevel;
  /**
   * Whether a non-active tenant may proceed. Defaults to false.
   *
   * Enable only for routes that exist to serve suspended tenants, such as
   * billing or reactivation.
   */
  readonly allowInactive?: boolean;
  /**
   * Let a request that resolves to no tenant at all continue without one.
   * Defaults to false, which answers 404.
   *
   * This is what makes `createRequireTenantMiddleware({ requirement:
   * "optional" })` reachable: without it the resolve middleware refuses every
   * tenant-less request before the requirement is consulted. A resolution
   * that *was* produced is still checked in full — an unknown, untrusted or
   * suspended tenant is refused whether or not this is set.
   */
  readonly optional?: boolean;
  /** Reads verified token claims for the JWT resolver. */
  readonly getClaims?: (
    context: HttpMiddlewareContext,
  ) => TenantClaims | undefined;
  /** Custom error response for missing tenant. */
  readonly notFoundResponse?: (
    resolution: TenantResolution | undefined,
  ) => unknown;
}

/** Options for the require tenant middleware. */
export interface RequireTenantMiddlewareOptions {
  /** Requirement level. */
  readonly requirement?: TenantRequirement;
  /** Custom error response. */
  readonly deniedResponse?: (tenant: Tenant | undefined) => unknown;
}

// ─── Middleware Factories ──────────────────────────────────────────────────

/**
 * Create middleware that resolves the tenant from the request
 * and creates a tenant context.
 *
 * Enforces trust and tenant status itself rather than relying on a second
 * middleware being installed: the safe behaviour has to be the default.
 */
export function createResolveTenantMiddleware(
  options: ResolveTenantMiddlewareOptions,
): HttpMiddleware {
  const minimumTrust = options.minimumTrust ?? "untrusted";

  return async (context, next) => {
    let resolution: TenantResolution | undefined;

    try {
      resolution = await options.resolver.resolve(
        createHttpResolverContext(context, options.getClaims),
      );
    } catch (error) {
      // A resolver chain throws when a credential was rejected or when two
      // sources name different tenants. Letting that escape produced a 500
      // carrying the framework's own error text; both cases are a refusal
      // the caller caused, and neither may fall through to `next()`.
      if (error instanceof TenantResolutionConflictError) {
        return createForbidden(
          "Tenant could not be established: request sources name different tenants",
        );
      }

      if (error instanceof TenantResolutionError) {
        return createBadRequest("Tenant could not be resolved for this request");
      }

      throw error;
    }

    if (!resolution) {
      if (options.optional) return next();

      return options.notFoundResponse
        ? {
            status: 404,
            body: options.notFoundResponse(resolution),
            headers: { "content-type": "application/json" },
          }
        : createNotFound("Tenant not found");
    }

    if (!meetsTrustLevel(resolution.trust, minimumTrust)) {
      return createForbidden("Tenant could not be established for this route");
    }

    const tenant = await options.repository.findById(resolution.tenantId);

    if (!tenant) {
      return options.notFoundResponse
        ? {
            status: 404,
            body: options.notFoundResponse(resolution),
            headers: { "content-type": "application/json" },
          }
        : createNotFound("Tenant not found");
    }

    if (!options.allowInactive && tenant.status !== "active") {
      return createForbidden("Tenant is not available");
    }

    const tenantContext: TenantContext = {
      tenantId: tenant.id,
      source: resolution.source,
      trust: resolution.trust,
      resolvedAt: new Date(),
      metadata: resolution.metadata ?? {},
    };

    context.state.set(TENANT_STATE_KEY, tenant);
    context.state.set(TENANT_CONTEXT_STATE_KEY, tenantContext);

    return options.storage.run(
      { mode: "tenant", tenant, context: tenantContext },
      () => next(),
    );
  };
}

/**
 * Create middleware that enforces tenant presence.
 *
 * Must run after `createResolveTenantMiddleware`.
 */
export function createRequireTenantMiddleware(
  options?: RequireTenantMiddlewareOptions,
): HttpMiddleware {
  const requirement = options?.requirement ?? "required";

  return async (context, next) => {
    const tenant = context.state.get<Tenant>(TENANT_STATE_KEY);

    if (requirement === "forbidden") {
      if (tenant) {
        return createForbidden("Tenant context is not allowed for this route");
      }
      return next();
    }

    if (requirement === "optional") return next();

    if (!tenant) {
      return options?.deniedResponse
        ? {
            status: 401,
            body: options.deniedResponse(undefined),
            headers: { "content-type": "application/json" },
          }
        : createUnauthorized("Tenant context is required");
    }

    return next();
  };
}
