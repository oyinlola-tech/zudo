/**
 * Transport-neutral input for generating a document from a route table.
 */

import type {
  OpenAPIInfo,
  OpenAPISecurityScheme,
} from "../openApiTypes/openApiTypes.core.js";
import type { RouteOpenAPIMetadata } from "../openApiRouting/routeMetadata.type.js";
import type { OpenAPIManagerOptions } from "../openApiHttp/openApiHttpAdapter.core.js";

/**
 * One operation, described structurally so that any route source can feed
 * {@link createOpenAPIDocumentFromRoutes}: an `@zudojs/http` router, an
 * `@zudojs/api` operation registry, or a hand-written list.
 *
 * It is {@link RouteOpenAPIMetadata} plus the operation's method and path,
 * flattened into one object:
 *
 * - `method` — any case (`"GET"`, `"post"`); it must be one an OpenAPI path
 *   item can carry (`get put post delete options head patch trace`).
 * - `path` — `/users/:id` or `/users/{id}`. Optional segments, typed or
 *   regex-constrained `:name(...)` segments and wildcards have no OpenAPI
 *   spelling; the source resolves them (see `inferredParameters`) before
 *   handing the path over.
 * - `summary`, `description`, `operationId`, `tags`, `deprecated`,
 *   `security` (`[]` marks a public operation), `servers`, `externalDocs`.
 * - `params`, `query`, `headers`, `cookies` — one object schema each; every
 *   property becomes a parameter. A `@zudojs/schema` schema is converted, any
 *   other object is used as an OpenAPI schema.
 * - `body` — a schema, or `{ schema, contentType?, required?, description? }`.
 * - `responses` — keyed by status, `NXX` range or `default`; each entry is a
 *   Response Object or `{ schema, description?, contentType?, headers? }`.
 * - `parameters` — explicit parameters, highest precedence.
 * - `inferredParameters` — parameters the source derived itself, lowest
 *   precedence.
 * - `hidden: true` — leave the operation out of the document.
 *
 * Every path template slot is documented even when nothing declares it.
 */
export interface OpenAPIRouteDescriptor extends RouteOpenAPIMetadata {
  /** HTTP method, any case. */
  readonly method: string;
  /** Route path, `/users/:id` or `/users/{id}`. */
  readonly path: string;
}

/** Options for {@link createOpenAPIDocumentFromRoutes}. */
export interface OpenAPIDocumentFromRoutesOptions
  extends Omit<OpenAPIManagerOptions, "info" | "cacheTtlMs" | "now"> {
  /** Document metadata (title and version are required by the spec). */
  readonly info: OpenAPIInfo;
  /** Validate the result and throw `OpenAPIValidationError` if invalid. */
  readonly validate?: boolean;
  /** Registered under `components.securitySchemes`. */
  readonly securitySchemes?: Readonly<Record<string, OpenAPISecurityScheme>>;
  /**
   * Component schemas, registered under `components.schemas`. A
   * `@zudojs/schema` schema is converted; any other object is used as-is.
   */
  readonly schemas?: Readonly<Record<string, unknown>>;
}
