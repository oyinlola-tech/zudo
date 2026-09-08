import type { OpenAPIRoute } from "../openApiRegistry/openApiRegistry.type.js";
import type { RouteInfo } from "./routeMetadata.type.js";
import { convertRouteToOpenAPI } from "./routeConverter.core.js";
import { OpenAPIRouteError } from "../openApiErrors/openApiError.types.js";

/**
 * Collects routes and converts them into OpenAPI operations.
 *
 * Duplicates are rejected on the way in. Accepting them and letting the
 * registry throw during generation reported the problem far from the
 * `addRoute` call that caused it, and only after some routes had already been
 * registered.
 */
export class OpenAPIRouteScannerImpl {
  private readonly routes = new Map<string, RouteInfo>();

  /** Registers a route. */
  public addRoute(route: RouteInfo): void {
    const key = `${route.method.toLowerCase()}:${route.path}`;
    if (this.routes.has(key)) {
      throw new OpenAPIRouteError(
        `Route ${route.method.toUpperCase()} ${route.path} is already registered.`,
        { metadata: { method: route.method, path: route.path } },
      );
    }
    this.routes.set(key, route);
  }

  /** Registers a route, replacing any existing one for the same method+path. */
  public setRoute(route: RouteInfo): void {
    this.routes.set(`${route.method.toLowerCase()}:${route.path}`, route);
  }

  /** True when a route is registered for this method and path. */
  public hasRoute(method: string, path: string): boolean {
    return this.routes.has(`${method.toLowerCase()}:${path}`);
  }

  /** Removes a route. Returns whether one was removed. */
  public removeRoute(method: string, path: string): boolean {
    return this.routes.delete(`${method.toLowerCase()}:${path}`);
  }

  /** Number of registered routes. */
  public get size(): number {
    return this.routes.size;
  }

  /** Converts every registered route into an OpenAPI operation. */
  public scan(): readonly OpenAPIRoute[] {
    const result: OpenAPIRoute[] = [];

    for (const route of this.routes.values()) {
      if (route.metadata?.openapi?.hidden === true) continue;
      const converted = convertRouteToOpenAPI(
        route.method,
        route.path,
        route.metadata,
      );
      result.push({
        method: converted.method,
        path: converted.path,
        operation: converted.operation,
      });
    }

    return result;
  }

  public clear(): void {
    this.routes.clear();
  }
}
