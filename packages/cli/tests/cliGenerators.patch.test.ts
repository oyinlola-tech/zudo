/**
 * zudojs-cli — Regression tests for the 2.1.2 patch, each reported against
 * the published 2.1.0:
 *
 * 1. `generate command|query` wrote code against `BaseCommand`/`BaseQuery`,
 *    which @zudojs/cqrs no longer exports (the compile check lives in
 *    generatedProject.typecheck.test.ts).
 * 2. `generate service` wrote `src/services/<name>/<name>.service.ts` while
 *    the resource schematics use `src/services/<name>.service.ts`.
 * 3. `add docker` ignored the lockfile and ran a floating install.
 * 4. OpenAPI summaries read "Get a example".
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runAddCommand } from "../src/commands/add.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { SCHEMA_CHOICES } from "../src/constants/index.js";
import { generateCommand } from "../src/generators/command/command.generator.js";
import { generateQuery } from "../src/generators/query/query.generator.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import {
  renderResourceDto,
  renderResourceRoutes,
  renderResourceTest,
  resourceNames,
  withArticle,
} from "../src/templates/resource/index.js";
import {
  renderAppPackageDockerfile,
  renderWorkspaceAppDockerfile,
} from "../src/templates/shared/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-patch-"));
  dirs.push(dir);
  return dir;
}

async function monolith(packageManager = "pnpm"): Promise<string> {
  const root = scratch();
  const options = {
    projectName: "shop", projectType: "backend", architecture: "monolith", packageManager,
    database: "postgresql", api: "rest", services: [], enableCQRS: true, enableMessaging: false,
    enableObservability: false, enableOpenAPI: true, enableDatabase: false, enableQueue: false,
    enableDocker: false, installDeps: false, initGit: false,
  } as ScaffoldOptions;
  await writeFileTree(root, generateMonolithFiles(options));
  await new ManifestManager(root).create({
    version: "1.0.0", projectType: "backend", architecture: "monolith",
    backend: { architecture: "monolith", api: "rest" }, workspace: { packageManager },
    capabilities: [],
  });
  return root;
}

function context(cwd: string, values: Record<string, unknown>): CLIContext & { info: ReturnType<typeof vi.fn> } {
  const info = vi.fn();
  return {
    args: [], values: values as CLIContext["values"], cwd, env: {}, info,
    logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() } as unknown as CLIContext["logger"],
  };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf-8");

describe("generate command / query use the current @zudojs/cqrs API", () => {
  it("writes a CommandOf type and a CommandHandler subclass with commandType and execute", async () => {
    const dir = scratch();
    await generateCommand({ name: "widget", basePath: "src" }, dir);
    const command = read(dir, "src/commands/widget/widget.command.ts");
    const handler = read(dir, "src/commands/widget/widget.handler.ts");

    expect(command).not.toContain("BaseCommand");
    expect(command).toContain("CommandOf<typeof WIDGET_COMMAND, WidgetCommandPayload>");
    expect(command).toContain("createCommand(WIDGET_COMMAND, payload)");
    expect(handler).toContain("extends CommandHandler<WidgetCommand, WidgetCommandResult>");
    expect(handler).toContain("readonly commandType = WIDGET_COMMAND;");
    expect(handler).toMatch(/async execute\(command: WidgetCommand\)/);
    expect(handler).toContain("bus.register(WIDGET_COMMAND, new WidgetCommandHandler())");
    expect(handler).not.toContain("success: true");
  });

  it("writes a QueryOf type and a QueryHandler subclass with queryType and execute", async () => {
    const dir = scratch();
    await generateQuery({ name: "widget", basePath: "src" }, dir);
    const query = read(dir, "src/queries/widget/widget.query.ts");
    const handler = read(dir, "src/queries/widget/widget.handler.ts");

    expect(query).not.toContain("BaseQuery");
    expect(query).toContain("QueryOf<typeof WIDGET_QUERY, WidgetQueryPayload>");
    expect(handler).toContain("extends QueryHandler<WidgetQuery, WidgetQueryResult>");
    expect(handler).toContain("readonly queryType = WIDGET_QUERY;");
    expect(handler).toMatch(/async execute\(query: WidgetQuery\)/);
    expect(handler).not.toContain("success: true");
  });

  it("uses a PascalCase discriminator and an UPPER_SNAKE constant for multi-word names", async () => {
    const dir = scratch();
    await generateCommand({ name: "create-user", basePath: "src" }, dir);
    const command = read(dir, "src/commands/create-user/create-user.command.ts");
    expect(command).toContain('export const CREATE_USER_COMMAND = "CreateUser";');
  });
});

describe("generate service uses the resource layout", () => {
  it("writes src/services/<name>.service.ts (with its DTO and repository), not a nested folder", async () => {
    const root = await monolith();
    await runGenerateCommand(context(root, { schematic: "service", name: "task" }));

    expect(existsSync(join(root, "src/services/task.service.ts"))).toBe(true);
    expect(existsSync(join(root, "src/dtos/task.dto.ts"))).toBe(true);
    expect(existsSync(join(root, "src/repositories/task.repository.ts"))).toBe(true);
    expect(existsSync(join(root, "src/services/task"))).toBe(false);
    // A service is not routed: nothing is registered in the container.
    expect(read(root, "src/container.ts")).not.toContain("TaskService");
  });

  it("generate controller after generate service reuses the service instead of rewriting it", async () => {
    const root = await monolith();
    await runGenerateCommand(context(root, { schematic: "service", name: "task" }));
    const service = `${read(root, "src/services/task.service.ts")}// user edit\n`;
    await writeFileTree(root, { "src/services/task.service.ts": service });

    const ctx = context(root, { schematic: "controller", name: "task" });
    await runGenerateCommand(ctx);

    expect(read(root, "src/services/task.service.ts")).toBe(service);
    expect(read(root, "src/controllers/task.controller.ts")).toContain(
      'import type { TaskService } from "../services/task.service.js";',
    );
    const written = ctx.info.mock.calls.map(([line]) => String(line));
    expect(written.some((line) => line.includes("task.service.ts"))).toBe(false);
    expect(written.some((line) => line.includes("task.controller.ts"))).toBe(true);
  });

  it("refuses to generate the same service twice without --force", async () => {
    const root = await monolith();
    await runGenerateCommand(context(root, { schematic: "service", name: "task" }));
    await expect(
      runGenerateCommand(context(root, { schematic: "service", name: "task" })),
    ).rejects.toThrow(/service "task" already exists[\s\S]*src\/services\/task\.service\.ts[\s\S]*--force/);
  });

  it("no longer advertises service as a CQRS schematic", () => {
    const service = SCHEMA_CHOICES.find((choice) => choice.value === "service");
    expect(service?.label).toBe("Service");
    expect(service?.hint).toContain("services/<name>.service.ts");
  });
});

describe("Dockerfiles install from the lockfile", () => {
  const render = (packageManager: string, appPath = "."): string =>
    renderAppPackageDockerfile({ appPath, port: 3000, packageManager });

  it("npm: copies package-lock.json and runs npm ci", () => {
    const dockerfile = render("npm");
    expect(dockerfile).toContain("COPY package.json package-lock.json* ./");
    expect(dockerfile).toContain("RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi");
    expect(dockerfile).toMatch(/# .*no lockfile/i);
  });

  it("pnpm: copies pnpm-lock.yaml and pnpm-workspace.yaml and installs frozen", () => {
    const dockerfile = render("pnpm");
    expect(dockerfile).toContain("COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./");
    expect(dockerfile).toContain(
      "RUN corepack enable && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi",
    );
  });

  it("yarn: --frozen-lockfile on yarn 1, --immutable on yarn 2+", () => {
    const dockerfile = render("yarn");
    expect(dockerfile).toContain("COPY package.json yarn.lock* .yarnrc.yml* ./");
    expect(dockerfile).toContain("yarn install --frozen-lockfile");
    expect(dockerfile).toContain("yarn install --immutable");
    expect(dockerfile).toContain("corepack enable");
  });

  it("bun: copies bun.lock and runs bun install --frozen-lockfile", () => {
    const dockerfile = render("bun");
    expect(dockerfile).toContain("COPY package.json bun.lock* ./");
    expect(dockerfile).toContain("bun install --frozen-lockfile");
    expect(dockerfile).not.toContain("npm prune");
  });

  it("a workspace app says why the workspace lockfile is not used", () => {
    const dockerfile = render("pnpm", "apps/services/identity");
    expect(dockerfile).toContain("COPY apps/services/identity/package.json ./");
    expect(dockerfile).not.toContain("--frozen-lockfile");
    expect(dockerfile).toMatch(/# .*workspace lockfile/i);
  });

  it("the whole-workspace Dockerfile installs from the lockfile it copies", () => {
    const dockerfile = renderWorkspaceAppDockerfile({ appDirectory: "apps/api", port: 3000, packageManager: "npm" });
    expect(dockerfile).toContain("COPY . .");
    expect(dockerfile).toContain("RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi");
  });

  it("add docker writes the frozen install for the project's package manager", async () => {
    const root = await monolith("npm");
    await runAddCommand(context(root, { feature: "docker", "skip-install": true }));
    const dockerfile = read(root, "Dockerfile");
    expect(dockerfile).toContain("COPY package.json package-lock.json* ./");
    expect(dockerfile).toContain("npm ci");
  });
});

describe("OpenAPI summaries use the right article", () => {
  it.each([
    ["example", "an example"],
    ["item", "an item"],
    ["order", "an order"],
    ["update", "an update"],
    ["hour", "an hour"],
    ["user", "a user"],
    ["unit", "a unit"],
    ["widget", "a widget"],
    ["euro", "a euro"],
    ["one-off", "a one-off"],
  ])("withArticle(%s) → %s", (noun, expected) => {
    expect(withArticle(noun)).toBe(expected);
  });

  it("capitalizes on request", () => {
    expect(withArticle("example", true)).toBe("An example");
  });

  it("renders 'Get an example' for the example resource and 'Get a user' for users", () => {
    const examples = renderResourceRoutes(resourceNames("examples"));
    expect(examples).toContain('summary: "Get an example"');
    expect(examples).toContain('summary: "Create an example"');
    expect(examples).toContain('summary: "Update an example"');
    expect(examples).toContain('summary: "Delete an example"');
    expect(examples).not.toContain("a example");
    expect(renderResourceRoutes(resourceNames("users"))).toContain('summary: "Get a user"');
    expect(renderResourceDto(resourceNames("examples"))).toContain("/** An example as the API returns it. */");
    expect(renderResourceTest(resourceNames("examples"), "../src")).toContain("deletes an example");
  });
});
