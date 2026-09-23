/**
 * zudojs-cli — Generated `src/server.ts`
 *
 * The entry point loads the configuration, builds a router with
 * `createRouter()`, registers every route through `registerRoutes` (from
 * the composition root in `container.ts`), mounts the OpenAPI document and
 * `/docs` page when the `openapi` capability is on, and serves the router
 * with `createHttpServer` + `createNodeHttpAdapter`.
 *
 * Every response passes through the @zudojs/security default headers, a
 * CORS policy that allows only `CORS_ORIGINS` (none by default) and a
 * per-client rate limit (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS`). Exposed
 * 4xx errors are answered with their status; anything else is a generic
 * 500. On SIGINT/SIGTERM integrations drain, HTTP stops, then the runtime
 * stops. `tests/generatedProject.typecheck.test.ts` type-checks the output
 * against the current `@zudojs/*` sources.
 *
 * The signal listeners stay registered (`process.on`, not `once`) for the
 * whole shutdown. Under `tsx watch`, Ctrl+C delivers SIGINT twice (from the
 * terminal and forwarded by the watcher); with `once` the second signal
 * found no listener and Node's default action killed the process before
 * the runtime had stopped or logged anything.
 */

import { MARKERS, renderMarkerBlock } from "../../wiring/index.js";

/** Options for {@link renderServerFile}. */
export interface ServerFileOptions {
  /** Title of the OpenAPI document. */
  readonly title: string;
  /** Whether `/openapi.json` and `/docs` are mounted. */
  readonly openapi: boolean;
}

/** Emits a string as a TypeScript string literal that cannot break out. */
function literal(value: string): string {
  return JSON.stringify(value);
}

/** The lines `zudojs add openapi` (or `create`) puts in server.ts. */
export function openApiServerLines(title: string): {
  readonly importLine: string;
  readonly mountLine: string;
} {
  return {
    importLine: `import { mountOpenAPI } from "@zudojs/http";`,
    mountLine: `mountOpenAPI(router, { info: { title: ${literal(title)}, version: "0.1.0" } });`,
  };
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
import { createDependencies } from "./container.js";
import { checkIntegrations, drainIntegrations, integrations } from "./integrations/index.js";
import { registerRoutes } from "./routes/index.js";
import { errorResponse, securityHeaders } from "./utils/http.js";

const config = await loadConfig();
const httpServer = createServer();
const runtime = createApp({ config, httpServer });

const router = createRouter();
registerRoutes(
  router,
  createDependencies({
    health: async () => {
      const checks = await checkIntegrations(integrations);
      const ready =
        runtime.state === "running" && Object.values(checks).every((check) => check === "up");
      return { ready, checks };
    },
  }),
);
${renderMarkerBlock(MARKERS.serverMounts, options.openapi ? [openapi.mountLine] : [])}

const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};

const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: config.corsOrigins }),
    createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
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
console.log(\`Listening on http://\${config.host}:\${server.address?.port ?? config.port}\`);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) {
      console.log(\`Received \${signal} again: already shutting down.\`);
      return;
    }
    stopping = true;
    console.log(\`Received \${signal}: shutting down.\`);
    void drainIntegrations(integrations)
      .then(() => server.stop())
      .then(() => runtime.stop())
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  });
}
`;
}
