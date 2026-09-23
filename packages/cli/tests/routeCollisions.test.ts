/**
 * zudojs-cli — two generators never import the same routes function.
 *
 * `generate module billing` followed by `generate route billing` wrote
 *
 *   import { registerBillingRoutes } from "../modules/billing/routes/index.js";
 *   import { registerBillingRoutes } from "./billing.routes.js";
 *
 * into src/routes/index.ts, which fails with a duplicate identifier. A
 * module's routes function is now `register<Name>ModuleRoutes`, and any
 * generator that would still import a name already bound refuses instead.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { runCreateCommand } from "../src/commands/create.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function context(cwd: string, values: Record<string, unknown>, args: string[] = []): CLIContext {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() };
  return {
    args,
    values: values as CLIContext["values"],
    cwd,
    env: {},
    logger: logger as unknown as CLIContext["logger"],
  };
}

async function project(values: Record<string, string> = {}): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), "zudojs-routes-"));
  dirs.push(cwd);
  const args = Object.keys(values).map((key) => `--${key}`);
  await runCreateCommand(
    context(cwd, { "project-name": "shop", "no-install": true, "no-git": true, ...values }, args),
  );
  return join(cwd, "shop");
}

function generate(root: string, schematic: string, name: string, extra: Record<string, unknown> = {}) {
  return runGenerateCommand(context(root, { schematic, name, ...extra }));
}

/** Names imported by a file, in order, with repeats. */
function importedNames(root: string, file: string): string[] {
  return [...readFileSync(join(root, file), "utf-8").matchAll(/^import \{([^}]+)\}/gm)].flatMap(
    (match) => match[1]!.split(",").map((name) => name.trim()).filter(Boolean),
  );
}

function expectNoDuplicateImports(root: string, file: string): void {
  const names = importedNames(root, file);
  expect(names.filter((name, i) => names.indexOf(name) !== i), file).toEqual([]);
}

describe("module and resource-family generators with the same name", () => {
  it.each([
    ["module", "route"],
    ["route", "module"],
    ["module", "resource"],
    ["resource", "module"],
  ])("%s billing, then %s billing: both register, nothing is imported twice", async (first, second) => {
    const root = await project();
    await generate(root, first, "billing");
    await generate(root, second, "billing");

    expectNoDuplicateImports(root, "src/routes/index.ts");
    expectNoDuplicateImports(root, "src/container.ts");
    const routes = readFileSync(join(root, "src/routes/index.ts"), "utf-8");
    expect(routes).toContain("registerBillingModuleRoutes(router, deps);");
    expect(routes).toContain("registerBillingRoutes(router, deps.billingController);");
    expect(readFileSync(join(root, "src/modules/billing/routes/index.ts"), "utf-8")).toContain(
      "export function registerBillingModuleRoutes(",
    );
  });

  it("refuses a route over an existing resource of the same name", async () => {
    const root = await project();
    await generate(root, "resource", "billing");

    await expect(generate(root, "route", "billing")).rejects.toThrow(/already exists/);
    expectNoDuplicateImports(root, "src/routes/index.ts");
  });

  it("refuses a module whose routes function a resource already imports", async () => {
    const root = await project();
    await generate(root, "resource", "billing-module");

    await expect(generate(root, "module", "billing")).rejects.toThrow(
      /already imports registerBillingModuleRoutes .*Choose another name/,
    );
    expectNoDuplicateImports(root, "src/routes/index.ts");
  });

  it("refuses a resource whose routes function a module already imports", async () => {
    const root = await project();
    await generate(root, "module", "billing");

    await expect(generate(root, "resource", "billing-module")).rejects.toThrow(
      /already imports the routes function .*Choose another name/,
    );
    expectNoDuplicateImports(root, "src/routes/index.ts");
  });
});

describe("a resource under --module and a top-level resource with the same name", () => {
  it.each([
    ["top-level first", [{}, { module: "billing" }]],
    ["module first", [{ module: "billing" }, {}]],
  ] as const)("is refused (%s)", async (_label, [first, second]) => {
    const root = await project({ architecture: "modular-monolith", services: "billing" });
    await generate(root, "resource", "invoices", first);

    await expect(generate(root, "resource", "invoices", second)).rejects.toThrow(
      /already (exists|constructs "invoicesController")/,
    );
    expectNoDuplicateImports(root, "src/routes/index.ts");
    expectNoDuplicateImports(root, "src/modules/billing/routes/index.ts");
    expectNoDuplicateImports(root, "src/container.ts");
  });

  it("a module and a resource inside it with the module's name coexist", async () => {
    const root = await project({ architecture: "modular-monolith", services: "billing" });
    await generate(root, "resource", "billing", { module: "billing" });

    expectNoDuplicateImports(root, "src/routes/index.ts");
    expectNoDuplicateImports(root, "src/modules/billing/routes/index.ts");
    expect(readFileSync(join(root, "src/modules/billing/routes/index.ts"), "utf-8")).toContain(
      "registerBillingRoutes(router, deps.billingController);",
    );
  });
});
