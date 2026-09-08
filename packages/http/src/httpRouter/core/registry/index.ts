/**
 * @zudojs/http/httpRouter/core/registry
 *
 * HTTP route registry.
 *
 * Note: the registry's own method/path helpers (`normalizeMethod`,
 * `normalizeMethods`, `isHttpMethod`, `normalizePath`) are deliberately not
 * re-exported here. The router core owns those names — see
 * `../factory/httpRoute.factory.base.ts` and `../util/httpRoute.util.ts`.
 */

export type {
  RouteRegistryEntry,
  RouteRegistryOptions,
  RouteRegistrationOptions,
  RouteLookupOptions,
  RouteRegistrySnapshot,
} from "./core/httpRegistry.type.js";

export { matchesLookup, extractSequence } from "./core/httpRegistry.helper.js";

export { RouteRegistry } from "./httpRegistry.core.js";

export { RouteRegistryGroup } from "./httpRegistry.group.js";

export {
  createRouteRegistry,
  createRouteRegistryGroup,
  isRouteRegistry,
  isRouteRegistryGroup,
} from "./httpRegistry.factory.js";
