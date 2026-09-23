/**
 * zudojs-cli — Graceful shutdown of the generated `src/server.ts`.
 *
 * The server registered its SIGINT/SIGTERM handlers with `process.once`
 * behind an `if (stopping) return` guard that could never run. Under
 * `npm run dev` (tsx watch), Ctrl+C delivers SIGINT twice; the second found
 * no listener, Node's default action killed the process mid-shutdown, and
 * none of the graceful-shutdown logs appeared.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { renderServerFile } from "../src/templates/shared/server.template.js";
import { MARKERS, insertBetweenMarkers } from "../src/wiring/index.js";
import {
  removeScaffolds,
  runTsc,
  scaffold,
  scaffoldOptions,
} from "./helpers/generatedProject.helper.js";
import {
  linkLocalPackages,
  packagesBuilt,
  startNode,
} from "./helpers/generatedProject.runtime.helper.js";

afterAll(removeScaffolds);

const servers = (files: Record<string, string>): Array<readonly [string, string]> =>
  Object.entries(files).filter(([path]) => path.endsWith("src/server.ts"));

describe("generated server signal handlers", () => {
  const projects: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["monolith", generateMonolithFiles(scaffoldOptions())],
    [
      "modular-monolith",
      generateModularMonolithFiles(
        scaffoldOptions({ architecture: "modular-monolith", services: ["identity"] }),
      ),
    ],
    [
      "microservice",
      generateMicroserviceFiles(
        scaffoldOptions({ architecture: "microservice", services: ["identity", "billing"] }),
      ),
    ],
  ];

  it.each(projects)("%s: every server.ts keeps its listeners for the whole shutdown", (_name, files) => {
    const found = servers(files);
    expect(found.length).toBeGreaterThan(0);
    for (const [path, source] of found) {
      expect(source, path).not.toContain("process.once(");
      expect(source, path).toContain("process.on(signal, () => {");
      expect(source, path).toMatch(/if \(stopping\) \{\n\s+console\.log\(`Received \$\{signal\} again: already shutting down\.`\);/);
      expect(source.indexOf("process.on(signal"), `${path}: listeners before "Listening on"`).toBeLessThan(
        source.indexOf("console.log(`Listening on"),
      );
    }
  });

  it("covers the gateway and each service of a microservice project", () => {
    const paths = servers(projects[2]![1]).map(([path]) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/gateway/src/server.ts",
        "apps/services/identity/src/server.ts",
        "apps/services/billing/src/server.ts",
      ]),
    );
  });

  it("renders process.on with and without OpenAPI", () => {
    for (const openapi of [true, false]) {
      const source = renderServerFile({ title: "t", openapi });
      expect(source).toContain("process.on(signal");
      expect(source).not.toContain("process.once");
    }
  });
});

/** An integration whose drain takes long enough for a second Ctrl+C to land. */
const SLOW_INTEGRATION = `import type { Integration } from "./integration.js";

export const slowIntegration: Integration = {
  name: "slow",
  async start() {},
  async drain() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log("slow integration drained");
  },
  async stop() {},
};
`;

const RUNTIME_PACKAGES = ["core", "runtime", "http", "logger", "config", "security", "errors"];

describe("generated server under a repeated SIGINT", () => {
  it.skipIf(!packagesBuilt(RUNTIME_PACKAGES))(
    "completes the graceful shutdown when SIGINT arrives twice",
    async () => {
      const dir = await scaffold(
        "signals",
        generateMonolithFiles(
          scaffoldOptions({ enableCQRS: false, enableMessaging: false, enableDatabase: false }),
        ),
      );
      const index = join(dir, "src/integrations/index.ts");
      let source = await readFile(index, "utf-8");
      source = insertBetweenMarkers(source, MARKERS.integrationImports, `import { slowIntegration } from "./slow.js";`).source;
      source = insertBetweenMarkers(source, MARKERS.integrations, "slowIntegration,").source;
      await writeFile(index, source);
      await writeFile(join(dir, "src/integrations/slow.ts"), SLOW_INTEGRATION);

      await linkLocalPackages(dir);
      expect(await runTsc(dir, ["-p", "tsconfig.json"])).toBe("");

      const server = startNode(dir, "dist/server.js", {
        HOST: "127.0.0.1",
        PORT: "0",
        NODE_ENV: "production",
      });
      try {
        await server.waitFor("Listening on http://127.0.0.1:");
        server.child.kill("SIGINT");
        await server.waitFor("Received SIGINT: shutting down.");
        server.child.kill("SIGINT");
        await server.waitFor("already shutting down");
      } finally {
        if (server.child.exitCode === null && server.child.signalCode === null) {
          setTimeout(() => server.child.kill("SIGKILL"), 15_000).unref();
        }
      }

      const { code, signal } = await server.exited;
      const output = server.output();
      expect({ code, signal }, output).toEqual({ code: 0, signal: null });
      expect(output).toContain("Received SIGINT again: already shutting down.");
      expect(output).toContain("slow integration drained");
      expect(output).toContain("Graceful shutdown complete.");
      expect(output).toContain("Runtime stopped.");
    },
    120_000,
  );
});
