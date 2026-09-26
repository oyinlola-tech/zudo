/**
 * Resolution of schemas declared on routes and operations.
 *
 * A declared schema is either a `@zudojs/schema` schema, converted here for
 * the target version, or an OpenAPI Schema / Reference Object used as-is.
 */

import type { OpenAPISchema } from "../openApiTypes/openApiTypes.core.js";
import { convertSchema } from "./schemaConverter.core.js";

/** Options for {@link resolveSchemaInput}. */
export interface SchemaInputOptions {
  /** Specification version to convert for. Default: 3.1.0. */
  readonly version?: string;
  /** Receives everything a conversion could not express exactly. */
  readonly onWarning?: (message: string) => void;
  /**
   * Whether the parser's implicit string and array ceilings are emitted as
   * `maxLength` / `maxItems`. Default: true. See
   * `SchemaConversionOptions.implicitLimits`.
   */
  readonly implicitLimits?: boolean;
}

/** True when `value` is a `@zudojs/schema` schema (it carries a string `_type`). */
export function isSchemaDefinition(
  value: unknown,
): value is { readonly _type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { _type?: unknown })._type === "string"
  );
}

/**
 * Resolves a declared schema to an OpenAPI schema.
 *
 * A `@zudojs/schema` schema is converted and each conversion warning is
 * reported prefixed with `context`; any other object is taken to be an
 * OpenAPI Schema or Reference Object already. A non-object is reported and
 * becomes `{}`.
 */
export function resolveSchemaInput(
  input: unknown,
  context: string,
  options: SchemaInputOptions = {},
): OpenAPISchema {
  if (isSchemaDefinition(input)) {
    const result = convertSchema(input, {
      version: options.version,
      implicitLimits: options.implicitLimits,
    });
    for (const warning of result.warnings) {
      options.onWarning?.(`${context}: ${warning}`);
    }
    return result.schema;
  }
  if (typeof input === "object" && input !== null) {
    return input as OpenAPISchema;
  }
  options.onWarning?.(
    `${context}: expected a schema, got ${typeof input}; emitted {}.`,
  );
  return {};
}
