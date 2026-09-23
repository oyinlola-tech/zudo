/**
 * zudojs-cli — Audit round 10 regression tests: templates and create/add.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source. The HTTP server itself (CLI-01) is exercised end to end in
 * `cli.round10.server.test.ts`.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDatabaseAdapter } from "../src/adapters/databases/index.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import {
  FullstackComposer,
  layoutFullstackBackend,
} from "../src/generators/fullstack/index.js";
import { InfrastructureGenerator } from "../src/generators/infrastructure/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-r10-"));
  dirs.push(dir);
  return dir;
}
function options(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    projectName: "shop",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    services: [],
    installDeps: false,
    initGit: false,
    ...overrides,
  } as ScaffoldOptions;
}
function context(values: Record<string, unknown>, cwd = tmpdir()): CLIContext {
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

describe("tooling/CLI-01", () => {
  it("server.ts serves HTTP on PORT with a /health route", () => {
    const server = generateMonolithFiles(options())["src/server.ts"] ?? "";
    expect(server).toContain("createHttpServer(");
    expect(server).toContain("createNodeHttpAdapter(");
    // Routes are registered on a router, not hand-dispatched on the path.
    expect(server).not.toContain('request.path === "/health"');
    expect(server).toContain("const router = createRouter();");
    expect(server).toContain("registerRoutes(");
    expect(server).toContain("await server.start();");
    const files = generateMonolithFiles(options());
    expect(files["src/routes/health.routes.ts"]).toContain('"/health"');
    expect(files["src/routes/health.routes.ts"]).toContain("openapi: false");
  });
});

describe("tooling/CLI-02", () => {
  it("writes a fullstack microservice backend at the root, inside the workspace", async () => {
    const backend = generateMicroserviceFiles(
      options({ architecture: "microservice", services: ["a", "b"] }),
    );
    const layout = layoutFullstackBackend("microservice", backend);
    expect(layout.directory).toBe("");
    expect(Object.keys(layout.files)).toContain("apps/services/a/package.json");
    expect(Object.keys(layout.files)).not.toContain("package.json");

    const root = tempDir();
    await new FullstackComposer().generate({
      project: {
        name: "fs",
        type: "fullstack",
        backend: { architecture: "microservice", api: "rest" },
        workspace: { packageManager: "pnpm" },
      },
      projectPath: root,
    } as never);
    expect(readFileSync(join(root, "pnpm-workspace.yaml"), "utf-8")).toContain(
      '"apps/services/*"',
    );

    await new InfrastructureGenerator().generate(
      {
        projectName: "fs",
        architecture: "microservice",
        database: "postgresql",
        packageManager: "pnpm",
        services: ["a", "b"],
      },
      root,
    );
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf-8");
    expect(compose).toContain("dockerfile: apps/services/a/Dockerfile");
    expect(compose).not.toContain("context: apps/services/a");
    expect(
      readFileSync(join(root, "apps/services/a/Dockerfile"), "utf-8"),
    ).toContain("COPY apps/services/a/package.json");
  });
});

describe("tooling/CLI-04", () => {
  it("writes the requested database's URL and rejects mongodb", async () => {
    expect(
      generateMonolithFiles(options({ database: "mysql" }))[".env.example"],
    ).toContain("DATABASE_URL=mysql://localhost:3306/shop");
    expect(
      generateMonolithFiles(options({ database: "sqlite" }))[".env.example"],
    ).toContain("DATABASE_URL=sqlite:shop.db");
    expect(() => resolveDatabaseAdapter("mongodb")).toThrow(
      /Unsupported database/,
    );
    await expect(
      runCreateCommand(context({ "project-name": "x", database: "mongodb" })),
    ).rejects.toThrow(/Invalid database/);
  });
});
