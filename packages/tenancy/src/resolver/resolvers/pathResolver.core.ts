/**
 * Path-based tenant resolver.
 *
 * @module resolvers/pathResolver
 */

import type {
  TenantResolver,
  TenantResolution,
} from "../../tenancyTypes/resolverTypes.js";
import { tryCreateTenantId } from "../../tenancyTypes/tenantIdentity.js";

/** Context with getPath method. */
export interface PathContext {
  getPath(): string | undefined;
}

/** Options for the path resolver. */
export interface PathResolverOptions {
  /** Prefix to strip (e.g. "/tenant"). */
  readonly prefix?: string;
  readonly priority?: number;
}

/**
 * Create a tenant resolver that extracts tenant from URL path.
 *
 * Example: "/acme/users" → tenant "acme"
 */
export function createPathResolver(
  options?: PathResolverOptions,
): TenantResolver<PathContext> {
  const prefix = options?.prefix ?? "";
  const priority = options?.priority ?? 60;

  return {
    name: "path",
    priority,

    async resolve(context: PathContext): Promise<TenantResolution | undefined> {
      const path = context.getPath();
      if (!path) return undefined;

      let segments = path.split("/").filter(Boolean);

      if (prefix) {
        const prefixSegments = prefix.split("/").filter(Boolean);
        if (
          segments.slice(0, prefixSegments.length).join("/") ===
          prefixSegments.join("/")
        ) {
          segments = segments.slice(prefixSegments.length);
        }
      }

      if (segments.length === 0) return undefined;

      const tenantId = tryCreateTenantId(segments[0]);
      if (!tenantId) return undefined;

      return { tenantId, source: "path", trust: "untrusted" };
    },
  };
}
