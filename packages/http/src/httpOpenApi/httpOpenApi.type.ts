/**
 * Types for generating and serving OpenAPI documents from a router.
 */

import type {
  OpenAPIDocumentFromRoutesOptions,
  OpenAPIUIOptions,
} from "@zudojs/openapi";

import type {
  CompiledRoute,
  MatchedRoute,
} from "../httpRouter/core/types/httpRouter.type.js";
import type { HttpMiddleware } from "../httpMiddleware/httpMiddleware.type.js";
import type { HttpOpenAPIWildcardMode } from "./routeTable/routeTable.template.js";

/** Anything exposing the router's compiled route table (`HttpRouter`). */
export interface HttpOpenAPIRouteSource {
  compiled(): readonly CompiledRoute[];
}

/** A path matcher: exact path, `prefix/*` prefix, a RegExp, or a predicate. */
export type HttpOpenAPIRouteFilter =
  | readonly (string | RegExp)[]
  | ((route: MatchedRoute) => boolean);

/** Which registered routes reach the document. */
export interface HttpOpenAPIRouteSelection {
  /**
   * Routes to leave out, matched against the registered pattern
   * (`/health`, `/internal/*`, `/^\/admin/`) or by predicate. Routes whose
   * `openapi` is `false` or `{ hidden: true }` are always left out.
   */
  readonly exclude?: HttpOpenAPIRouteFilter;
  /**
   * `"include"` (default) documents every route, with whatever the route
   * itself declares; `"exclude"` documents only routes that declare
   * `openapi` metadata.
   */
  readonly undocumented?: "include" | "exclude";
  /** How `*rest` segments are documented. Default: `"parameter"`. */
  readonly wildcards?: HttpOpenAPIWildcardMode;
  /** Receives routes skipped because another route owns the same operation. */
  readonly onRouteWarning?: (message: string) => void;
}

/** Options for `generateOpenAPIDocument`. */
export interface HttpOpenAPIOptions
  extends OpenAPIDocumentFromRoutesOptions, HttpOpenAPIRouteSelection {}

/** Options for `mountOpenAPI`. */
export interface HttpOpenAPIMountOptions extends HttpOpenAPIOptions {
  /** Where the JSON document is served. Default: `/openapi.json`. */
  readonly path?: string;
  /** Where a YAML copy is served, or `false` (default) for none. */
  readonly yamlPath?: string | false;
  /**
   * Where the documentation page is served, or `false`. Default: `/docs`,
   * except when `NODE_ENV` is `production`, where the page is off unless
   * a path is passed explicitly. The JSON document is served either way.
   */
  readonly docsPath?: string | false;
  /**
   * Documentation page options (`renderer: "redoc"`, `logo`, …). `specUrl`
   * defaults to `path`; set it when the router is served under a prefix.
   */
  readonly ui?: Partial<OpenAPIUIOptions>;
  /** `cache-control` for the document responses. Default: `no-cache`. */
  readonly cacheControl?: string;
  /** Middleware run before the documentation routes (e.g. auth). */
  readonly middleware?: readonly HttpMiddleware[];
}
