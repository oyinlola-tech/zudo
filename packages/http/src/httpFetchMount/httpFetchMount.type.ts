/**
 * Types for serving web-standard fetch handlers from a router.
 */

import type {
  HttpMethod,
  HttpRouteOpenAPI,
  RouteOptions,
  RouterHandler,
} from "../httpRouter/core/types/httpRouter.type.js";
import type { HttpMiddleware } from "../httpMiddleware/httpMiddleware.type.js";

/** A web-standard handler: `Request` in, `Response` out. */
export type HttpFetchHandler = (request: Request) => Response | Promise<Response>;

/** Anything routes can be registered on: an `HttpRouter` or a router group. */
export interface HttpFetchMountTarget {
  on(
    method: HttpMethod | "*",
    path: string,
    handler: RouterHandler,
    options?: RouteOptions,
  ): () => void;
}

/** Options for `mountFetchHandler`. */
export interface MountFetchHandlerOptions {
  /** Methods routed to the handler. Default: every method. */
  readonly methods?: readonly HttpMethod[];
  /**
   * Remove the mount path from the URL the handler sees, so a handler
   * mounted at `/rpc` receives `/users.get` for `/rpc/users.get`. The
   * removed prefix is passed as `x-forwarded-prefix`. Default: `true`.
   */
  readonly stripPrefix?: boolean;
  /**
   * Origin of the handler's `request.url`, e.g. `https://api.example.com`.
   * When set it is used for every request. When not, the origin comes from
   * the request — its `Host` header, or `X-Forwarded-Host` from a trusted
   * proxy — which the client chooses; set this whenever the handler builds
   * absolute URLs (redirects, callback or reset links) or checks
   * `Origin` against its own. Falls back to `http://localhost`.
   */
  readonly origin?: string;
  /** Middleware run before the handler. */
  readonly middleware?: readonly HttpMiddleware[];
  /** Route name. */
  readonly name?: string;
  /**
   * OpenAPI documentation for the mount. Default: `false` — a mounted
   * handler documents its own operations (see `@zudojs/openapi`'s
   * `createOpenAPIDocumentFromRoutes`).
   */
  readonly openapi?: HttpRouteOpenAPI;
}

/** Options for `toWebRequest`. */
export interface ToWebRequestOptions {
  /** Overrides the request URL (absolute). */
  readonly url?: string | URL;
  /** Aborts the web request; normally the router context's signal. */
  readonly signal?: AbortSignal;
  /**
   * Origin of the web request. Overrides the context's protocol and host
   * (which come from the client's `Host` header) when set.
   */
  readonly origin?: string;
  /** Extra headers set on the web request, replacing same-named ones. */
  readonly headers?: Readonly<Record<string, string>>;
}
