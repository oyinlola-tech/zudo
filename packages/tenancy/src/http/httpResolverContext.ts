/**
 * Adapts an HTTP middleware context to the shape tenant resolvers expect.
 *
 * Resolvers take a narrow accessor object rather than a framework request, so
 * they can be reused off the HTTP path. The middleware is what bridges the
 * two; without this, passing the raw context type-checks (the resolver's
 * context parameter defaults to `unknown`) and fails on the first request.
 *
 * @module http/httpResolverContext
 */

import type { HttpMiddlewareContext } from "./httpTypes.js";

/** Claims extracted from a verified token. */
export interface TenantClaims {
  readonly [key: string]: unknown;
}

/** Everything the resolvers shipped with this package read from a request. */
export interface HttpResolverContext {
  getHeader(name: string): string | undefined;
  getHost(): string | undefined;
  getPath(): string | undefined;
  getClaims(): TenantClaims | undefined;
}

/** State key under which upstream auth middleware publishes token claims. */
export const TENANT_CLAIMS_STATE_KEY = "tenancy:claims";

/**
 * Build a resolver context from an HTTP middleware context.
 *
 * @param context - The framework request context.
 * @param getClaims - Optional override for reading verified token claims.
 *   Defaults to reading `tenancy:claims` from middleware state, which is where
 *   an authentication middleware is expected to publish them.
 * @returns An accessor object every shipped resolver understands.
 */
export function createHttpResolverContext(
  context: HttpMiddlewareContext,
  getClaims?: (context: HttpMiddlewareContext) => TenantClaims | undefined,
): HttpResolverContext {
  return {
    getHeader(name: string): string | undefined {
      return context.request.headers.get(name.toLowerCase());
    },

    getHost(): string | undefined {
      return context.request.headers.get("host");
    },

    getPath(): string | undefined {
      return context.request.path;
    },

    getClaims(): TenantClaims | undefined {
      if (getClaims) return getClaims(context);
      return context.state.get<TenantClaims>(TENANT_CLAIMS_STATE_KEY);
    },
  };
}
