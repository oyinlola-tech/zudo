/**
 * Tenant resolution — chain and built-in resolvers.
 *
 * @module resolver
 */

export { createResolverChain } from "./resolverChain.core.js";
export type { TenantResolverChain } from "./resolverChain.core.js";
export * from "./resolvers/index.js";
