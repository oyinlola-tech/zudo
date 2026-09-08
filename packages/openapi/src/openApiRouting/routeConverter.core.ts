import type {
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIResponses,
} from "../openApiTypes/openApiTypes.core.js";
import type {
  OpenAPIHttpMethod,
  RouteMetadata,
  RouteParameterMetadata,
} from "./routeMetadata.type.js";
import { OpenAPIRouteError } from "../openApiErrors/openApiError.types.js";
import { PATH_TEMPLATE_PARAMETER } from "../openApiConstants/openApiConstants.core.js";

/**
 * Maps Zudojs HTTP methods to OpenAPI methods.
 */
export const ZUDOLIB_TO_OPENAPI_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

/** True when `method` is one an OpenAPI path item can carry. */
export function isOpenAPIMethod(method: string): method is OpenAPIHttpMethod {
  return (ZUDOLIB_TO_OPENAPI_METHODS as readonly string[]).includes(
    method.toLowerCase(),
  );
}

/** A `:name` path segment, optionally suffixed with `?`. */
const COLON_PARAMETER = /^:([A-Za-z0-9_]+)(\?)?$/;

/**
 * Converts a Zudojs-style route path to an OpenAPI path template.
 *
 * Example:
 *   `/users/:id` → `/users/{id}`
 *   `/users/{id}` → unchanged (already a template)
 *   `/users/:id?` → throws (OpenAPI has no optional path parameters)
 *   `/files/*` → throws (OpenAPI has no wildcard paths)
 *
 * Anything it cannot convert throws rather than passing through: an
 * unconvertible segment that reaches the document produces an invalid path
 * template, and the failure then surfaces in whatever consumes the spec
 * rather than at the route that caused it.
 */
export function toOpenAPIPath(path: string): string {
  if (!path.startsWith("/")) {
    throw new OpenAPIRouteError(
      `Route path "${path}" must start with "/" to be a valid OpenAPI path.`,
      { metadata: { path } },
    );
  }

  const segments = path.split("/").map((segment) => {
    if (segment === "") return segment;

    if (segment === "*" || segment.startsWith("*")) {
      throw new OpenAPIRouteError(
        `Wildcard path segment "${segment}" in "${path}" is not supported in OpenAPI. ` +
          `Declare the concrete paths, or document it as a single templated parameter.`,
        { metadata: { path, segment } },
      );
    }

    const colon = COLON_PARAMETER.exec(segment);
    if (colon) {
      if (colon[2] === "?") {
        throw new OpenAPIRouteError(
          `Optional path parameter "${segment}" in "${path}" is not supported in OpenAPI. ` +
            `Use separate routes or a query parameter instead.`,
          { metadata: { path, segment } },
        );
      }
      return `{${colon[1]!}}`;
    }

    if (segment.startsWith(":")) {
      throw new OpenAPIRouteError(
        `Path parameter "${segment}" in "${path}" uses a syntax OpenAPI cannot express ` +
          `(typed or pattern-constrained parameters). Use a plain ":name" segment and ` +
          `describe the constraint with a parameter schema.`,
        { metadata: { path, segment } },
      );
    }

    return segment;
  });

  return segments.join("/");
}

/** Extracts the parameter names from an OpenAPI path template. */
export function extractPathParameters(path: string): readonly string[] {
  const names: string[] = [];
  for (const match of path.matchAll(PATH_TEMPLATE_PARAMETER)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

function toParameter(parameter: RouteParameterMetadata): OpenAPIParameter {
  return {
    name: parameter.name,
    in: parameter.in,
    ...(parameter.description ? { description: parameter.description } : {}),
    // A path parameter is required by the specification, so declaring one
    // that is not required is a document that cannot validate.
    required: parameter.in === "path" ? true : (parameter.required ?? false),
    ...(parameter.deprecated ? { deprecated: true } : {}),
    ...(parameter.schema !== undefined ? { schema: parameter.schema } : {}),
    ...(parameter.example !== undefined ? { example: parameter.example } : {}),
  };
}

/**
 * Builds the `responses` object for an operation.
 *
 * Every documented response is carried through. Only when a route documents
 * none at all is a `200` synthesized, because `responses` is required.
 */
export function buildResponses(metadata?: RouteMetadata): OpenAPIResponses {
  const declared = metadata?.openapi?.responses;
  if (declared && Object.keys(declared).length > 0) {
    return Object.freeze({ ...declared });
  }
  return Object.freeze({ "200": { description: "OK" } });
}

/**
 * Converts a route with metadata into an OpenAPI operation.
 */
export function convertRouteToOpenAPI(
  method: string,
  path: string,
  metadata?: RouteMetadata,
): {
  method: OpenAPIHttpMethod;
  path: string;
  operation: OpenAPIOperation;
} {
  if (!isOpenAPIMethod(method)) {
    throw new OpenAPIRouteError(
      `HTTP method "${method}" has no OpenAPI path item field. ` +
        `Supported: ${ZUDOLIB_TO_OPENAPI_METHODS.join(", ")}.`,
      { metadata: { method, path } },
    );
  }

  const openApiPath = toOpenAPIPath(path);
  const meta = metadata?.openapi;

  const operation: OpenAPIOperation = {
    ...(meta?.operationId ? { operationId: meta.operationId } : {}),
    ...(meta?.summary ? { summary: meta.summary } : {}),
    ...(meta?.description ? { description: meta.description } : {}),
    ...(meta?.tags?.length ? { tags: [...meta.tags] } : {}),
    ...(meta?.deprecated !== undefined ? { deprecated: meta.deprecated } : {}),
    ...(meta?.parameters?.length
      ? { parameters: meta.parameters.map(toParameter) }
      : {}),
    ...(meta?.requestBody ? { requestBody: meta.requestBody } : {}),
    ...(meta?.security?.length ? { security: [...meta.security] } : {}),
    ...(meta?.servers?.length ? { servers: [...meta.servers] } : {}),
    ...(meta?.externalDocs ? { externalDocs: meta.externalDocs } : {}),
    responses: buildResponses(metadata),
  };

  return {
    method: method.toLowerCase() as OpenAPIHttpMethod,
    path: openApiPath,
    operation,
  };
}
