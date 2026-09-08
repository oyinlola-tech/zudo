/**
 * @zudojs/openapi/openApiComponents
 *
 * Reusable OpenAPI component helpers.
 */

export {
  createComponentReference,
  escapeJsonPointerSegment,
  unescapeJsonPointerSegment,
  type ComponentSection,
} from "../openApiSchema/references.core.js";
export type {
  SchemaRegistry,
  SchemaRegistryOptions,
} from "../openApiSchema/schemaRegistry.core.js";
export { SchemaRegistryImpl } from "../openApiSchema/schemaRegistry.core.js";
