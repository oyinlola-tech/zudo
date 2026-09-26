/**
 * zudojs-cli — Round 12 regression tests (academy findings 7–19, 64, 135, 141).
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source. Runtime behaviour of the generated server (error logging,
 * pagination, /docs in production, RATE_LIMIT_MAX=0) is covered by
 * `cli.round12.server.test.ts`, which compiles and runs a project.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLI_EXIT_CODES } from "../src/cliConstant/cliConstant.value.js";
import { failureHints } from "../src/cliApplication/invocation/index.js";
import { runAddCommand } from "../src/commands/add.command.js";
import { runDevCommand } from "../src/commands/dev.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { runResourceSchematic } from "../src/generators/resource/index.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { databaseRecipe } from "../src/recipes/catalog/database/database.recipe.js";
import { detectArchitecture } from "../src/resolvers/architecture.resolver.js";
import { baseEnvVariables, renderConfigFile } from "../src/templates/backendApp/parts/config.template.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { renderAppFile } from "../src/templates/shared/appRuntime.template.js";
import { renderAppPackageDockerfile } from "../src/templates/shared/dockerfile/index.js";
import { openApiServerLines, renderServerFile } from "../src/templates/shared/server.template.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import { MARKERS, insertBetweenMarkers, markerEnd, markerStart } from "../src/wiring/index.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const execFileAsync = promisify(execFile);
const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

async function project(
  architecture: ScaffoldOptions["architecture"],
  services: string[] = [],
  manifest = true,
): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "zudojs-r12-"));
  dirs.push(root);
  const generate = architecture === "monolith" ? generateMonolithFiles
    : architecture === "modular-monolith" ? generateModularMonolithFiles : generateMicroserviceFiles;
  await writeFileTree(root, generate(options({ architecture, services })));
  if (manifest) {
    await new ManifestManager(root).create({
      version: "1.0.0", projectType: "backend", architecture,
      backend: { architecture, api: "rest" }, workspace: { packageManager: "pnpm" }, capabilities: [],
      ...(services.length > 0 ? { services } : {}),
    });
  }
  return root;
}

interface TestContext extends CLIContext {
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
}

function context(cwd: string, values: Record<string, unknown>): TestContext {
  const info = vi.fn();
  const warn = vi.fn();
  return {
    args: [], values: values as CLIContext["values"], cwd, env: {}, info, warn,
    logger: { debug: vi.fn(), info, warn, error: vi.fn(), trace: vi.fn(), fatal: vi.fn() } as unknown as CLIContext["logger"],
  };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf-8");

/** The `  - <file>` lines a generate run logged. */
function listedFiles(ctx: TestContext): string[] {
  return ctx.info.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.startsWith("  - "))
    .map((line) => line.slice(4))
    .sort();
}

describe("#7 unknown schematic", () => {
  it("names the schematic instead of saying one is required", async () => {
    const cwd = await project("monolith");
    const run = runGenerateCommand(context(cwd, { schematic: "widget", name: "orders" }));
    await expect(run).rejects.toThrow(/Unknown schematic "widget"/);
    await expect(run).rejects.not.toThrow(/Schematic name is required/);
  });
});

describe("#8 generate service --module in a modular monolith", () => {
  it("adds a service inside the module instead of creating a new module", async () => {
    const cwd = await project("modular-monolith", ["billing"]);
    const ctx = context(cwd, { schematic: "service", name: "refunds", module: "billing" });
    await runGenerateCommand(ctx);
    expect(existsSync(join(cwd, "src/modules/billing/services/refunds.service.ts"))).toBe(true);
    expect(existsSync(join(cwd, "src/modules/refunds"))).toBe(false);
    expect(ctx.info.mock.calls.flat().join("\n")).not.toContain('Mapping "service"');
  });
});

describe("#9 module resources keep their tests with the module", () => {
  it("writes tests/modules/<module>/<name>.test.ts with imports that resolve", async () => {
    const cwd = await project("modular-monolith", ["billing", "shipping"]);
    await runGenerateCommand(context(cwd, { schematic: "resource", name: "invoices", module: "billing" }));
    expect(existsSync(join(cwd, "tests/invoices.test.ts"))).toBe(false);
    const test = read(cwd, "tests/modules/billing/invoices.test.ts");
    expect(test).toContain('from "../../../src/modules/billing/controllers/invoices.controller.js"');

    // The composition root is app-wide, so a second "invoices" is refused for
    // the right reason (the container key), not because of a shared test file.
    await expect(
      runGenerateCommand(context(cwd, { schematic: "resource", name: "invoices", module: "shipping" })),
    ).rejects.toThrow(/already constructs "invoicesController"/);
  });
});

describe("#10 dry run lists every file a real run touches", () => {
  it("generate module --dry-run and the real run report the same files", async () => {
    const dry = context(await project("modular-monolith", ["identity"]), {
      schematic: "module", name: "billing", "dry-run": true,
    });
    await runGenerateCommand(dry);
    const real = context(await project("modular-monolith", ["identity"]), { schematic: "module", name: "billing" });
    await runGenerateCommand(real);
    expect(listedFiles(dry)).toEqual(listedFiles(real));
    expect(listedFiles(dry)).toContain("src/app.ts");
  });
});

describe("#11 missing route markers", () => {
  it("fails before writing anything and does not list routes/index.ts as generated", async () => {
    const cwd = await project("monolith");
    const routes = join(cwd, "src/routes/index.ts");
    const stripped = readFileSync(routes, "utf-8")
      .split("\n")
      .filter((line) => !line.includes(markerStart(MARKERS.routes)) && !line.includes(markerEnd(MARKERS.routes)))
      .join("\n");
    writeFileSync(routes, stripped);

    const ctx = context(cwd, { schematic: "resource", name: "users" });
    await expect(runGenerateCommand(ctx)).rejects.toThrow(/zudojs:routes:start/);
    expect(existsSync(join(cwd, "src/dtos/users.dto.ts"))).toBe(false);
    expect(existsSync(join(cwd, "src/controllers/users.controller.ts"))).toBe(false);
    expect(readFileSync(routes, "utf-8")).toBe(stripped);
    expect(read(cwd, "src/container.ts")).not.toContain("usersController");
    expect(listedFiles(ctx)).toEqual([]);
  });
});

describe("#12 generate validator", () => {
  it("writes a schema-backed validator, not a stub that returns true", async () => {
    const cwd = await project("monolith");
    await runGenerateCommand(context(cwd, { schematic: "validator", name: "payment" }));
    const source = read(cwd, "src/validators/payment.validator.ts");
    expect(source).not.toMatch(/return true;/);
    expect(source).toContain('from "@zudojs/schema"');
    expect(source).toContain("export const PaymentSchema = schema.object(");
    expect(source).toContain("export function validatePayment(input: unknown): SchemaResult<Payment>");
    expect(source).toContain("PaymentSchema.safeParse(input)");
  });
});

describe("#13 unexpected errors are logged and answered by the app", () => {
  it("server.ts logs the error and returns a 500 through the middleware pipeline", () => {
    const source = renderServerFile({ title: "t", openapi: false });
    expect(source).not.toContain("if (response === undefined) throw error;");
    expect(source).toContain("logger.error(");
    expect(source).toContain('json(500, { error: "Internal Server Error" })');
  });
});

describe("#14 NODE_ENV is read once", () => {
  it("loadConfig resolves it and createApp reuses the value", () => {
    const config = renderConfigFile({ defaultPort: 3000, sections: [] });
    expect(config).toContain('import { resolveEnvironment } from "@zudojs/constants";');
    expect(config).toContain('nodeEnv: resolveEnvironment({ NODE_ENV: text(config, "node_env", "development") })');
    const app = renderAppFile({ applicationName: "demo", modules: [] });
    expect(app).not.toContain("resolveEnvironment(");
    expect(app).toContain("environment: options.config.nodeEnv,");
  });
});

describe("#15 dev --frontend-only in a backend project", () => {
  it("fails instead of warning and exiting 0", async () => {
    const cwd = await project("monolith");
    await expect(runDevCommand(context(cwd, { "frontend-only": true }))).rejects.toThrow(/no frontend/i);
  });
});

describe("#16 architecture fallback without a manifest", () => {
  /** A project the CLI did not create: no manifest, no `zudojs` block. */
  async function unrecorded(architecture: ScaffoldOptions["architecture"], services: string[]): Promise<string> {
    const cwd = await project(architecture, services, false);
    const pkgPath = join(cwd, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    delete pkg.zudojs;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    return cwd;
  }

  it("does not call every monolith a modular monolith because it has src/modules", async () => {
    expect(existsSync(join(await unrecorded("monolith", []), "src/modules"))).toBe(true);
    expect(await detectArchitecture(await unrecorded("monolith", []))).toBe("monolith");
    expect(await detectArchitecture(await unrecorded("modular-monolith", ["billing"]))).toBe("modular-monolith");
  });
});

describe("#17 --language help and #135 zudojs migrate", () => {
  const tsx = join(CLI_DIR, "node_modules", ".bin", "tsx");
  const bin = join(CLI_DIR, "src", "bin", "zudojs.ts");

  it("says --language applies to the frontend only", async () => {
    const { stdout } = await execFileAsync(tsx, [bin, "create", "--help"], { cwd: CLI_DIR });
    expect(stdout).toMatch(/--language.*frontend/i);
    expect(stdout).toMatch(/backend.*TypeScript/i);
  }, 30_000);

  it("points `zudojs migrate` at the db:migrate script", async () => {
    const result = await execFileAsync(tsx, [bin, "migrate"], { cwd: CLI_DIR }).then(
      () => ({ code: 0, output: "" }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({
        code: error.code ?? -1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      }),
    );
    expect(result.code).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
    expect(result.output).toContain("db:migrate");
  }, 30_000);

  it("failureHints carries the migrate hint", () => {
    const hints = failureHints({
      name: "zudojs", exitCode: CLI_EXIT_CODES.COMMAND_NOT_FOUND, commands: [], unknownCommand: "migrate",
    });
    expect(hints.join("\n")).toContain("db:migrate");
    expect(hints.join("\n")).toContain("zudojs add database");
  });
});

describe("#18 one container", () => {
  it("registers the composition root in the runtime container", async () => {
    const cwd = await project("monolith");
    expect(read(cwd, "src/container.ts")).toContain("export const APP_DEPENDENCIES");
    const server = read(cwd, "src/server.ts");
    expect(server).toContain("runtime.context.container.registerValue(APP_DEPENDENCIES, dependencies)");
  });
});

describe("#64 @zudojs/middleware is a declared dependency", () => {
  it("every generated backend package.json lists it", async () => {
    for (const files of [
      generateMonolithFiles(options()),
      generateModularMonolithFiles(options({ architecture: "modular-monolith", services: ["a"] })),
      generateMicroserviceFiles(options({ architecture: "microservice", services: ["a"] })),
    ]) {
      const manifests = Object.entries(files).filter(([p]) => /(^|\/)package\.json$/.test(p) && files[p.replace(/package\.json$/, "src/server.ts")]);
      expect(manifests.length).toBeGreaterThan(0);
      for (const [path, content] of manifests) {
        const pkg = JSON.parse(content) as { dependencies: Record<string, string> };
        expect(Object.keys(pkg.dependencies), path).toContain("@zudojs/middleware");
      }
    }
  });
});

describe("#135 tests are type-checked, --force never duplicates wiring", () => {
  it("ships tsconfig.test.json and a typecheck script that covers tests", async () => {
    for (const files of [
      generateMonolithFiles(options()),
      generateModularMonolithFiles(options({ architecture: "modular-monolith", services: ["a"] })),
      generateMicroserviceFiles(options({ architecture: "microservice", services: ["a"] })),
    ]) {
      for (const [path, content] of Object.entries(files)) {
        if (!path.endsWith("tsconfig.json")) continue;
        const dir = path.replace(/tsconfig\.json$/, "");
        const test = files[`${dir}tsconfig.test.json`];
        expect(test, `${dir}tsconfig.test.json`).toBeDefined();
        expect(JSON.parse(test ?? "{}")).toMatchObject({ include: expect.arrayContaining(["tests/**/*"]) });
        expect(JSON.parse(content)).toMatchObject({ exclude: expect.arrayContaining(["**/*.test.ts"]) });
        const pkg = JSON.parse(files[`${dir}package.json`] ?? "{}") as { scripts: Record<string, string> };
        expect(pkg.scripts.typecheck, `${dir}package.json`).toContain("tsconfig.test.json");
      }
    }
  });

  it("insertBetweenMarkers treats a line moved out of the markers as present", () => {
    const source = [
      "const a = 1;",
      "registerUsersRoutes(router, deps.usersController);",
      markerStart(MARKERS.routes),
      markerEnd(MARKERS.routes),
      "",
    ].join("\n");
    const result = insertBetweenMarkers(source, MARKERS.routes, "registerUsersRoutes(router, deps.usersController);");
    expect(result.status).toBe("present");
    expect(result.source).toBe(source);
  });

  it("generate resource --force after moving the container entry does not duplicate it", async () => {
    const cwd = await project("monolith");
    await runGenerateCommand(context(cwd, { schematic: "resource", name: "users" }));
    const containerPath = join(cwd, "src/container.ts");
    const entry = "    usersController: new UsersController(new UsersService(new InMemoryUsersRepository())),\n";
    const moved = readFileSync(containerPath, "utf-8").replace(entry, "").replace("    health,\n", `    health,\n${entry}`);
    expect(moved).toContain("usersController:");
    writeFileSync(containerPath, moved);

    await runGenerateCommand(context(cwd, { schematic: "resource", name: "users", force: true }));
    expect(read(cwd, "src/container.ts").match(/usersController:/g)).toHaveLength(1);
  });
});

describe("#141 generated project defaults", () => {
  it("has no lint script that only repeats typecheck", async () => {
    for (const files of [
      generateMonolithFiles(options()),
      generateModularMonolithFiles(options({ architecture: "modular-monolith", services: ["a"] })),
      generateMicroserviceFiles(options({ architecture: "microservice", services: ["a"] })),
    ]) {
      for (const [path, content] of Object.entries(files)) {
        if (!path.endsWith("package.json")) continue;
        const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
        if (pkg.scripts?.lint === undefined) continue;
        expect(pkg.scripts.lint, path).not.toBe(pkg.scripts.typecheck);
        expect(pkg.scripts.lint, path).not.toBe("tsc --noEmit");
      }
    }
  });

  it("paginates list endpoints", async () => {
    const cwd = await project("monolith");
    await runGenerateCommand(context(cwd, { schematic: "resource", name: "users" }));
    expect(read(cwd, "src/dtos/users.dto.ts")).toContain("export const ListUsersQuerySchema");
    const repository = read(cwd, "src/repositories/users.repository.ts");
    expect(repository).not.toContain("findAll()");
    expect(repository).toContain("nextCursor");
    expect(read(cwd, "src/controllers/users.controller.ts")).toContain("ListUsersQuerySchema.safeParse(ctx.query)");
    expect(read(cwd, "src/routes/users.routes.ts")).toContain("query: ListUsersQuerySchema");
    expect(read(cwd, "tests/users.test.ts")).toContain("?limit=2");
  });

  it("raises the default rate limit and lets RATE_LIMIT_MAX=0 disable it", () => {
    const max = baseEnvVariables(3000).find((v) => v.name === "RATE_LIMIT_MAX");
    expect(max?.value).toBe("1000");
    expect(max?.comment).toMatch(/0 disables/);
    const server = renderServerFile({ title: "t", openapi: false });
    expect(server).toContain("config.rateLimit.max > 0");
  });

  it("does not serve /docs in production", () => {
    expect(openApiServerLines("t").mountLine).toContain('docsPath: config.nodeEnv === "production" ? false : "/docs"');
  });

  it("keeps the Prisma CLI, schema and config in the runtime image", () => {
    expect(databaseRecipe.dependencies).toHaveProperty("prisma");
    expect(databaseRecipe.devDependencies ?? {}).not.toHaveProperty("prisma");
    const dockerfile = renderAppPackageDockerfile({ appPath: ".", port: 3000, packageManager: "pnpm", prisma: true });
    const runtime = dockerfile.slice(dockerfile.indexOf("AS runtime"));
    expect(runtime).toContain("prisma.config.ts");
    expect(runtime).toContain("./prisma");
    expect(runtime).toContain("prisma migrate deploy");
    const plain = renderAppPackageDockerfile({ appPath: ".", port: 3000, packageManager: "pnpm" });
    expect(plain.slice(plain.indexOf("AS runtime"))).not.toContain("prisma");
  });

  it("add database raises the Prisma CLI's advisory-bearing transitive dependencies", async () => {
    const pnpmRoot = await project("monolith");
    const add = (cwd: string) => runAddCommand(context(cwd, { feature: "database", "skip-install": true }));
    await add(pnpmRoot);
    const yaml = read(pnpmRoot, "pnpm-workspace.yaml");
    expect(yaml).toMatch(/^overrides:\n(?:  .+\n)*  "mysql2": ">=3\.23\.1"/m);
    expect(yaml).toContain('"deepmerge-ts": ">=8.0.0"');
    expect(read(pnpmRoot, "package.json")).not.toContain('"overrides"');
    // A second run (or another recipe) adds nothing twice.
    await runAddCommand(context(pnpmRoot, { feature: "redis", "skip-install": true }));
    await add(pnpmRoot).catch(() => undefined);
    expect(read(pnpmRoot, "pnpm-workspace.yaml").match(/"mysql2":/g)).toHaveLength(1);

    const npmRoot = mkdtempSync(join(tmpdir(), "zudojs-r12-npm-"));
    dirs.push(npmRoot);
    await writeFileTree(npmRoot, generateMonolithFiles(options({ packageManager: "npm" })));
    await new ManifestManager(npmRoot).create({
      version: "1.0.0", projectType: "backend", architecture: "monolith",
      backend: { architecture: "monolith", api: "rest" }, workspace: { packageManager: "npm" }, capabilities: [],
    });
    await add(npmRoot);
    const pkg = JSON.parse(read(npmRoot, "package.json")) as { overrides?: Record<string, string> };
    expect(pkg.overrides).toEqual({ mysql2: ">=3.23.1", "deepmerge-ts": ">=8.0.0" });
    expect(existsSync(join(npmRoot, "pnpm-workspace.yaml"))).toBe(false);
  });

  it("runs prisma generate after generate resource adds a model", async () => {
    const cwd = await project("monolith");
    writeFileSync(join(cwd, "prisma.config.ts"), "");
    await writeFileTree(cwd, { "prisma/schema.prisma": "generator client {\n  provider = \"prisma-client\"\n}\n" });
    const exec = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    const ctx = context(cwd, {});
    await runResourceSchematic(ctx, {
      schematic: "resource", name: "users", cwd, backendRoot: "", architecture: "monolith",
      packageManager: "pnpm", dryRun: false, force: false, exec,
    });
    expect(exec).toHaveBeenCalledWith("pnpm", ["exec", "prisma", "generate"], cwd);
    expect(read(cwd, "prisma/schema.prisma")).toContain("model User {");

    const failing = vi.fn(async () => { throw new Error("prisma: command not found"); });
    const failed = context(cwd, {});
    await runResourceSchematic(failed, {
      schematic: "resource", name: "orders", cwd, backendRoot: "", architecture: "monolith",
      packageManager: "pnpm", dryRun: false, force: false, exec: failing,
    });
    expect(failed.warn.mock.calls.flat().join("\n")).toMatch(/prisma generate/);

    const dry = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    await runResourceSchematic(context(cwd, {}), {
      schematic: "resource", name: "carts", cwd, backendRoot: "", architecture: "monolith",
      packageManager: "pnpm", dryRun: true, force: false, exec: dry,
    });
    expect(dry).not.toHaveBeenCalled();
  });
});
