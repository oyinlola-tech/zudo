/**
 * HTTP routes for operations: the structural {@link APIOperationRoute}
 * contract (method, path template, operation id, schemas) that an HTTP
 * layer mounts and OpenAPI generation documents, plus route resolution,
 * validation and request matching.
 */

export type {
  APIHttpMethod,
  APIRouteInputSource,
  APIOperationHttpOptions,
  APIOperationRoute,
} from "./apiRoute.type.js";

export {
  assertValidHttpOptions,
  parseRoutePath,
  resolveApiRoute,
  routeConflictKey,
} from "./apiRoute.resolver.js";

export type {
  DescribeApiRoutesOptions,
  APIRouteEntry,
  APIRouteMatch,
  APIRouteTable,
} from "./apiRoute.table.js";

export { compileRouteTable, describeApiRoutes } from "./apiRoute.table.js";
