/**
 * zudojs-cli — Fragments of the generated `src/server.ts`.
 *
 * The OpenAPI lines (also inserted by `zudojs add openapi`) and the
 * shutdown block. `server.template.ts` assembles them.
 */

/** Emits a string as a TypeScript string literal that cannot break out. */
function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * The lines `zudojs add openapi` (or `create`) puts in server.ts.
 *
 * The documentation page is served in every environment but production:
 * it lists every route and its schemas, which a public deployment should
 * not hand out by default. `/openapi.json` stays, for clients and tooling.
 */
export function openApiServerLines(title: string): {
  readonly importLine: string;
  readonly mountLine: string;
} {
  return {
    importLine: `import { mountOpenAPI } from "@zudojs/http";`,
    mountLine: `mountOpenAPI(router, { info: { title: ${literal(title)}, version: "0.1.0" }, docsPath: config.nodeEnv === "production" ? false : "/docs" });`,
  };
}

/**
 * The SIGINT/SIGTERM handlers and the "Listening on" line.
 *
 * The signal listeners stay registered (`process.on`, not `once`) for the
 * whole shutdown. Under `tsx watch`, Ctrl+C delivers SIGINT twice (from the
 * terminal and forwarded by the watcher); with `once` the second signal
 * found no listener and Node's default action killed the process before
 * the runtime had stopped or logged anything. "Listening on" is logged once
 * the listeners are in place, so a signal sent after it is always handled.
 */
export function renderShutdownBlock(): string {
  return `let stopping = false;
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

console.log(\`Listening on http://\${config.host}:\${server.address?.port ?? config.port}\`);
`;
}
