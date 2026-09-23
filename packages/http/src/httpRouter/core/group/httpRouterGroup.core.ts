/**
 * HTTP router group.
 *
 * Registers routes against a parent router under a shared path prefix and a
 * shared set of default route options.
 */

import type {
  HttpMethod,
  HttpRouteOpenAPI,
  RouteOptions,
  RouterHandler,
} from "../types/httpRouter.type.js";

import type { HttpRouter } from "../register/httpRouter.register.js";

import { mergeRouteOpenAPI } from "../../../httpOpenApi/routeTable/routeTable.merge.js";

export class HttpRouterGroup {
  constructor(
    private readonly router: HttpRouter,
    private readonly prefix: string,
    private readonly defaults: RouteOptions = {},
  ) {}

  on(
    method: HttpMethod | "*",
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.router.on(
      method,
      this.resolve(path),
      handler,
      this.mergeOptions(options),
    );
  }

  get(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("GET", path, handler, options);
  }

  head(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("HEAD", path, handler, options);
  }

  post(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("POST", path, handler, options);
  }

  put(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("PUT", path, handler, options);
  }

  patch(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("PATCH", path, handler, options);
  }

  delete(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("DELETE", path, handler, options);
  }

  options(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("OPTIONS", path, handler, options);
  }

  all(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("*", path, handler, options);
  }

  group(
    prefix: string,
    configure: (group: HttpRouterGroup) => void,
    options: RouteOptions = {},
  ): void {
    this.router.group(
      this.resolve(prefix),
      (group: HttpRouterGroup) => {
        configure(group);
      },
      this.mergeOptions(options),
    );
  }

  private resolve(path: string): string {
    const left = this.prefix === "/" ? "" : this.prefix.replace(/\/+$/, "");

    const right = path === "/" ? "" : path.replace(/^\/+/, "");

    return `${left}/${right}` || "/";
  }

  private mergeOptions(options: RouteOptions): RouteOptions {
    /*
     * `metadata.openapi` is the same setting as `openapi` (the router stores
     * one as the other). Reading only `openapi` let a group's documentation
     * defaults replace a route's `metadata: { openapi: false }`, publishing
     * a route its author had hidden.
     */
    const openapi = mergeRouteOpenAPI(
      openAPIOf(this.defaults),
      openAPIOf(options),
    );

    return {
      ...(openapi === undefined ? {} : { openapi }),

      name: options.name ?? this.defaults.name,

      middleware: [
        ...(this.defaults.middleware ?? []),
        ...(options.middleware ?? []),
      ],

      metadata: {
        ...(this.defaults.metadata ?? {}),
        ...(options.metadata ?? {}),
      },

      strictTrailingSlash:
        options.strictTrailingSlash ?? this.defaults.strictTrailingSlash,
    };
  }
}

function openAPIOf(options: RouteOptions): HttpRouteOpenAPI | undefined {
  return options.openapi ??
    (options.metadata?.["openapi"] as HttpRouteOpenAPI | undefined);
}
