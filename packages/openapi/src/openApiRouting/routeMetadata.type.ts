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

  readonly parameters?: readonly RouteParameterMetadata[];

  readonly requestBody?: OpenAPIRequestBody;

  /**
   * Responses keyed by status code, `default`, or a `2XX`-style range.
   * Every entry reaches the document — this is not a 200-only field.
   */
  readonly responses?: Readonly<Record<string, OpenAPIResponse>>;

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
