/**
 * zudojs-cli — `zudojs generate middleware <name>`.
 *
 * The schematic wrote `(ctx: unknown, next: () => Promise<void>) =>
 * Promise<void>`: registering it in the generated pipeline failed tsc with
 * TS2322, it dropped the response `next()` produced, and nothing told the
 * author where it had to be registered. It now writes an `HttpMiddleware`
 * that returns `next()`'s response and registers it in `src/server.ts`
 * between the `zudojs:server-middleware` markers (or prints the manual
 * step when the markers are gone).
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tsImport } from "tsx/esm/api";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { CLIContext } from "../src/cliType/cliType.type.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { generateMiddleware, type MiddlewareRegistration } from "../src/generators/middleware/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { linesBetweenMarkers, MARKERS } from "../src/wiring/index.js";
import {
  generatedDiagnostics,
  removeScaffolds,
  scaffold,
  scaffoldOptions,
  typecheck,
} from "./helpers/generatedProject.helper.js";

afterAll(removeScaffolds);

async function generate(
  dir: string,
  name: string,
  basePath: string,
): Promise<{ readonly files: string[]; readonly registration: MiddlewareRegistration | undefined }> {
  let registration: MiddlewareRegistration | undefined;
  const files = await generateMiddleware(
    { name, basePath, onRegistered: (outcome) => (registration = outcome) },
    dir,
  );
  return { files, registration };
}

describe("generate middleware", () => {
  it("writes an HttpMiddleware that returns next()'s response", async () => {
    const dir = await scaffold("mw-unit", generateMonolithFiles(scaffoldOptions()));
    await generate(dir, "request-timer", "src");
    const file = join(dir, "src/middlewares/request-timer.middleware.ts");
    const source = await readFile(file, "utf-8");

    expect(source).toContain(`import type { HttpMiddleware } from "@zudojs/http";`);
    expect(source).toContain("export function requestTimerMiddleware(): HttpMiddleware {");
    expect(source).not.toContain("unknown");

    const module = (await tsImport(file, import.meta.url)) as {
      requestTimerMiddleware: () => (context: unknown, next: () => Promise<unknown>) => Promise<unknown>;
    };
    const response = { status: 200 };
    await expect(module.requestTimerMiddleware()({}, async () => response)).resolves.toBe(response);
  });

  it("registers the middleware in server.ts between the markers and exports it", async () => {
    const dir = await scaffold("mw-register", generateMonolithFiles(scaffoldOptions()));
    const { files, registration } = await generate(dir, "request-timer", "src");

    expect(registration).toEqual({ registered: true, serverFile: "src/server.ts", manualSteps: [] });
    expect(files).toContain("src/server.ts");
    const server = await readFile(join(dir, "src/server.ts"), "utf-8");
    expect(linesBetweenMarkers(server, MARKERS.serverImports)).toContain(
      `import { requestTimerMiddleware } from "./middlewares/index.js";`,
    );
    expect(linesBetweenMarkers(server, MARKERS.serverMiddleware)).toEqual(["requestTimerMiddleware(),"]);
    expect(await readFile(join(dir, "src/middlewares/index.ts"), "utf-8")).toBe(
      `export { requestTimerMiddleware } from "./request-timer.middleware.js";\n`,
    );

    await generate(dir, "request-timer", "src");
    const again = await readFile(join(dir, "src/server.ts"), "utf-8");
    expect(again).toBe(server);
  });

  it("reports the manual step and leaves server.ts alone without the markers", async () => {
    const dir = await scaffold("mw-manual", generateMonolithFiles(scaffoldOptions()));
    const serverPath = join(dir, "src/server.ts");
    const stripped = (await readFile(serverPath, "utf-8")).replace(/^\s*\/\/ zudojs:server-middleware:(start|end)\n/gm, "");
    await writeFile(serverPath, stripped);

    const { files, registration } = await generate(dir, "audit", "src");

    expect(registration?.registered).toBe(false);
    expect(registration?.manualSteps).toEqual([
      `In src/server.ts: import { auditMiddleware } from "./middlewares/index.js";`,
      "In src/server.ts: add auditMiddleware(), to the middlewares list of the HttpMiddlewarePipeline, before dispatch",
    ]);
    expect(files).not.toContain("src/server.ts");
    expect(await readFile(serverPath, "utf-8")).toBe(stripped);
  });

  it("dry run lists server.ts without writing anything", async () => {
    const dir = await scaffold("mw-dry", generateMonolithFiles(scaffoldOptions()));
    const before = await readFile(join(dir, "src/server.ts"), "utf-8");
    const files = await generateMiddleware({ name: "audit", basePath: "src", dryRun: true }, dir);
    expect(files).toEqual(["src/middlewares/audit.middleware.ts", "src/middlewares/index.ts", "src/server.ts"]);
    expect(await readFile(join(dir, "src/server.ts"), "utf-8")).toBe(before);
  });
});

function commandContext(cwd: string, values: Record<string, unknown>) {
  const logger = { debug() {}, trace() {}, fatal() {}, info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const context: CLIContext = {
    args: [],
    values: values as CLIContext["values"],
    cwd,
    env: {},
    logger: logger as unknown as CLIContext["logger"],
  };
  return { context, logger };
}

describe("zudojs generate middleware", () => {
  it("says where the middleware was registered, twice in a row", async () => {
    const dir = await scaffold("mw-cmd", generateMonolithFiles(scaffoldOptions()));
    for (const name of ["request-timer", "audit"]) {
      const { context, logger } = commandContext(dir, { schematic: "middleware", name });
      await runGenerateCommand(context);
      expect(logger.info).toHaveBeenCalledWith("Registered in the middleware pipeline of src/server.ts.");
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("Could not register"));
    }
    const server = await readFile(join(dir, "src/server.ts"), "utf-8");
    expect(linesBetweenMarkers(server, MARKERS.serverMiddleware)).toEqual([
      "requestTimerMiddleware(),",
      "auditMiddleware(),",
    ]);
  });

  it("prints the manual step when server.ts has no markers", async () => {
    const dir = await scaffold("mw-cmd-manual", generateMonolithFiles(scaffoldOptions()));
    const serverPath = join(dir, "src/server.ts");
    await writeFile(serverPath, (await readFile(serverPath, "utf-8")).replaceAll("zudojs:server-", "x:"));
    const { context, logger } = commandContext(dir, { schematic: "middleware", name: "audit" });
    await runGenerateCommand(context);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("add auditMiddleware(), to the middlewares list of the HttpMiddlewarePipeline"),
    );
  });
});

describe("generated middleware registered in the pipeline", () => {
  it(
    "type-checks in a monolith, a module of a modular monolith and a microservice",
    async () => {
      const mono = await scaffold("mw-tc-mono", generateMonolithFiles(scaffoldOptions()));
      await generate(mono, "request-timer", "src");
      await generate(mono, "audit", "src");

      const modular = await scaffold(
        "mw-tc-modular",
        generateModularMonolithFiles(scaffoldOptions({ architecture: "modular-monolith", services: ["billing"] })),
      );
      const moduleResult = await generate(modular, "tenant", "src/modules/billing");
      expect(moduleResult.registration?.serverFile).toBe("src/server.ts");
      expect(await readFile(join(modular, "src/server.ts"), "utf-8")).toContain(
        `import { tenantMiddleware } from "./modules/billing/middlewares/index.js";`,
      );

      const micro = await scaffold(
        "mw-tc-micro",
        generateMicroserviceFiles(scaffoldOptions({ architecture: "microservice", services: ["identity"] })),
      );
      const serviceResult = await generate(micro, "audit", "apps/services/identity/src");
      expect(serviceResult.registration?.registered).toBe(true);
      await generate(micro, "audit", "apps/gateway/src");

      for (const dir of [mono, modular, micro]) {
        expect(generatedDiagnostics(await typecheck(dir)), dir).toBe("");
      }
    },
    300_000,
  );
});
