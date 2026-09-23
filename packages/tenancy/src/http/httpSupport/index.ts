/**
 * Support for the tenancy HTTP middleware: portable header reads, loading
 * the tenant a resolution names (by id, then by slug), and adapting a
 * resolver chain passed where a resolver is expected.
 *
 * @module http/httpSupport
 */

export { readRequestHeader } from "./httpRequest.helper.js";
export { loadResolvedTenant } from "./tenancyMiddleware.lookup.js";
export {
  toTenantResolver,
  type TenantResolverSource,
} from "./tenancyMiddleware.resolver.js";
