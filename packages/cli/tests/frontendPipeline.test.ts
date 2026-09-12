/**
 * zudojs-cli — Frontend pipeline tests
 *
 * `zudojs create --no-install` was ignored for frontend and fullstack
 * projects: the pipeline always ran the package manager. With the flag the
 * resolved dependencies now go into package.json instead.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runFrontendPipeline } from "../src/generators/frontend/frontendPipeline.js";
import { DependencyResolver } from "../src/resolvers/dependency/dependencyResolver.core.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
} from "../src/adapters/frontend/frontendAdapter.type.js";
import type { PackageManagerRegistry } from "../src/registries/adapter/packageManagerRegistry.core.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fakeAdapter(): FrontendAdapter {
  return {
    name: "fake",
    framework: "react",
    isAvailable: async () => true,
    getLatestVersion: async () => "1.0.0",
    scaffold: async () => {},
    getDependencies: () => [
      { name: "react", type: "dependency", version: "^19.0.0" },
      { name: "vitest", type: "devDependency" },
    ],
    applyZudojsStructure: async () => {},
    generateIntegration: async () => {},
    validate: async () => ({ valid: true, errors: [], warnings: [] }),
  };
}

function fakeRegistry(
  add: ReturnType<typeof vi.fn>,
  addDev: ReturnType<typeof vi.fn>,
) {
  return {
    get: () => ({ add, addDev }),
  } as unknown as PackageManagerRegistry;
}

function context(
  projectPath: string,
  skipInstall: boolean,
): FrontendGenerationContext {
  return {
    project: { name: "web", type: "frontend" },
    projectPath,
    framework: "react",
    language: "typescript",
    architecture: "minimal",
    packageManager: "pnpm",
    features: {},
    ...(skipInstall ? { skipInstall: true } : {}),
  };
}

describe("runFrontendPipeline", () => {
  it("installs through the package manager by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-fe-"));
    dirs.push(dir);
    const add = vi.fn(async () => {});
    const addDev = vi.fn(async () => {});

    const result = await runFrontendPipeline(
      fakeAdapter(),
      context(dir, false),
      fakeRegistry(add, addDev),
      new DependencyResolver(),
    );

    expect(result.errors).toEqual([]);
    expect(add).toHaveBeenCalledWith(dir, ["react"]);
    expect(addDev).toHaveBeenCalledWith(dir, ["vitest"]);
  });

  it("records dependencies in package.json with --no-install", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-fe-"));
    dirs.push(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "web", dependencies: { react: "^18.0.0" } }),
    );
    const add = vi.fn(async () => {});
    const addDev = vi.fn(async () => {});

    const result = await runFrontendPipeline(
      fakeAdapter(),
      context(dir, true),
      fakeRegistry(add, addDev),
      new DependencyResolver(),
    );

    expect(result.errors).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(addDev).not.toHaveBeenCalled();

    const pkg = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf-8"),
    ) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("web");
    // An existing pin wins over the adapter's requirement.
    expect(pkg.dependencies.react).toBe("^18.0.0");
    expect(pkg.devDependencies.vitest).toBeTruthy();
  });
});
