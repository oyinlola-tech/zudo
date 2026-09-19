/**
 * zudojs-cli — Generated `src/server.ts`
 *
 * The entry point used to call `runtime.start()` and nothing else. The
 * runtime creates no HTTP server, so `pnpm dev` logged "ready" and exited
 * with 0 even though `.env.example` set `PORT`, the Dockerfile exposed it
 * and the fullstack frontend called it.
 *
 * The emitted server starts the runtime, then serves HTTP with
 * `@zudojs/http` (`createHttpServer` + `createNodeHttpAdapter`) on `PORT`,
 * answers `GET /health`, and keeps the process alive until SIGINT/SIGTERM,
 * when it stops the HTTP server and then the runtime. `tests/
 * generatedProject.typecheck.test.ts` type-checks this output against the
 * current `@zudojs/*` sources.
 */

/** Options for {@link renderServerFile}. */
export interface ServerFileOptions {
  /** Port used when `PORT` is unset. Defaults to 3000. */
  readonly defaultPort?: number;
  /**
   * Import path of a `HealthController` whose `check()` answers `/health`,
   * relative to server.ts. When omitted, `/health` is answered inline.
   */
  readonly healthControllerImport?: string;
}

/** Emits a string as a TypeScript string literal that cannot break out. */
function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * Renders `src/server.ts`: starts the runtime, serves HTTP on `PORT` with a
 * `/health` route, and shuts both down cleanly on SIGINT/SIGTERM.
 */
export function renderServerFile(
  appImportPath = "./app.js",
  options: ServerFileOptions = {},
): string {
  const defaultPort = options.defaultPort ?? 3000;
  const controller = options.healthControllerImport;
  const controllerImport = controller
    ? `import { HealthController } from ${literal(controller)};\n`
    : "";
  const healthBody = controller
    ? "new HealthController().check()"
    : `{ status: "ok", timestamp: new Date().toISOString() }`;

  return `import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
  type HttpRequestContext,
} from "@zudojs/http";

import { createApp } from ${literal(appImportPath)};
${controllerImport}
const DEFAULT_PORT = ${defaultPort};

/** Reads PORT, refusing values that are not a TCP port. */
function resolvePort(): number {
  const raw = process.env["PORT"];
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(\`PORT must be an integer between 0 and 65535, got "\${raw}".\`);
  }
  return port;
}

const runtime = createApp();
await runtime.start();

const server = createHttpServer({
  adapter: createNodeHttpAdapter({
    host: process.env["HOST"] ?? "0.0.0.0",
    port: resolvePort(),
  }),
  handler: (request: HttpRequestContext) => {
    if (request.path === "/health") {
      if (runtime.state !== "running") {
        return createResponseContext({ status: 503 }).json({ status: "unavailable" });
      }
      return ${healthBody};
    }
    return createResponseContext({ status: 404 }).json({ error: "Not Found" });
  },
});

await server.start();
console.log(\`Listening on port \${server.address?.port ?? resolvePort()}\`);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void server
      .stop()
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
