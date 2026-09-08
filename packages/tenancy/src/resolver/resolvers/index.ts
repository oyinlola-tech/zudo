/**
 * Built-in tenant resolvers.
 *
 * @module resolver/resolvers
 */

export { createHeaderResolver } from "./headerResolver.core.js";
export type {
  HeaderContext,
  HeaderResolverOptions,
} from "./headerResolver.core.js";
export { createSubdomainResolver } from "./subdomainResolver.core.js";
export type {
  SubdomainContext,
  SubdomainResolverOptions,
} from "./subdomainResolver.core.js";
export { createPathResolver } from "./pathResolver.core.js";
export type { PathContext, PathResolverOptions } from "./pathResolver.core.js";
export { createJwtResolver } from "./jwtResolver.core.js";
export type { JwtContext, JwtResolverOptions } from "./jwtResolver.core.js";
