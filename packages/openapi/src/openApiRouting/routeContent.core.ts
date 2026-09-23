/**
 * Request body and response construction for route conversion.
 *
 * Both accept schemas as well as raw OpenAPI objects, so a route that
 * declares `body: userSchema` documents exactly the payload it parses.
 */

import { HttpStatus } from "@zudojs/constants";

import type {
  OpenAPIMediaType,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPIResponses,
} from "../openApiTypes/openApiTypes.core.js";
import type {
  OpenAPIRouteBody,
  OpenAPIRouteResponse,
  RouteConversionOptions,
  RouteOpenAPIMetadata,
} from "./routeMetadata.type.js";
import {
  isSchemaDefinition,
  resolveSchemaInput,
} from "../openApiSchema/schemaInput.core.js";
import { DEFAULT_MEDIA_TYPE, UNDOCUMENTED_RESPONSE_DESCRIPTION } from "../openApiConstants/openApiConstants.core.js";

const REASON_PHRASES: ReadonlyMap<string, string> = new Map(
  Object.entries(HttpStatus).map(([name, code]) => [
    String(code),
    name
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  ]),
);

const RANGE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "1XX": "Informational",
  "2XX": "Success",
  "3XX": "Redirection",
  "4XX": "Client error",
  "5XX": "Server error",
  default: "Unexpected response",
};

/** A default description for a response key: `404` → "Not Found". */
export function describeResponseKey(key: string): string {
  return REASON_PHRASES.get(key) ?? RANGE_DESCRIPTIONS[key] ?? `Response ${key}`;
}

function isDescriptorWithSchema(value: unknown): value is { readonly schema: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !isSchemaDefinition(value) &&
    Object.hasOwn(value, "schema")
  );
}

function mediaTypes(
  contentType: string | readonly string[] | undefined,
  media: OpenAPIMediaType,
): Readonly<Record<string, OpenAPIMediaType>> {
  const types =
    contentType === undefined
      ? [DEFAULT_MEDIA_TYPE]
      : typeof contentType === "string" ? [contentType] : contentType;
  return Object.fromEntries(types.map((type) => [type, media]));
}

/** Builds the Request Body Object from `requestBody` or `body`. */
export function buildOperationRequestBody(
  meta: RouteOpenAPIMetadata | undefined,
  context: string,
  options: RouteConversionOptions = {},
): OpenAPIRequestBody | undefined {
  if (meta?.requestBody) return meta.requestBody;
  if (meta?.body === undefined) return undefined;

  const body: OpenAPIRouteBody = isDescriptorWithSchema(meta.body)
    ? (meta.body as OpenAPIRouteBody)
    : { schema: meta.body };
  const schema = resolveSchemaInput(body.schema, `${context} body`, options);
  return {
    ...(body.description ? { description: body.description } : {}),
    required: body.required ?? true,
    content: mediaTypes(body.contentType, {
      schema,
      ...(body.example !== undefined ? { example: body.example } : {}),
    }),
  };
}

function toResponse(
  key: string,
  entry: OpenAPIResponse | OpenAPIRouteResponse,
  context: string,
  options: RouteConversionOptions,
): OpenAPIResponse {
  if (!isDescriptorWithSchema(entry)) return entry as OpenAPIResponse;
  const response = entry as OpenAPIRouteResponse;
  const schema = resolveSchemaInput(
    response.schema,
    `${context} response ${key}`,
    options,
  );
  return {
    description: response.description ?? describeResponseKey(key),
    ...(response.headers ? { headers: response.headers } : {}),
    content: mediaTypes(response.contentType, {
      schema,
      ...(response.example !== undefined ? { example: response.example } : {}),
    }),
  };
}

/**
 * Builds the `responses` object for an operation.
 *
 * Every documented response is carried through; an entry with a `schema` is
 * expanded into a Response Object. A route that documents none gets a
 * `default` "Undocumented response" (`responses` is required) and a warning
 * through `options.onWarning`. No status is invented.
 */
export function buildOperationResponses(
  meta: RouteOpenAPIMetadata | undefined,
  context: string,
  options: RouteConversionOptions = {},
): OpenAPIResponses {
  const declared = meta?.responses;
  if (!declared || Object.keys(declared).length === 0) {
    options.onWarning?.(
      `${context}: no responses are documented; emitted "default: ${UNDOCUMENTED_RESPONSE_DESCRIPTION}".`,
    );
    const fallback = { description: UNDOCUMENTED_RESPONSE_DESCRIPTION };
    return Object.freeze({ default: Object.freeze(fallback) });
  }
  const responses: Record<string, OpenAPIResponse> = {};
  for (const [key, entry] of Object.entries(declared)) {
    Object.defineProperty(responses, key, {
      value: toResponse(key, entry, context, options),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return Object.freeze(responses);
}
