/**
 * JWT-based tenant resolver.
 *
 * @module resolvers/jwtResolver
 */

import type {
  TenantResolver,
  TenantResolution,
} from "../../tenancyTypes/resolverTypes.js";
import { tryCreateTenantId } from "../../tenancyTypes/tenantIdentity.js";

/** JWT claims with tenant_id. */
interface JwtClaims {
  readonly tenant_id?: string;
  readonly [key: string]: unknown;
}

/** Context with a getClaims method. */
export interface JwtContext {
  getClaims(): JwtClaims | undefined;
}

/** Options for the JWT resolver. */
export interface JwtResolverOptions {
  /** Claim key for tenant ID. Defaults to "tenant_id". */
  readonly claimKey?: string;
  readonly priority?: number;
}

/**
 * Create a tenant resolver that reads from JWT claims.
 */
export function createJwtResolver(
  options?: JwtResolverOptions,
): TenantResolver<JwtContext> {
  const claimKey = options?.claimKey ?? "tenant_id";
  const priority = options?.priority ?? 100;

  return {
    name: "jwt",
    priority,

    async resolve(context: JwtContext): Promise<TenantResolution | undefined> {
      const claims = context.getClaims();
      if (!claims) return undefined;

      const tenantId = tryCreateTenantId(claims[claimKey]);
      if (!tenantId) return undefined;

      return { tenantId, source: "jwt", trust: "trusted" };
    },
  };
}
