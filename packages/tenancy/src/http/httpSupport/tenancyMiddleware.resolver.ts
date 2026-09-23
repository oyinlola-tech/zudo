/**
 * Normalises what `createResolveTenantMiddleware` accepts as its resolver.
 *
 * @module http/httpSupport/tenancyMiddleware.resolver
 */

import type { TenantResolver } from "../../tenancyTypes/resolverTypes.js";
import type { TenantResolverChain } from "../../resolver/resolverChain.core.js";

/**
 * A single resolver, or a resolver chain passed as it is.
 *
 * A chain's `resolve` returns the full `TenantResolutionResult`
 * (`{ resolution, candidates, conflict }`), not a `TenantResolution`, so it
 * is not itself a `TenantResolver`. The middleware used to take only the
 * resolver form: passing a chain was a type error, and cast through at
 * runtime every request was refused because the result object carries no
 * `trust`. Both forms are accepted now.
 */
export type TenantResolverSource<Context> =
  | TenantResolver<Context>
  | TenantResolverChain<Context>;

/**
 * Turn a resolver or a resolver chain into a `TenantResolver`.
 *
 * A chain is recognised structurally, by its `asResolver` method, so a chain
 * built by another copy of this package is adapted too. Anything else is
 * used as it is.
 *
 * @param source - A resolver, or a chain from `createResolverChain`.
 * @returns A resolver that yields the winning `TenantResolution`.
 */
export function toTenantResolver<Context>(
  source: TenantResolverSource<Context>,
): TenantResolver<Context> {
  if (isResolverChain(source)) return source.asResolver();
  return source;
}

function isResolverChain<Context>(
  source: TenantResolverSource<Context>,
): source is TenantResolverChain<Context> {
  return (
    typeof (source as Partial<TenantResolverChain<Context>>).asResolver ===
    "function"
  );
}
