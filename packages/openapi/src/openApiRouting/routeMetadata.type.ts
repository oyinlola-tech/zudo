/**
 * Route metadata consumed by the OpenAPI generator.
 *
 * This is the single definition of these shapes. They were previously
 * declared in both this file and the scanner, and had already drifted —
 * `requestBody` was typed one way in one copy and `unknown` in the other,
 * so which one a consumer got depended on the import path they happened to
 * use.
 */

import type {
  OpenAPIExternalDocumentation,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISecurityRequirement,
  OpenAPIServer,
} from "../openApiTypes/openApiTypes.core.js";
import type {
  OpenAPIRouteBody,
  OpenAPIRouteResponse,
  OpenAPISchemaInput,
} from "../openApiSchema/schemaInput.type.js";

export type {
  OpenAPIRouteBody,
  OpenAPIRouteResponse,
  OpenAPISchemaInput,
  RouteConversionOptions,
} from "../openApiSchema/schemaInput.type.js";

/** HTTP methods an OpenAPI path item can carry. */
export type OpenAPIHttpMethod =
  "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

/**
 * Parameter metadata for OpenAPI generation.
 */
export interface RouteParameterMetadata {
  readonly name: string;

  readonly in: "query" | "header" | "path" | "cookie";

  readonly description?: string;

  readonly required?: boolean;

  readonly deprecated?: boolean;

  /** An {@link OpenAPISchemaInput}; a `@zudojs/schema` schema is converted. */
  readonly schema?: unknown;

  readonly example?: unknown;
}

/**
 * Metadata attached to a route for OpenAPI generation.
 */
export interface RouteOpenAPIMetadata {
  readonly operationId?: string;

  readonly summary?: string;

  readonly description?: string;

  readonly tags?: readonly string[];

  readonly deprecated?: boolean;

  /**
   * Explicit parameters. They take precedence over parameters derived from
   * `params` / `query` / `headers` / `cookies` with the same name and
   * location, which in turn take precedence over `inferredParameters`.
   */
  readonly parameters?: readonly RouteParameterMetadata[];

  /**
   * Path parameters as one object schema; each property becomes an
   * `in: "path"` parameter. Template slots it does not cover are still
   * documented, as required strings.
   */
  readonly params?: OpenAPISchemaInput;

  /** Query parameters as one object schema; one parameter per property. */
  readonly query?: OpenAPISchemaInput;

  /** Request headers as one object schema; one parameter per property. */
  readonly headers?: OpenAPISchemaInput;

  /** Cookies as one object schema; one parameter per property. */
  readonly cookies?: OpenAPISchemaInput;

  /**
   * Parameters the route source inferred on its own (for example a regular
   * expression constraint on a path segment). Lowest precedence: any
   * declared parameter with the same name and location replaces one.
   */
  readonly inferredParameters?: readonly RouteParameterMetadata[];

  /**
   * The request body as a schema (`application/json`) or an
   * {@link OpenAPIRouteBody}. Ignored when `requestBody` is set.
   */
  readonly body?: OpenAPISchemaInput | OpenAPIRouteBody;

  /** A raw Request Body Object; takes precedence over `body`. */
  readonly requestBody?: OpenAPIRequestBody;

  /**
   * Responses keyed by status code, `default`, or a `2XX`-style range.
   * Every entry reaches the document — this is not a 200-only field. An
   * entry is a Response Object, or an {@link OpenAPIRouteResponse} when it
   * carries a `schema`.
   */
  readonly responses?: Readonly<
    Record<string, OpenAPIResponse | OpenAPIRouteResponse>
  >;

  readonly security?: readonly OpenAPISecurityRequirement[];

  readonly servers?: readonly OpenAPIServer[];

  readonly externalDocs?: OpenAPIExternalDocumentation;

  /** Excludes the route from the generated document. */
  readonly hidden?: boolean;
}

/**
 * Route metadata container.
 */
export interface RouteMetadata {
  readonly openapi?: RouteOpenAPIMetadata;
}

/**
 * Route information accepted by the scanner.
 */
export interface RouteInfo {
  readonly method: OpenAPIHttpMethod;

  readonly path: string;

  readonly metadata?: RouteMetadata;
}
