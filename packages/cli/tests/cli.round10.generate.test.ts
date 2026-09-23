/**
 * zudojs-cli — Audit round 10 regression tests: `zudojs generate`.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { mkdtempSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runGenerateCommand } from "../src/commands/generate.command.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

async function monolithProject(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-r10-gen-"));
  dirs.push(dir);
  const options = {
    projectName: "shop",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    services: [],
    installDeps: false,
    initGit: false,
  } as unknown as ScaffoldOptions;
  await writeFileTree(dir, generateMonolithFiles(options));
  return dir;
}

function context(cwd: string, values: Record<string, unknown>): CLIContext {
  const logger = {
    debug() {},
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace() {},
    fatal() {},
  };
  return {
    args: [],
    values: values as CLIContext["values"],
    cwd,
    env: {},
    logger: logger as unknown as CLIContext["logger"],
  };
}

describe("tooling/CLI-03", () => {
  it("refuses to overwrite an edited file and lists it; --force overwrites", async () => {
    const cwd = await monolithProject();
    const values = { schematic: "service", name: "billing" };
    await runGenerateCommand(context(cwd, values));
    // A generated service is `src/services/<name>.service.ts`, the file the
    // resource schematics and the container wiring use. It used to land in
    // `src/services/<name>/`, a second convention in one project.
    const file = join(cwd, "src/services/billing.service.ts");
    appendFileSync(file, "// USER EDIT\n");

    await expect(runGenerateCommand(context(cwd, values))).rejects.toThrow(
      /already exists:[\s\S]*billing\.service\.ts[\s\S]*--force/,
    );
    expect(readFileSync(file, "utf-8")).toContain("// USER EDIT");

    await runGenerateCommand(context(cwd, { ...values, force: true }));
    expect(readFileSync(file, "utf-8")).not.toContain("// USER EDIT");
  });

  it("still lets a new schematic append to an existing barrel", async () => {
    const cwd = await monolithProject();
    await runGenerateCommand(
      context(cwd, { schematic: "controller", name: "a" }),
    );
    await expect(
      runGenerateCommand(context(cwd, { schematic: "controller", name: "b" })),
    ).resolves.toBeUndefined();
  });
});

describe("tooling/CLI-06", () => {
  it("emits a BaseModule, exports it and registers it in app.ts", async () => {
    const cwd = await monolithProject();
    await runGenerateCommand(
      context(cwd, { schematic: "module", name: "billing" }),
    );

    const moduleSource = readFileSync(
      join(cwd, "src/modules/billing/billing.module.ts"),
      "utf-8",
    );
    expect(moduleSource).toContain(
      "export class BillingModule extends BaseModule",
    );
    expect(moduleSource).toContain("onInitialize");
    expect(readFileSync(join(cwd, "src/modules/index.ts"), "utf-8")).toContain(
      'export { BillingModule } from "./billing/index.js";',
    );
    const app = readFileSync(join(cwd, "src/app.ts"), "utf-8");
    expect(app).toContain(
      'import { BillingModule } from "./modules/index.js";',
    );
    expect(app).toContain("    new BillingModule(),\n");
    expect(app).toContain("    new AppModule(),\n");
  });
});
