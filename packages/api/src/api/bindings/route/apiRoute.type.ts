/**
 * HTTP route description for an operation.
 *
 * `@zudojs/api` does not import `@zudojs/http`; these types are the
 * structural contract an HTTP layer (and OpenAPI generation) consumes.
 */

/** HTTP methods an operation can be bound to. */
export type APIHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Where a route reads operation input from: the query string (`GET`,
 * `DELETE`) or a JSON request body (`POST`, `PUT`, `PATCH`). Path
 * parameters are merged into the input either way.
 */
export type APIRouteInputSource = "query" | "body";

/**
 * HTTP binding declared on an operation as `metadata.http`.
 *
 * Both fields are optional: an operation without them is served at
 * `POST /<operation name>`.
 */
export interface APIOperationHttpOptions {
  /** HTTP method. Defaults to `"POST"`. */
  readonly method?: APIHttpMethod;
  /**
   * Path template, e.g. `"/users/:id"`. A segment starting with `:` is a
   * path parameter merged into the input under that name. Defaults to
   * `"/" + operation.name`.
   */
  readonly path?: string;
}

/**
 * Stable, structural description of one operation's HTTP route.
 *
 * Produced by {@link describeApiRoutes}; consumed by `@zudojs/http` to
 * mount routes and by `@zudojs/openapi` to generate documents. Contains
 * only plain data plus the operation's own schema objects, so it can be
 * read without importing this package's classes.
 */
export interface APIOperationRoute {
  /** The operation's name — unique, and usable as an OpenAPI `operationId`. */
  readonly operationId: string;
  /** HTTP method. */
  readonly method: APIHttpMethod;
  /** Full path template including any base path, e.g. `"/api/users/:id"`. */
  readonly path: string;
  /** Names of the `:param` segments in `path`, in order. */
  readonly pathParams: readonly string[];
  /** Where non-path input is read from. */
  readonly inputSource: APIRouteInputSource;
  /** Input schema declared on the operation, if any. */
  readonly input?: unknown;
  /** Output schema declared on the operation, if any. */
  readonly output?: unknown;
  /** `metadata.description`. */
  readonly description?: string;
  /** `metadata.tags`. */
  readonly tags?: readonly string[];
  /** `metadata.deprecated`. */
  readonly deprecated?: boolean;
  /** `metadata.version`. */
  readonly version?: string;
  /** Status sent for a successful call. Always `200`. */
  readonly successStatus: 200;
}
