/**
 * Serving a router's own OpenAPI document and documentation page.
 */

import type { OpenAPIDocument } from "@zudojs/openapi";

import { createResponseContext } from "../httpResponse/httpResponse.context.js";
import type { HttpRouter } from "../httpRouter/core/register/httpRouter.register.js";
import type { HttpOpenAPIMountOptions } from "./httpOpenApi.type.js";
import { createRouterOpenAPI } from "./httpOpenApi.document.js";

/** What `mountOpenAPI` registered. */
export interface HttpOpenAPIMount {
  /** The current document, built from the router's routes. */
  document(): OpenAPIDocument;
  /** Removes every route `mountOpenAPI` registered. */
  unmount(): void;
}

/**
 * Serves the router's OpenAPI document at `path` (default `/openapi.json`),
 * optionally as YAML at `yamlPath`, and a Swagger UI page (or ReDoc, with
 * `ui: { renderer: "redoc" }`) at `docsPath` (default `/docs`, or off when
 * `NODE_ENV` is `production` and no `docsPath` is given).
 *
 * The document is generated from the routes registered on `router`, so a
 * route added after mounting appears on the next request. The routes this
 * registers are hidden from the document themselves.
 *
 * ```ts
 * mountOpenAPI(router, {
 *   info: { title: "Orders API", version: "1.0.0" },
 *   exclude: ["/health", "/internal/*"],
 * });
 * ```
 */
export function mountOpenAPI(
  router: HttpRouter,
  options: HttpOpenAPIMountOptions,
): HttpOpenAPIMount {
  const source = createRouterOpenAPI(router, options);
  const jsonPath = options.path ?? "/openapi.json";
  const cacheControl = options.cacheControl ?? "no-cache";
  const routeOptions = {
    openapi: false as const,
    ...(options.middleware ? { middleware: options.middleware } : {}),
  };
  const serve = (format: "json" | "yaml") => () => {
    const response = source.manager().toResponse({
      format,
      validate: options.validate ?? false,
      cacheControl,
    });
    return createResponseContext({ ...response, headers: { ...response.headers } });
  };

  const removers = [router.get(jsonPath, serve("json"), routeOptions)];
  if (typeof options.yamlPath === "string") {
    removers.push(router.get(options.yamlPath, serve("yaml"), routeOptions));
  }
  const docsPath = options.docsPath ?? defaultDocsPath();
  if (docsPath !== false) {
    const ui = { ...options.ui, specUrl: options.ui?.specUrl ?? jsonPath };
    removers.push(
      router.get(
        docsPath,
        () => {
          const response = source.manager().toUIResponse(ui);
          return createResponseContext({ ...response, headers: { ...response.headers } });
        },
        routeOptions,
      ),
    );
  }

  return Object.freeze({
    document: source.document,
    unmount: () => {
      for (const remove of removers) remove();
    },
  });
}

/** `/docs`, or `false` in production so the page is opt-in there. */
function defaultDocsPath(): string | false {
  return process.env.NODE_ENV === "production" ? false : "/docs";
}
