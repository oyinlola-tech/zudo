/**
 * @zudojs/openapi/openApiSchema
 *
 * Schema conversion and registry for OpenAPI generation.
 */

export type {
  SchemaConverter,
  SchemaConversionResult,
  SchemaConversionOptions,
} from "./schemaConverter.core.js";
export {
  convertSchema,
  createSchemaConverter,
  isVersion31,
} from "./schemaConverter.core.js";

export type {
  SchemaRegistry,
  SchemaRegistryOptions,
} from "./schemaRegistry.core.js";
export { SchemaRegistryImpl } from "./schemaRegistry.core.js";

export {
  createComponentReference,
  escapeJsonPointerSegment,
  unescapeJsonPointerSegment,
  type ComponentSection,
} from "./references.core.js";
