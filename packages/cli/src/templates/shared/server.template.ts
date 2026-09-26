/**
 * zudojs-cli — Generated `src/server.ts`
 *
 * The entry point loads the configuration, builds the runtime with
 * `createApp()`, constructs the composition root (`container.ts`) and
 * registers it in the runtime's DI container, builds a router with
 * `createRouter()`, registers every route through `registerRoutes`, mounts
 * the OpenAPI document (and, outside production, the `/docs` page) when the
 * `openapi` capability is on, and serves the router with `createHttpServer`
 * + `createNodeHttpAdapter`.
 *
 * Every response passes through the @zudojs/security default headers, a
 * CORS policy that allows only `CORS_ORIGINS` (none by default) and a
 * per-client rate limit (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS`; 0
 * turns it off). Exposed errors are answered with their status; anything
 * else is logged with the runtime's logger and answered with a generic 500
 * built inside the pipeline, so it carries the security headers too. It
 * used to rethrow, which left the adapter to answer a bare 500 that nothing
 * logged. On SIGINT/SIGTERM integrations drain, HTTP stops, then the
 * runtime stops (see `server.parts.ts`).
 * `tests/generatedProject.typecheck.test.ts` type-checks the output against
 * the current `@zudojs/*` sources; `tests/cli.round12.server.test.ts` runs it.
 */

import { MARKERS, renderMarkerBlock } from "../../wiring/index.js";
import { openApiServerLines, renderShutdownBlock } from "./server.parts.js";

export { openApiServerLines } from "./server.parts.js";

/** Options for {@link renderServerFile}. */
export interface ServerFileOptions {
  /** Title of the OpenAPI document. */
  readonly title: string;
  /** Whether `/openapi.json` and `/docs` are mounted. */
  readonly openapi: boolean;
}

/** Renders `src/server.ts`. */
export function renderServerFile(options: ServerFileOptions): string {
  const openapi = openApiServerLines(options.title);

  return `import { createServer } from "node:http";

import {
  HttpMiddlewarePipeline,
  createCorsMiddleware,
  createHttpServer,
  createNodeHttpAdapter,
  createRateLimitMiddleware,
  createResponseContext,
  createRouter,
  type HttpMiddleware,
  type HttpRequestContext,
} from "@zudojs/http";
${renderMarkerBlock(MARKERS.serverImports, options.openapi ? [openapi.importLine] : [])}

import { createApp } from "./app.js";
import { loadConfig } from "./configs/index.js";
import { APP_DEPENDENCIES, createDependencies } from "./container.js";
import { checkIntegrations, drainIntegrations, integrations } from "./integrations/index.js";
import { registerRoutes } from "./routes/index.js";
import { errorDetails, errorResponse, json, securityHeaders } from "./utils/http.js";

const config = await loadConfig();
const httpServer = createServer();
const runtime = createApp({ config, httpServer });
const logger = runtime.context.logger;

const dependencies = createDependencies({
  health: async () => {
    const checks = await checkIntegrations(integrations);
    const ready =
      runtime.state === "running" && Object.values(checks).every((check) => check === "up");
    return { ready, checks };
  },
});
// Modules reach the composition root through the runtime container:
// context.application.container.resolve(APP_DEPENDENCIES).
runtime.context.container.registerValue(APP_DEPENDENCIES, dependencies);

const router = createRouter();
registerRoutes(router, dependencies);
${renderMarkerBlock(MARKERS.serverMounts, options.openapi ? [openapi.mountLine] : [])}

const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response !== undefined && response.status < 500) return response;
    logger.error(\`Unhandled error: \${context.request.method} \${context.request.path}\`, errorDetails(error));
    return response ?? json(500, { error: "Internal Server Error" });
  }
};

const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: config.corsOrigins }),
    // RATE_LIMIT_MAX=0 turns the limit off (load tests, local development).
    ...(config.rateLimit.max > 0
      ? [createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max })]
      : []),
${renderMarkerBlock(MARKERS.serverMiddleware, [], "    ")}
    dispatch,
  ],
});

await runtime.start();

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ server: httpServer, host: config.host, port: config.port }),
  handler: (request: HttpRequestContext) => pipeline.execute(request, createResponseContext()),
});

await server.start();

${renderShutdownBlock()}`;
}
