/**
 * Resolver chain — coordinates multiple resolvers with conflict detection.
 *
 * @module resolver/resolverChain
 */

import type {
  TenantResolver,
  TenantResolution,
  TenantResolutionResult,
  ResolverChainOptions,
} from "../tenancyTypes/resolverTypes.js";
import {
  TenantResolutionConflictError,
  TenantResolutionError,
} from "../tenancyErrors/tenancyError.types.js";

/**
 * A resolver chain.
 *
 * Exposes the full result via `resolve`, and views itself as a single
 * `TenantResolver` via `asResolver()` so chains compose and can be passed
 * directly to the HTTP middleware.
 */
export interface TenantResolverChain<Context = unknown> {
  readonly name: string;
  readonly priority: number;
  resolve(context: Context): Promise<TenantResolutionResult>;
  resolveTenant(context: Context): Promise<TenantResolution | undefined>;
  asResolver(): TenantResolver<Context>;
}

/**
 * Create a resolver chain that tries resolvers in priority order.
 *
 * A resolver that returns `undefined` found nothing, and the chain moves on.
 * A resolver that *throws* rejected a credential — an expired JWT, a bad
 * signature — and the chain stops there. Continuing would let a lower-trust
 * source such as a client-supplied header decide the tenant for a request
 * whose credential was just refused.
 */
export function createResolverChain<Context = unknown>(
  resolvers: readonly TenantResolver<Context>[],
  options?: ResolverChainOptions,
): TenantResolverChain<Context> {
  // Sort by priority descending (higher priority first)
  const sorted = [...resolvers].sort((a, b) => b.priority - a.priority);
  const collectAll = options?.detectConflicts ?? false;

  const chain = {
    name: options?.name ?? "chain",
    priority:
      options?.priority ??
      sorted.reduce((highest, r) => Math.max(highest, r.priority), 0),

    /**
     * Resolve tenant from context using the chain.
     *
     * @throws {TenantResolutionError} when a resolver rejects a credential.
     * @throws {TenantResolutionConflictError} when sources disagree and
     *   `throwOnConflict` is set.
     */
    async resolve(context: Context): Promise<TenantResolutionResult> {
      const candidates: TenantResolution[] = [];

      for (const resolver of sorted) {
        let result: TenantResolution | undefined;

        try {
          result = await resolver.resolve(context);
        } catch (error) {
          throw new TenantResolutionError(
            `Tenant resolver "${resolver.name}" rejected the request`,
            error,
          );
        }

        if (!result) continue;
        candidates.push(result);
        if (!collectAll) break;
      }

      if (candidates.length === 0) {
        return { resolution: undefined, candidates: [], conflict: false };
      }

      const hasConflict =
        new Set(candidates.map((candidate) => candidate.tenantId)).size > 1;

      if (hasConflict && (options?.throwOnConflict ?? true)) {
        throw new TenantResolutionConflictError(
          candidates.map((c) => `${c.source}:${c.tenantId}`),
        );
      }

      return {
        resolution: candidates[0]!,
        candidates,
        conflict: hasConflict,
      };
    },

    /**
     * Resolve the winning tenant, discarding the candidate detail.
     *
     * This is what makes a chain a `TenantResolver`, so chains compose with
     * each other and can be handed straight to the HTTP middleware.
     */
    async resolveTenant(
      context: Context,
    ): Promise<TenantResolution | undefined> {
      return (await chain.resolve(context)).resolution;
    },

    /** View the chain as a single resolver. */
    asResolver(): TenantResolver<Context> {
      return {
        name: chain.name,
        priority: chain.priority,
        resolve: (context: Context) => chain.resolveTenant(context),
      };
    },
  };

  return chain;
}
