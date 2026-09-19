/**
 * zudojs-cli — Audit round 10 regression tests: Dockerfile, dependencies,
 * add and create.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as frontendAdapters from "../src/adapters/frontend/index.js";
import { runAddCommand } from "../src/commands/add.command.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runFrontendPipeline } from "../src/generators/frontend/frontendPipeline.js";
import { InfrastructureGenerator } from "../src/generators/infrastructure/index.js";
import { DependencyResolver } from "../src/resolvers/dependency/index.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

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

describe("tooling/CLI-05", () => {
  it("builds and starts apps/api in the fullstack root Dockerfile", async () => {
    const root = tempDir();
    await new InfrastructureGenerator().generate(
      {
        projectName: "fs",
        architecture: "monolith",
        database: "postgresql",
        packageManager: "pnpm",
        appDirectory: "apps/api",
      },
      root,
    );
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf-8");
    expect(dockerfile).not.toContain("/app/dist ./dist");
    expect(dockerfile).toContain("RUN cd apps/api && pnpm run build");
    expect(dockerfile).toContain('CMD ["node", "apps/api/dist/server.js"]');
  });
});

describe("tooling/CLI-07", () => {
  it("fails instead of replacing an unparsable package.json", async () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), "{ // jsonc\n}");
    const adapter = {
      name: "fake",
      isAvailable: async () => true,
      scaffold: async () => {},
      applyZudojsStructure: async () => {},
      generateIntegration: async () => {},
      getDependencies: () => [{ name: "react", type: "dependency" }],
      validate: async () => ({ valid: true, errors: [] }),
    };
    await expect(
      runFrontendPipeline(
        adapter as never,
        { projectPath: root, skipInstall: true } as never,
        { get: () => undefined } as never,
        new DependencyResolver(),
      ),
    ).rejects.toThrow(/Could not parse/);
    expect(readFileSync(join(root, "package.json"), "utf-8")).toBe(
      "{ // jsonc\n}",
    );
  });

  it("pins every dependency a built-in adapter requests", () => {
    const resolver = new DependencyResolver();
    for (const Adapter of Object.values(frontendAdapters)) {
      if (typeof Adapter !== "function") continue;
      const adapter = new (
        Adapter as unknown as new () => {
          getDependencies?: (c: unknown) => never[];
        }
      )();
      const deps =
        adapter.getDependencies?.({
          features: {
            testing: true,
            linting: true,
            formatting: true,
            stateManagement: "zustand",
          },
        }) ?? [];
      const resolved = resolver.resolve(deps);
      expect(resolved.warnings).toEqual([]);
      for (const dep of [...resolved.dependencies, ...resolved.devDependencies])
        expect(dep.version).not.toBe("latest");
    }
  });
});

describe("tooling/CLI-08", () => {
  it("rejects inherited object keys as unknown features", async () => {
    for (const feature of ["constructor", "__proto__", "toString"]) {
      await expect(runAddCommand(context({ feature }))).rejects.toThrow(
        /Unknown feature/,
      );
    }
  });
});

describe("tooling/CLI-09", () => {
  it("rejects --language javascript for a backend project", async () => {
    await expect(
      runCreateCommand(
        context({
          "project-name": "x",
          type: "backend",
          language: "javascript",
          "no-install": true,
          "no-git": true,
        }),
      ),
    ).rejects.toThrow(/TypeScript only/);
  });
});
