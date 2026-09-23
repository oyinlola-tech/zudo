/**
 * OpenAPI bridge: converts an operation set into `@zudojs/openapi` route
 * descriptors, so `createOpenAPIDocumentFromRoutes` documents exactly
 * what `createApiFetchHandler` serves, envelopes included.
 */

export type { ToOpenAPIRouteDescriptorsOptions } from "./apiOpenAPI.descriptor.js";

export {
  toOpenAPIRouteDescriptor,
  toOpenAPIRouteDescriptors,
} from "./apiOpenAPI.descriptor.js";

export {
  apiSuccessBodySchema,
  apiWireErrorBodySchema,
  splitInputSchema,
} from "./apiOpenAPI.schemas.js";
