import type { APIOperation } from "../../operation/operation.type.js";

import type {
  APIHttpMethod,
  APIOperationRoute,
  APIRouteInputSource,
} from "./apiRoute.type.js";

const METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const MAX_PATH_LENGTH = 512;

const LITERAL_SEGMENT = /^[A-Za-z0-9._~!$&'()*+,;=@-][A-Za-z0-9._~!$&'()*+,;=@:-]*$/;

const PARAM_SEGMENT = /^:([A-Za-z_][A-Za-z0-9_]*)$/;

const UNSAFE_PARAM_NAMES: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Splits and validates a path template, returning its segments.
 *
 * @throws {TypeError} if `path` is not a string.
 * @throws {RangeError} if `path` is empty, over-long, does not start with
 * `/`, has an empty or illegal segment, or repeats a parameter name.
 */
export function parseRoutePath(path: unknown, label: string): readonly string[] {
  if (typeof path !== "string") {
    throw new TypeError(`${label} must be a string, received ${typeof path}.`);
  }
  if (path.length === 0 || path.length > MAX_PATH_LENGTH || !path.startsWith("/")) {
    throw new RangeError(
      `${label} must start with "/" and be at most ${MAX_PATH_LENGTH} characters.`,
    );
  }

  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed === "/" ? [] : trimmed.slice(1).split("/");
  const params = new Set<string>();

  for (const segment of segments) {
    const param = PARAM_SEGMENT.exec(segment)?.[1];
    if (param !== undefined) {
      if (UNSAFE_PARAM_NAMES.has(param) || params.has(param)) {
        throw new RangeError(`${label} "${path}" repeats or misuses parameter ":${param}".`);
      }
      params.add(param);
    } else if (!LITERAL_SEGMENT.test(segment)) {
      throw new RangeError(`${label} "${path}" has an empty or invalid segment "${segment}".`);
    }
  }

  return segments;
}

/**
 * Validates `metadata.http` on an operation definition.
 *
 * @throws {TypeError | RangeError} for an unknown method or invalid path.
 */
export function assertValidHttpOptions(http: unknown, operationName: string): void {
  if (http === undefined) {
    return;
  }
  if (typeof http !== "object" || http === null) {
    throw new TypeError(`Operation "${operationName}" metadata.http must be an object.`);
  }
  const { method, path } = http as { method?: unknown; path?: unknown };
  if (method !== undefined && (typeof method !== "string" || !METHODS.has(method))) {
    throw new RangeError(
      `Operation "${operationName}" metadata.http.method must be one of ${[...METHODS].join(", ")}.`,
    );
  }
  if (path !== undefined) {
    parseRoutePath(path, `Operation "${operationName}" metadata.http.path`);
  }
}

/**
 * Resolves the HTTP route of one operation.
 *
 * Without `metadata.http` the route is `POST /<operation name>`; a name
 * whose default path would contain an empty or `:`-prefixed segment must
 * declare `metadata.http.path` explicitly.
 *
 * @param basePath Prefix such as `"/api"`; `"/"` or `undefined` for none.
 * @throws {TypeError | RangeError} if the route or base path is invalid.
 */
export function resolveApiRoute(operation: APIOperation, basePath?: string): APIOperationRoute {
  const http = operation.metadata?.http;
  assertValidHttpOptions(http, operation.name);

  const method: APIHttpMethod = http?.method ?? "POST";
  const own = http?.path ?? `/${operation.name}`;
  const ownSegments = parseRoutePath(own, `Operation "${operation.name}" route path`);

  if (http?.path === undefined && ownSegments.some((s) => s.startsWith(":"))) {
    throw new RangeError(
      `Operation "${operation.name}" cannot use its name as a path; declare metadata.http.path.`,
    );
  }

  const baseSegments = basePath === undefined ? [] : parseRoutePath(basePath, "basePath");
  const segments = [...baseSegments, ...ownSegments];
  const path = `/${segments.join("/")}`;
  parseRoutePath(path, `Operation "${operation.name}" route path`);
  const pathParams = segments.filter((s) => s.startsWith(":")).map((s) => s.slice(1));
  const inputSource: APIRouteInputSource =
    method === "GET" || method === "DELETE" ? "query" : "body";
  const metadata = operation.metadata;

  return Object.freeze({
    operationId: operation.name,
    method,
    path,
    pathParams: Object.freeze(pathParams),
    inputSource,
    ...(operation.input !== undefined ? { input: operation.input } : {}),
    ...(operation.output !== undefined ? { output: operation.output } : {}),
    ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
    ...(metadata?.tags !== undefined ? { tags: metadata.tags } : {}),
    ...(metadata?.deprecated !== undefined ? { deprecated: metadata.deprecated } : {}),
    ...(metadata?.version !== undefined ? { version: metadata.version } : {}),
    successStatus: 200,
  });
}

/**
 * Returns the conflict key of a route: two routes with the same method
 * and the same path shape (parameter names ignored) can never both match.
 */
export function routeConflictKey(route: APIOperationRoute): string {
  const shape = route.path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
  return `${route.method} ${shape}`;
}
