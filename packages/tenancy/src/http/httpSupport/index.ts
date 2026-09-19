/**
 * Support for the tenancy HTTP middleware: portable header reads, and loading
 * the tenant a resolution names (by id, then by slug).
 *
 * @module http/httpSupport
 */

export { readRequestHeader } from "./httpRequest.helper.js";
export { loadResolvedTenant } from "./tenancyMiddleware.lookup.js";
