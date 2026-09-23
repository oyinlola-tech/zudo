/**
 * @zudojs/openapi/openApiFromRoutes
 *
 * Generates a document from a route table described by transport-neutral
 * {@link OpenAPIRouteDescriptor}s, so any route source — an `@zudojs/http`
 * router, an `@zudojs/api` registry, a hand-written list — can be documented
 * from what it actually registers.
 */

export type {
  OpenAPIRouteDescriptor,
  OpenAPIDocumentFromRoutesOptions,
} from "./openApiFromRoutes.type.js";

export {
  createOpenAPIDocumentFromRoutes,
  createOpenAPIManagerFromRoutes,
  routeDescriptorToRouteInfo,
} from "./openApiFromRoutes.document.js";
