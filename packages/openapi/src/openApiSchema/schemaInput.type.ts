/**
 * Schema-bearing inputs a route or operation may declare.
 */

import type {
  OpenAPIHeader,
  OpenAPIReference,
  OpenAPISchema,
} from "../openApiTypes/openApiTypes.core.js";
import type { SchemaInputOptions } from "./schemaInput.core.js";

/**
 * A schema a route may declare: a `@zudojs/schema` schema (anything carrying
 * a string `_type`, converted with `convertSchema` for the document's
 * version), or an OpenAPI Schema / Reference Object used as-is.
 */
export type OpenAPISchemaInput =
  OpenAPISchema | OpenAPIReference | { readonly _type: string };

/**
 * A request body declared by schema rather than as a raw Request Body Object.
 */
export interface OpenAPIRouteBody {
  /** The body's schema. */
  readonly schema: OpenAPISchemaInput;
  /** Media type(s) the body is accepted as. Default: `application/json`. */
  readonly contentType?: string | readonly string[];
  /** Whether the body is required. Default: `true`. */
  readonly required?: boolean;
  readonly description?: string;
  readonly example?: unknown;
}

/**
 * A response declared by schema rather than as a raw Response Object.
 *
 * An entry in `responses` is read as this shape when it has a `schema` key;
 * otherwise it is an OpenAPI Response Object and passes through unchanged.
 */
export interface OpenAPIRouteResponse {
  /** The response body's schema. */
  readonly schema: OpenAPISchemaInput;
  /** Default: the status code's reason phrase, e.g. "Not Found". */
  readonly description?: string;
  /** Media type(s) the body is sent as. Default: `application/json`. */
  readonly contentType?: string | readonly string[];
  readonly headers?: Readonly<Record<string, OpenAPIHeader>>;
  readonly example?: unknown;
}

/**
 * Options for converting a route into an operation: the version declared
 * schemas are converted for, and a sink for what they could not express.
 */
export type RouteConversionOptions = SchemaInputOptions;
