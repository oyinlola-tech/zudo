/**
 * @zudojs/http/httpOpenApi/routeTable
 *
 * Reads a router's compiled route table as OpenAPI route descriptors:
 * pattern → path template translation, route selection, and merging of
 * group-level documentation into route-level documentation.
 */

export { collectOpenAPIRoutes } from "./routeTable.collect.js";

export {
  routePathVariants,
  wildcardParameterName,
  type HttpOpenAPIPathVariant,
  type HttpOpenAPIWildcardMode,
} from "./routeTable.template.js";

export { mergeRouteOpenAPI } from "./routeTable.merge.js";
