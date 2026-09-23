import type { OpenAPIRoute } from "../openApiRegistry/openApiRegistry.type.js";
import type {
  RouteConversionOptions,
  RouteInfo,
} from "./routeMetadata.type.js";
import { convertRouteToOpenAPI, toOpenAPIPath } from "./routeConverter.core.js";
import { OpenAPIRouteError } from "../openApiErrors/openApiError.types.js";

/**
 * Identity of a route inside the generated document.
 *
 * Keyed on the OpenAPI path template rather than the source path, because
 * that is what the document is keyed on: `/users/:id` and `/users/{id}` are
 * one path item. Keying on the raw spelling let both register, and the
 * second then replaced the first during generation — one operation vanished
 * from the published spec with `validate()` reporting nothing.
 *
 * A path `toOpenAPIPath` cannot express keeps its raw spelling here so the
 * conversion error still surfaces from `scan()`, where it always has.
 */
function routeKey(method: string, path: string): string {
  let template: string;
  try {
    template = toOpenAPIPath(path);
  } catch {
    template = path;
  }
  return `${method.toLowerCase()}:${template}`;
}

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
    const key = routeKey(route.method, route.path);
    const existing = this.routes.get(key);
    if (existing !== undefined) {
      throw new OpenAPIRouteError(
        `Route ${route.method.toUpperCase()} ${route.path} is already registered` +
          (existing.path === route.path
            ? "."
            : ` as ${existing.method.toUpperCase()} ${existing.path}; both describe the same OpenAPI path.`),
        {
          metadata: {
            method: route.method,
            path: route.path,
            existingPath: existing.path,
          },
        },
      );
    }
    this.routes.set(key, route);
  }

  /** Registers a route, replacing any existing one for the same method+path. */
  public setRoute(route: RouteInfo): void {
    this.routes.set(routeKey(route.method, route.path), route);
  }

  /** True when a route is registered for this method and path. */
  public hasRoute(method: string, path: string): boolean {
    return this.routes.has(routeKey(method, path));
  }

  /** Removes a route. Returns whether one was removed. */
  public removeRoute(method: string, path: string): boolean {
    return this.routes.delete(routeKey(method, path));
  }

  /** Number of registered routes. */
  public get size(): number {
    return this.routes.size;
  }

  /**
   * Converts every registered route into an OpenAPI operation. `options`
   * sets the version declared schemas are converted for and receives their
   * conversion warnings.
   */
  public scan(options?: RouteConversionOptions): readonly OpenAPIRoute[] {
    const result: OpenAPIRoute[] = [];

    for (const route of this.routes.values()) {
      if (route.metadata?.openapi?.hidden === true) continue;
      const converted = convertRouteToOpenAPI(
        route.method,
        route.path,
        route.metadata,
        options,
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
