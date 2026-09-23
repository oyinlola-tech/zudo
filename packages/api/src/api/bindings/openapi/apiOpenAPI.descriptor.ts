import type { OpenAPIRouteDescriptor, OpenAPISchemaInput } from "@zudojs/openapi";

import type { APIOperationSource } from "../shared/apiBinding.type.js";

import type { APIOperationRoute } from "../route/apiRoute.type.js";

import type { DescribeApiRoutesOptions } from "../route/apiRoute.table.js";

import { describeApiRoutes } from "../route/apiRoute.table.js";

import {
  apiSuccessBodySchema,
  apiWireErrorBodySchema,
  splitInputSchema,
} from "./apiOpenAPI.schemas.js";

/**
 * Error responses every operation can produce over the fetch binding,
 * each documented with the `{ ok: false, error }` body.
 */
const ERROR_RESPONSES: ReadonlyArray<readonly [string, string]> = [
  ["422", "Input failed validation."],
  ["404", "No operation is bound to this method and path."],
  ["409", "The operation reported a conflict."],
  ["500", "Internal error. The message is generic; detail is logged server-side."],
  ["504", "The operation timed out."],
];

/**
 * Options for {@link toOpenAPIRouteDescriptors}.
 */
export type ToOpenAPIRouteDescriptorsOptions = DescribeApiRoutesOptions;

/**
 * Converts an operation set into `@zudojs/openapi` route descriptors, so
 * the operations served by `createApiFetchHandler` can be documented in
 * one call:
 *
 * ```ts
 * const document = createOpenAPIDocumentFromRoutes(
 *   toOpenAPIRouteDescriptors(registry, { basePath: "/api" }),
 *   { info: { title: "Users", version: "1.0.0" } },
 * );
 * ```
 *
 * Each descriptor carries the route's method, path, `operationId`,
 * description, tags and deprecation. The input schema becomes `query`
 * (`GET` / `DELETE`) or `body`, with path-bound fields moved to `params`.
 * `responses` documents 200 with the `{ ok: true, data }` envelope around
 * the output schema, and 422, 404, 409, 500 and 504 with the
 * `{ ok: false, error }` body. Only `@zudojs/schema` schemas can be
 * converted; input or output declared with another library is left
 * undocumented (`data` is then `unknown`).
 *
 * @throws {TypeError | RangeError} as `describeApiRoutes`.
 */
export function toOpenAPIRouteDescriptors(
  operations: APIOperationSource,
  options: ToOpenAPIRouteDescriptorsOptions = {},
): readonly OpenAPIRouteDescriptor[] {
  return Object.freeze(describeApiRoutes(operations, options).map(toOpenAPIRouteDescriptor));
}

/**
 * Converts one {@link APIOperationRoute} into an OpenAPI route descriptor.
 */
export function toOpenAPIRouteDescriptor(route: APIOperationRoute): OpenAPIRouteDescriptor {
  const { params, rest } = splitInputSchema(route.input, route.pathParams);
  const responses: Record<string, { schema: OpenAPISchemaInput; description: string }> = {
    "200": { schema: apiSuccessBodySchema(route.output) as OpenAPISchemaInput, description: "Success." },
  };
  for (const [status, description] of ERROR_RESPONSES) {
    responses[status] = { schema: apiWireErrorBodySchema as OpenAPISchemaInput, description };
  }

  return Object.freeze({
    method: route.method,
    path: route.path,
    operationId: route.operationId,
    ...(route.description !== undefined ? { description: route.description } : {}),
    ...(route.tags !== undefined ? { tags: route.tags } : {}),
    ...(route.deprecated !== undefined ? { deprecated: route.deprecated } : {}),
    ...(params !== undefined ? { params: params as OpenAPISchemaInput } : {}),
    ...(rest !== undefined
      ? route.inputSource === "query"
        ? { query: rest as OpenAPISchemaInput }
        : { body: rest as OpenAPISchemaInput }
      : {}),
    responses: Object.freeze(responses),
  });
}
