/**
 * `zudojs generate resource|route|controller|repository|dto`: the full,
 * registered chain in every architecture; clean failure on a second run;
 * manual steps (and no edits) when markers are missing.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runGenerateCommand } from "../src/commands/generate.command.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function options(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    projectName: "shop", projectType: "backend", architecture: "monolith", packageManager: "pnpm",
    database: "postgresql", api: "rest", services: [], enableCQRS: false, enableMessaging: false,
    enableObservability: false, enableOpenAPI: true, enableDatabase: false, enableQueue: false,
    enableDocker: false, installDeps: false, initGit: false, ...overrides,
  };
}

async function project(architecture: ScaffoldOptions["architecture"], services: string[] = []): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "zudojs-gen-"));
  dirs.push(root);
  const generate = architecture === "monolith" ? generateMonolithFiles
    : architecture === "modular-monolith" ? generateModularMonolithFiles : generateMicroserviceFiles;
  await writeFileTree(root, generate(options({ architecture, services })));
  await new ManifestManager(root).create({
    version: "1.0.0", projectType: "backend", architecture,
    backend: { architecture, api: "rest" }, workspace: { packageManager: "pnpm" }, capabilities: [],
    ...(services.length > 0 ? { services } : {}),
  });
  return root;
}

function context(cwd: string, values: Record<string, unknown>): CLIContext & { warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  return {
    args: [], values: values as CLIContext["values"], cwd, env: {}, warn,
    logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), trace: vi.fn(), fatal: vi.fn() } as unknown as CLIContext["logger"],
  };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf-8");

describe("generate resource (monolith)", () => {
  it("writes the whole chain and registers it once", async () => {
    const root = await project("monolith");
    await runGenerateCommand(context(root, { schematic: "resource", name: "users" }));

    for (const path of [
      "src/dtos/users.dto.ts", "src/repositories/users.repository.ts", "src/services/users.service.ts",
      "src/controllers/users.controller.ts", "src/routes/users.routes.ts", "tests/users.test.ts",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
    const routes = read(root, "src/routes/index.ts");
    expect(routes).toContain('import { registerUsersRoutes } from "./users.routes.js";');
    expect(routes).toContain("registerUsersRoutes(router, deps.usersController);");
    const container = read(root, "src/container.ts");
    expect(container).toContain("usersController: new UsersController(new UsersService(new InMemoryUsersRepository())),");
    expect(read(root, "src/services/users.service.ts")).toContain("NotFoundError");
    expect(read(root, "src/routes/users.routes.ts")).toContain("openapi:");
    expect(read(root, "src/dtos/users.dto.ts")).toContain("export type User = ");
  });

  it("fails cleanly the second time and never duplicates a registration", async () => {
    const root = await project("monolith");
    await runGenerateCommand(context(root, { schematic: "resource", name: "users" }));
    const before = read(root, "src/routes/index.ts") + read(root, "src/container.ts");
    await expect(runGenerateCommand(context(root, { schematic: "resource", name: "users" }))).rejects.toThrow(/already exists/);
    expect(read(root, "src/routes/index.ts") + read(root, "src/container.ts")).toBe(before);
    await runGenerateCommand(context(root, { schematic: "resource", name: "users", force: true }));
    expect(read(root, "src/routes/index.ts").match(/registerUsersRoutes\(router/g)).toHaveLength(1);
    expect(read(root, "src/container.ts").match(/usersController:/g)).toHaveLength(1);
  });

  it("prints what to add, and edits nothing, when the markers are missing", async () => {
    const root = await project("monolith");
    writeFileSync(join(root, "src/routes/index.ts"), "export function registerRoutes() {}\n");
    const ctx = context(root, { schematic: "resource", name: "users" });
    await runGenerateCommand(ctx);
    expect(read(root, "src/routes/index.ts")).toBe("export function registerRoutes() {}\n");
    const warning = String(ctx.warn.mock.calls.at(-1)?.[0]);
    expect(warning).toContain("registerUsersRoutes(router, deps.usersController);");
    expect(warning).toContain("// zudojs:routes:start");
  });

  it("route and controller write their missing lower layers; route registers itself", async () => {
    const root = await project("monolith");
    await runGenerateCommand(context(root, { schematic: "controller", name: "tags" }));
    expect(existsSync(join(root, "src/services/tags.service.ts"))).toBe(true);
    expect(read(root, "src/routes/index.ts")).not.toContain("registerTagsRoutes");
    await runGenerateCommand(context(root, { schematic: "route", name: "tags" }));
    expect(read(root, "src/routes/index.ts")).toContain("registerTagsRoutes(router, deps.tagsController);");
  });

  it("refuses names that would shadow globals", async () => {
    const root = await project("monolith");
    await expect(runGenerateCommand(context(root, { schematic: "resource", name: "records" }))).rejects.toThrow(/shadow/);
  });
});

describe("generate resource in modules and services", () => {
  it("modular monolith: --module writes into the module and registers with its routes index", async () => {
    const root = await project("modular-monolith", ["billing"]);
    const appRoutes = read(root, "src/routes/index.ts");
    expect(appRoutes).toContain("registerBillingModuleRoutes(router, deps);");
    await runGenerateCommand(context(root, { schematic: "resource", name: "invoices", module: "billing" }));
    expect(existsSync(join(root, "src/modules/billing/controllers/invoices.controller.ts"))).toBe(true);
    expect(read(root, "src/modules/billing/routes/index.ts")).toContain("registerInvoicesRoutes(router, deps.invoicesController);");
    expect(read(root, "src/container.ts")).toContain('from "./modules/billing/controllers/invoices.controller.js"');
    await expect(
      runGenerateCommand(context(root, { schematic: "resource", name: "x", module: "missing" })),
    ).rejects.toThrow(/does not exist/);
  });

  it("modular monolith: generate module creates and registers the module's routes", async () => {
    const root = await project("modular-monolith");
    await runGenerateCommand(context(root, { schematic: "module", name: "catalog" }));
    expect(existsSync(join(root, "src/modules/catalog/routes/index.ts"))).toBe(true);
    expect(read(root, "src/routes/index.ts")).toContain("registerCatalogModuleRoutes(router, deps);");
    expect(read(root, "src/app.ts")).toContain("new CatalogModule(),");
  });

  it("microservice: --service targets that app; the default is the gateway", async () => {
    const root = await project("microservice", ["identity"]);
    await runGenerateCommand(context(root, { schematic: "resource", name: "users", service: "identity" }));
    expect(read(root, "apps/services/identity/src/routes/index.ts")).toContain("registerUsersRoutes");
    expect(existsSync(join(root, "apps/services/identity/tests/users.test.ts"))).toBe(true);
    await runGenerateCommand(context(root, { schematic: "resource", name: "sessions" }));
    expect(read(root, "apps/gateway/src/routes/index.ts")).toContain("registerSessionsRoutes");
    await expect(
      runGenerateCommand(context(root, { schematic: "resource", name: "x", service: "nope" })),
    ).rejects.toThrow(/No app at/);
  });

  it("writes Prisma-backed repositories and models once the app has Prisma", async () => {
    const root = await project("monolith");
    await writeFileTree(root, { "prisma/schema.prisma": "datasource db {\n  provider = \"postgresql\"\n}\n" });
    await runGenerateCommand(context(root, { schematic: "resource", name: "users" }));
    expect(read(root, "src/repositories/users.prisma.repository.ts")).toContain("prisma().user.findMany");
    expect(read(root, "src/container.ts")).toContain("new PrismaUsersRepository()");
    expect(read(root, "prisma/schema.prisma")).toContain("model User {");
    expect(read(root, "prisma/schema.prisma")).toContain('@@map("users")');
  });
});
