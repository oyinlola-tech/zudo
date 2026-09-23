/**
 * Serving web-standard fetch handlers from an `@zudojs/http` router.
 */

import { webResponseToContext } from "../httpResponse/httpResponse.fromWeb.js";
import { normalizeRoutePattern } from "../httpRouter/core/util/httpRoute.util.js";
import type { RouterHandler } from "../httpRouter/core/types/httpRouter.type.js";
import type {
  HttpFetchHandler,
  HttpFetchMountTarget,
  MountFetchHandlerOptions,
} from "./httpFetchMount.type.js";
import { contextUrl, toWebRequest } from "./httpFetchMount.request.js";

/** The wildcard every mount registers; its name is reserved for mounts. */
const MOUNT_WILDCARD = "*fetchMountPath";

function segments(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

/**
 * Removes the first `count` path segments, keeping a trailing slash.
 *
 * Counted in segments rather than characters so it holds for a mount under
 * a group prefix, a parameterised mount path and a case-insensitive match.
 */
function splitPrefix(pathname: string, count: number): readonly [string, string] {
  const parts = segments(pathname);
  const prefix = `/${parts.slice(0, count).join("/")}`;
  const rest = parts.slice(count);
  if (rest.length === 0) return [prefix, "/"];
  return [prefix, `/${rest.join("/")}${pathname.endsWith("/") ? "/" : ""}`];
}

/**
 * Serves a web-standard `(request: Request) => Promise<Response>` handler —
 * an `@zudojs/rpc` server, `@zudojs/api` operations, any fetch-style app —
 * under `basePath` of an `@zudojs/http` router or router group.
 *
 * The handler receives a `Request` with the original method, headers
 * (connection-scoped ones removed), body and query, and a `signal` that
 * aborts when the client disconnects. Its `Response` is streamed back with
 * status, status text and headers intact, every `Set-Cookie` kept separate.
 * A handler that throws, or returns something that is not a `Response`,
 * fails the request like any other route (500 unless the error carries a
 * status).
 *
 * ```ts
 * mountFetchHandler(router, "/rpc", createRPCFetchHandler(rpcServer));
 * ```
 *
 * @returns A function that removes the mount.
 */
export function mountFetchHandler(
  target: HttpFetchMountTarget,
  basePath: string,
  handler: HttpFetchHandler,
  options: MountFetchHandlerOptions = {},
): () => void {
  if (typeof handler !== "function") {
    throw new TypeError("mountFetchHandler requires a handler function.");
  }
  const base = normalizeRoutePattern(basePath);
  const pattern = base === "/" ? `/${MOUNT_WILDCARD}` : `${base}/${MOUNT_WILDCARD}`;
  const strip = options.stripPrefix ?? true;

  const routeHandler: RouterHandler = async (context) => {
    const url = contextUrl(context.request, options.origin);
    const headers: Record<string, string> = {};
    if (strip) {
      const mounted = segments(context.route.path).length - 1;
      const [prefix, rest] = splitPrefix(url.pathname, mounted);
      url.pathname = rest;
      if (mounted > 0) headers["x-forwarded-prefix"] = prefix;
    }
    const request = toWebRequest(context.request, {
      url,
      signal: context.signal,
      headers,
    });
    const response = await handler(request);
    if (!(response instanceof Response)) {
      throw new TypeError(
        `The fetch handler mounted at ${base} returned ${typeof response}, not a Response.`,
      );
    }
    return webResponseToContext(response);
  };

  const routeOptions = {
    openapi: options.openapi ?? (false as const),
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.middleware ? { middleware: options.middleware } : {}),
  };
  const removers = (options.methods ?? (["*"] as const)).map((method) =>
    target.on(method, pattern, routeHandler, routeOptions),
  );

  return () => {
    for (const remove of removers) remove();
  };
}
