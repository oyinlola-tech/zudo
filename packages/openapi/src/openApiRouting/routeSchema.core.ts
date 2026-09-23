/**
 * Schema-aware parameter derivation for route conversion: path parameters,
 * query, headers and cookies declared as one object schema each become one
 * parameter per property.
 */

import type {
  OpenAPIParameter,
  OpenAPIParameterLocation,
  OpenAPISchema,
} from "../openApiTypes/openApiTypes.core.js";
import type {
  RouteConversionOptions,
  RouteOpenAPIMetadata,
  RouteParameterMetadata,
} from "./routeMetadata.type.js";
import { resolveSchemaInput } from "../openApiSchema/schemaInput.core.js";

function isObjectSchema(schema: OpenAPISchema): boolean {
  const type = schema.type;
  if (type === "object") return true;
  if (Array.isArray(type)) return type.includes("object");
  return type === undefined && schema.properties !== undefined;
}

/** One parameter per property of an object schema. */
function parametersFromSchema(
  input: unknown,
  location: OpenAPIParameterLocation,
  context: string,
  options: RouteConversionOptions,
): readonly OpenAPIParameter[] {
  const schema = resolveSchemaInput(input, context, options);
  if (!isObjectSchema(schema) || schema.properties === undefined) {
    options.onWarning?.(
      `${context}: ${location} parameters must be declared as an object schema; ignored.`,
    );
    return [];
  }
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    ...(property.description ? { description: property.description } : {}),
    ...(property.deprecated ? { deprecated: true } : {}),
    schema: property,
  }));
}

function toParameter(
  parameter: RouteParameterMetadata,
  context: string,
  options: RouteConversionOptions,
): OpenAPIParameter {
  return {
    name: parameter.name,
    in: parameter.in,
    ...(parameter.description ? { description: parameter.description } : {}),
    // A path parameter is required by the specification, so declaring one
    // that is not required is a document that cannot validate.
    required: parameter.in === "path" ? true : (parameter.required ?? false),
    ...(parameter.deprecated ? { deprecated: true } : {}),
    ...(parameter.schema === undefined ? {} : {
      schema: resolveSchemaInput(parameter.schema, `${context} "${parameter.name}"`, options),
    }),
    ...(parameter.example !== undefined ? { example: parameter.example } : {}),
  };
}

const SCHEMA_LOCATIONS = [
  ["params", "path"],
  ["query", "query"],
  ["headers", "header"],
  ["cookies", "cookie"],
] as const;

/**
 * Builds an operation's parameter list.
 *
 * `slots` are the path template's parameter names. Layers, lowest precedence
 * first: a required string per slot, `inferredParameters`, the `params` /
 * `query` / `headers` / `cookies` schemas, then explicit `parameters`; a
 * later layer replaces a parameter with the same name and location. A path
 * parameter no slot names is dropped with a warning: emitting it would make
 * a document that cannot validate.
 */
export function buildOperationParameters(
  slots: readonly string[],
  meta: RouteOpenAPIMetadata | undefined,
  context: string,
  options: RouteConversionOptions = {},
): readonly OpenAPIParameter[] {
  const merged = new Map<string, OpenAPIParameter>();
  const put = (parameter: OpenAPIParameter): void =>
    void merged.set(`${parameter.in}:${parameter.name}`, parameter);

  for (const name of slots) {
    put({ name, in: "path", required: true, schema: { type: "string" } });
  }
  for (const parameter of meta?.inferredParameters ?? []) {
    put(toParameter(parameter, context, options));
  }
  for (const [key, location] of SCHEMA_LOCATIONS) {
    const input = meta?.[key];
    if (input === undefined) continue;
    for (const parameter of parametersFromSchema(input, location, context, options)) {
      put(parameter);
    }
  }
  for (const parameter of meta?.parameters ?? []) {
    put(toParameter(parameter, context, options));
  }

  const result: OpenAPIParameter[] = [];
  for (const parameter of merged.values()) {
    if (parameter.in === "path" && !slots.includes(parameter.name)) {
      options.onWarning?.(
        `${context}: path parameter "${parameter.name}" is not in the path template; ignored.`,
      );
      continue;
    }
    result.push(parameter);
  }
  return result;
}
