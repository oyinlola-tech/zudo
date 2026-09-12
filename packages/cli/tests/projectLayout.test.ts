/**
 * zudojs-cli — Project layout and follow-up command tests
 *
 * Scaffolds real projects into a temporary directory with the same
 * templates `zudojs create` uses, then checks that the follow-up commands
 * (`dev`, `add`, `generate`, `doctor`, `build`) agree on where the apps
 * live. Each of them used to resolve the project on its own, and a freshly
 * created fullstack workspace failed `doctor`, received `zudojs add`
 * packages at its root, and had `zudojs generate` write into a `src/` no
 * app compiled.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ZUDOJS_PACKAGES_VERSION,
  FEATURE_PACKAGES,
} from "../src/constants/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { resolveProjectLayout } from "../src/resolvers/layout/projectLayout.core.js";
import { planDevServers } from "../src/commands/dev.command.js";
import { runDoctorChecks } from "../src/commands/doctor.command.js";
import {
  selectAddTargets,
  versionForNewDependency,
  runAddCommand,
} from "../src/commands/add.command.js";
import { getBuildArgs } from "../src/commands/build.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { getRunScriptCommand } from "../src/installers/dependency.installer.js";
import {
  resolveSpawnTarget,
  quoteForWindowsShell,
} from "../src/utils/utils.exec.js";
import {
  createCLILogger,
  formatCLILogLine,
} from "../src/cliApplication/cliApplication.logger.js";
import {
  checkForNewerVersion,
  isUpdateCheckDisabled,
} from "../src/cliVersion/cliVersion.update.js";
import { ConfigurationResolver } from "../src/resolvers/configuration/configurationResolver.core.js";
import type { ScaffoldOptions } from "../src/types/index.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-layout-"));
  created.push(dir);
  return dir;
}

function scaffoldOptions(
  overrides: Partial<ScaffoldOptions> = {},
): ScaffoldOptions {
  return {
    projectName: "my-app",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    api: "rest",
    services: [],
    enableCQRS: true,
    enableMessaging: true,
    enableObservability: false,
    enableOpenAPI: false,
    enableDatabase: true,
    enableQueue: false,
    enableDocker: false,
    installDeps: false,
    initGit: false,
    ...overrides,
  };
}

async function writeManifest(
  root: string,
  manifest: Partial<Parameters<ManifestManager["create"]>[0]> = {},
): Promise<void> {
  await new ManifestManager(root).create({
    version: "1.0.0",
    projectType: "backend",
    architecture: "monolith",
    workspace: { packageManager: "pnpm" },
    capabilities: [],
    ...manifest,
  });
}

async function scaffoldBackend(
  architecture: ScaffoldOptions["architecture"],
): Promise<string> {
  const root = tempDir();
  const options = scaffoldOptions({ architecture });
  const generate =
    architecture === "monolith"
      ? generateMonolithFiles
      : architecture === "modular-monolith"
        ? generateModularMonolithFiles
        : generateMicroserviceFiles;
  await writeFileTree(root, generate(options));
  await writeManifest(root, {
    architecture,
    backend: { architecture, api: "rest" },
    ...(architecture === "microservice"
      ? { services: ["identity", "enrollment", "assessment", "notification"] }
      : {}),
  });
  return root;
}

/** A fullstack workspace the way `zudojs create --type fullstack` lays it out. */
async function scaffoldFullstack(): Promise<string> {
  const root = tempDir();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "shop", private: true }, null, 2),
  );
  writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
  await writeFileTree(
    join(root, "apps/api"),
    generateMonolithFiles(scaffoldOptions()),
  );
  await writeFileTree(join(root, "apps/web"), {
    "package.json": JSON.stringify({ name: "web", scripts: { dev: "vite" } }),
    "tsconfig.json": "{}",
  });
  await writeManifest(root, {
    projectType: "fullstack",
    backend: { architecture: "monolith", api: "rest" },
    frontend: { framework: "react", architecture: "zudojs-standard" },
  });
  return root;
}

function context(cwd: string, values: CLIContext["values"] = {}): CLIContext {
  return {
    args: [],
    values,
    cwd,
    env: {},
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    } as unknown as CLIContext["logger"],
  };
}

/* -------------------------------------------------------------------------- */
/* Generated dependency versions                                              */
/* -------------------------------------------------------------------------- */

describe("generated @zudojs dependency versions", () => {
  it("is a caret range, not an exact pin", () => {
    // `@zudojs/openapi` has no 1.0.0 release while the other packages do;
    // an exact pin made `pnpm install` fail in every new project.
    expect(ZUDOJS_PACKAGES_VERSION).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it("is what every template stamps into package.json", () => {
    for (const generate of [
      generateMonolithFiles,
      generateModularMonolithFiles,
      generateMicroserviceFiles,
    ]) {
      const files = generate(scaffoldOptions());
      for (const [path, content] of Object.entries(files)) {
        if (!path.endsWith("package.json")) continue;
        const pkg = JSON.parse(content) as {
          dependencies?: Record<string, string>;
        };
        for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
          if (name.startsWith("@zudojs/")) {
            expect(version, `${path} → ${name}`).toBe(ZUDOJS_PACKAGES_VERSION);
          }
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* No zudojs.config.ts                                                        */
/* -------------------------------------------------------------------------- */

describe("templates", () => {
  it("do not write a zudojs.config.ts", () => {
    for (const generate of [
      generateMonolithFiles,
      generateModularMonolithFiles,
      generateMicroserviceFiles,
    ]) {
      const files = generate(scaffoldOptions({ architecture: "microservice" }));
      expect(Object.keys(files)).not.toContain("zudojs.config.ts");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Layout resolution                                                          */
/* -------------------------------------------------------------------------- */

describe("resolveProjectLayout", () => {
  it("returns null outside a project", () => {
    expect(resolveProjectLayout(tempDir())).toBeNull();
  });

  it("resolves a monolith from its manifest", async () => {
    const root = await scaffoldBackend("monolith");
    const layout = resolveProjectLayout(root);
    expect(layout).toMatchObject({
      projectType: "backend",
      architecture: "monolith",
      packageManager: "pnpm",
      source: "manifest",
      backendDirs: [root],
      isWorkspace: false,
    });
    expect(layout?.frontendDir).toBeUndefined();
  });

  it("resolves the gateway and every service of a microservice project", async () => {
    const root = await scaffoldBackend("microservice");
    const layout = resolveProjectLayout(root);
    expect(layout?.isWorkspace).toBe(true);
    expect(layout?.services).toEqual([
      "identity",
      "enrollment",
      "assessment",
      "notification",
    ]);
    expect(layout?.backendDirs).toEqual([
      join(root, "apps", "gateway"),
      join(root, "apps", "services", "identity"),
      join(root, "apps", "services", "enrollment"),
      join(root, "apps", "services", "assessment"),
      join(root, "apps", "services", "notification"),
    ]);
  });

  it("points a fullstack workspace at apps/api and apps/web", async () => {
    const root = await scaffoldFullstack();
    const layout = resolveProjectLayout(root);
    expect(layout?.projectType).toBe("fullstack");
    expect(layout?.backendDirs).toEqual([join(root, "apps", "api")]);
    expect(layout?.frontendDir).toBe(join(root, "apps", "web"));
    expect(layout?.frontendFramework).toBe("react");
  });

  it("uses the project root as the frontend dir of a frontend-only project", async () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "web" }));
    await writeManifest(root, {
      projectType: "frontend",
      frontend: { framework: "vue", architecture: "minimal" },
      workspace: { packageManager: "npm" },
    });
    const layout = resolveProjectLayout(root);
    expect(layout?.backendDirs).toEqual([]);
    expect(layout?.frontendDir).toBe(root);
    expect(layout?.frontendFramework).toBe("vue");
    expect(layout?.packageManager).toBe("npm");
  });

  it("still reads a legacy zudojs.config.ts", () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "old" }));
    writeFileSync(
      join(root, "zudojs.config.ts"),
      'export default {\n  name: "old",\n  projectType: "backend",\n  architecture: "modular-monolith",\n};\n',
    );
    expect(resolveProjectLayout(root)).toMatchObject({
      architecture: "modular-monolith",
      source: "config",
    });
  });

  it("ignores service names that are not safe path segments", async () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), "{}");
    await writeManifest(root, {
      architecture: "microservice",
      services: ["../../etc", "identity"],
    });
    expect(resolveProjectLayout(root)?.services).toEqual(["identity"]);
  });
});

describe("ConfigurationResolver", () => {
  it("resolves a manifest-only project", async () => {
    const root = await scaffoldBackend("monolith");
    await new ManifestManager(root).addCapability("database");
    const resolved = new ConfigurationResolver().resolve(root);
    expect(resolved).toMatchObject({
      projectName: "my-app",
      projectType: "backend",
      architecture: "monolith",
      packageManager: "pnpm",
      api: "rest",
      features: ["database"],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* dev                                                                        */
/* -------------------------------------------------------------------------- */

describe("planDevServers", () => {
  it("runs the project's dev script through its package manager", async () => {
    const root = await scaffoldBackend("monolith");
    const servers = planDevServers(resolveProjectLayout(root)!, { port: 4000 });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      cwd: root,
      file: "pnpm",
      args: ["run", "dev"],
    });
    expect(servers[0]?.env?.PORT).toBe("4000");
    // Never a bare `tsx`: it is a devDependency, not on PATH.
    expect(servers[0]?.file).not.toBe("tsx");
  });

  it("starts every microservice app", async () => {
    const root = await scaffoldBackend("microservice");
    const servers = planDevServers(resolveProjectLayout(root)!);
    expect(servers.map((s) => s.label)).toEqual([
      "gateway",
      "identity",
      "enrollment",
      "assessment",
      "notification",
    ]);
  });

  it("starts the backend and frontend of a fullstack workspace", async () => {
    const root = await scaffoldFullstack();
    const servers = planDevServers(resolveProjectLayout(root)!);
    expect(servers.map((s) => [s.label, s.cwd])).toEqual([
      ["api", join(root, "apps", "api")],
      ["web", join(root, "apps", "web")],
    ]);
    expect(
      planDevServers(resolveProjectLayout(root)!, { backendOnly: true }).map(
        (s) => s.label,
      ),
    ).toEqual(["api"]);
    expect(
      planDevServers(resolveProjectLayout(root)!, { frontendOnly: true }).map(
        (s) => s.label,
      ),
    ).toEqual(["web"]);
  });

  it("uses the start script for Angular", async () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ng" }));
    await writeManifest(root, {
      projectType: "frontend",
      frontend: { framework: "angular", architecture: "framework-default" },
      workspace: { packageManager: "npm" },
    });
    const [server] = planDevServers(resolveProjectLayout(root)!);
    expect(server).toMatchObject({ file: "npm", args: ["run", "start"] });
  });
});

describe("getRunScriptCommand", () => {
  it("maps every package manager to its run form", () => {
    expect(getRunScriptCommand("pnpm", "dev")).toEqual(["pnpm", "run", "dev"]);
    expect(getRunScriptCommand("npm", "dev")).toEqual(["npm", "run", "dev"]);
    expect(getRunScriptCommand("yarn", "dev")).toEqual(["yarn", "run", "dev"]);
    expect(getRunScriptCommand("bun", "dev")).toEqual(["bun", "run", "dev"]);
  });
});

/* -------------------------------------------------------------------------- */
/* doctor                                                                     */
/* -------------------------------------------------------------------------- */

describe("runDoctorChecks", () => {
  it("has no failing error-level check on a fresh monolith", async () => {
    const root = await scaffoldBackend("monolith");
    const errors = runDoctorChecks(root).filter(
      (check) => !check.passed && check.severity === "error",
    );
    expect(errors).toEqual([]);
  });

  it("does not flag the src/modules directory every template creates", async () => {
    const root = await scaffoldBackend("monolith");
    const messages = runDoctorChecks(root)
      .map((c) => c.message)
      .join("\n");
    expect(messages).not.toMatch(/src\/modules/);
  });

  it("accepts a fullstack workspace whose tsconfig lives in the apps", async () => {
    const root = await scaffoldFullstack();
    const checks = runDoctorChecks(root);
    const ts = checks.find((c) => c.name === "TypeScript configuration");
    expect(ts?.passed).toBe(true);
    const deps = checks.find((c) => c.name === "Zudojs dependencies");
    expect(deps?.passed).toBe(true);
  });

  it("reports a feature whose package is missing, using the add mapping", async () => {
    const root = await scaffoldBackend("monolith");
    const pkgPath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      zudojs: { features: string[] };
    };
    pkg.zudojs.features = ["scheduler"];
    writeFileSync(pkgPath, JSON.stringify(pkg));
    const features = runDoctorChecks(root).find((c) => c.name === "Features");
    expect(features?.passed).toBe(false);
    expect(features?.message).toContain("@zudojs/scheduler");
  });

  it("fails with an error outside a project", () => {
    const project = runDoctorChecks(tempDir()).find(
      (c) => c.name === "Zudojs project",
    );
    expect(project).toMatchObject({ passed: false, severity: "error" });
  });
});

/* -------------------------------------------------------------------------- */
/* add                                                                        */
/* -------------------------------------------------------------------------- */

describe("zudojs add", () => {
  it("maps scheduler to @zudojs/scheduler", () => {
    expect(FEATURE_PACKAGES.scheduler).toEqual(["@zudojs/scheduler"]);
  });

  it("never writes workspace:* into a user project", () => {
    expect(
      versionForNewDependency({ dependencies: { "@zudojs/core": "^1.0.0" } }),
    ).toBe(ZUDOJS_PACKAGES_VERSION);
    expect(versionForNewDependency({})).toBe(ZUDOJS_PACKAGES_VERSION);
    // Inside the framework monorepo the siblings are linked.
    expect(
      versionForNewDependency({
        dependencies: { "@zudojs/core": "workspace:*" },
      }),
    ).toBe("workspace:*");
  });

  it("targets apps/api in a fullstack workspace", async () => {
    const root = await scaffoldFullstack();
    expect(selectAddTargets(resolveProjectLayout(root)!, undefined)).toEqual([
      join(root, "apps", "api", "package.json"),
    ]);
  });

  it("targets one app of a microservice project with --service", async () => {
    const root = await scaffoldBackend("microservice");
    const layout = resolveProjectLayout(root)!;
    expect(selectAddTargets(layout, "identity")).toEqual([
      join(root, "apps", "services", "identity", "package.json"),
    ]);
    expect(selectAddTargets(layout, "gateway")).toEqual([
      join(root, "apps", "gateway", "package.json"),
    ]);
    expect(() => selectAddTargets(layout, "billing")).toThrow(
      /Unknown service/,
    );
    expect(selectAddTargets(layout, undefined)).toHaveLength(5);
  });

  it("updates the backend package.json and the manifest", async () => {
    const root = await scaffoldFullstack();
    await runAddCommand(
      context(root, { feature: "cache", "skip-install": true }),
    );

    const api = JSON.parse(
      readFileSync(join(root, "apps", "api", "package.json"), "utf-8"),
    ) as {
      dependencies: Record<string, string>;
      zudojs: { features: string[] };
    };
    expect(api.dependencies["@zudojs/cache"]).toBe(ZUDOJS_PACKAGES_VERSION);
    expect(api.zudojs.features).toContain("cache");

    const rootPkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf-8"),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(rootPkg.dependencies).toBeUndefined();

    const manifest = await new ManifestManager(root).read();
    expect(manifest?.capabilities).toContain("cache");
  });

  it("rejects unknown features and frontend-only projects", async () => {
    const root = await scaffoldBackend("monolith");
    await expect(
      runAddCommand(
        context(root, { feature: "blockchain", "skip-install": true }),
      ),
    ).rejects.toThrow(/Unknown feature/);

    const web = tempDir();
    writeFileSync(join(web, "package.json"), "{}");
    await writeManifest(web, {
      projectType: "frontend",
      frontend: { framework: "react", architecture: "minimal" },
    });
    await expect(
      runAddCommand(context(web, { feature: "cache", "skip-install": true })),
    ).rejects.toThrow(/frontend-only/);
  });
});

/* -------------------------------------------------------------------------- */
/* generate                                                                   */
/* -------------------------------------------------------------------------- */

describe("zudojs generate", () => {
  it("generates into apps/api of a fullstack workspace", async () => {
    const root = await scaffoldFullstack();
    const ctx = context(root, {
      schematic: "controller",
      name: "orders",
      "dry-run": true,
    });
    await runGenerateCommand(ctx);
    const logged = (ctx.logger.info as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toMatch(/apps\/api\/src\//);
    expect(logged).not.toMatch(/^\s*- src\//m);
  });

  it("generates into src/ of a backend project", async () => {
    const root = await scaffoldBackend("monolith");
    const ctx = context(root, {
      schematic: "controller",
      name: "orders",
      "dry-run": true,
    });
    await runGenerateCommand(ctx);
    const logged = (ctx.logger.info as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toMatch(/- src\//);
    expect(logged).not.toMatch(/apps\/api/);
  });
});

/* -------------------------------------------------------------------------- */
/* build                                                                      */
/* -------------------------------------------------------------------------- */

describe("getBuildArgs", () => {
  it("only recurses with pnpm inside a workspace", () => {
    expect(getBuildArgs("pnpm", true)).toEqual(["-r", "run", "build"]);
    expect(getBuildArgs("pnpm", false)).toEqual(["run", "build"]);
    expect(getBuildArgs("npm", true)).toEqual(["run", "build"]);
  });
});

/* -------------------------------------------------------------------------- */
/* process spawning                                                           */
/* -------------------------------------------------------------------------- */

describe("resolveSpawnTarget", () => {
  it("spawns package managers through a shell on Windows", () => {
    const target = resolveSpawnTarget("pnpm", ["install"], "win32");
    expect(target).toEqual({ file: "pnpm", args: ["install"], shell: true });
  });

  it("quotes arguments that cmd.exe would split", () => {
    const target = resolveSpawnTarget("npm", ["run", "dev", "my app"], "win32");
    expect(target.args).toEqual(["run", "dev", '"my app"']);
    expect(quoteForWindowsShell("")).toBe('""');
    expect(quoteForWindowsShell("a&b")).toBe('"a&b"');
  });

  it("does not use a shell elsewhere", () => {
    expect(resolveSpawnTarget("pnpm", ["install"], "linux").shell).toBe(false);
    expect(resolveSpawnTarget("git", ["init"], "win32").shell).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* logger                                                                     */
/* -------------------------------------------------------------------------- */

describe("createCLILogger", () => {
  it("writes one plain line per call", () => {
    const out: string[] = [];
    const err: string[] = [];
    const logger = createCLILogger({
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      verbose: false,
    });

    logger.info("Files created: 34");
    logger.warn("No lock file");
    logger.error("boom");
    logger.debug("hidden");

    expect(out).toEqual(["Files created: 34"]);
    expect(err).toEqual(["Warning: No lock file", "Error: boom"]);
    // Nothing that looks like a serialised record.
    expect([...out, ...err].join("\n")).not.toMatch(/timestamp|metadata/);
  });

  it("emits debug lines when verbose", () => {
    const out: string[] = [];
    const logger = createCLILogger({
      stdout: (line) => out.push(line),
      stderr: () => {},
      verbose: true,
    });
    logger.debug("details");
    expect(out).toEqual(["[debug] details"]);
  });

  it("formats levels consistently", () => {
    const entry = (levelName: string, message: string) =>
      ({ levelName, message }) as Parameters<typeof formatCLILogLine>[0];
    expect(formatCLILogLine(entry("info", "x"))).toBe("x");
    expect(formatCLILogLine(entry("fatal", "x"))).toBe("Error: x");
  });
});

/* -------------------------------------------------------------------------- */
/* update check                                                               */
/* -------------------------------------------------------------------------- */

describe("checkForNewerVersion", () => {
  const fetchLatest = (version: string): typeof fetch =>
    (async () =>
      new Response(JSON.stringify({ version }), {
        status: 200,
      })) as typeof fetch;

  it("reports a newer version", async () => {
    const result = await checkForNewerVersion("1.0.0", {
      env: {},
      fetchImpl: fetchLatest("1.2.0"),
    });
    expect(result.latest).toBe("1.2.0");
  });

  it("reports nothing when current is the latest", async () => {
    const result = await checkForNewerVersion("1.2.0", {
      env: {},
      fetchImpl: fetchLatest("1.2.0"),
    });
    expect(result.latest).toBeNull();
  });

  it("is disabled by ZUDOJS_NO_UPDATE_CHECK and CI", async () => {
    expect(isUpdateCheckDisabled({ ZUDOJS_NO_UPDATE_CHECK: "1" })).toBe(true);
    expect(isUpdateCheckDisabled({ CI: "true" })).toBe(true);
    expect(isUpdateCheckDisabled({})).toBe(false);
    const result = await checkForNewerVersion("1.0.0", {
      env: { CI: "1" },
      fetchImpl: fetchLatest("9.0.0"),
    });
    expect(result).toMatchObject({ latest: null, skipped: "disabled" });
  });

  it("swallows network failures", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const result = await checkForNewerVersion("1.0.0", {
      env: {},
      fetchImpl: failing,
    });
    expect(result).toMatchObject({ latest: null, skipped: "offline" });
  });
});

/* -------------------------------------------------------------------------- */
/* pnpm build-script allow-list                                               */
/* -------------------------------------------------------------------------- */

describe("pnpm-workspace.yaml in generated projects", () => {
  it("allows esbuild's install script in both pnpm 10 and pnpm 11 forms", () => {
    for (const generate of [
      generateMonolithFiles,
      generateModularMonolithFiles,
      generateMicroserviceFiles,
    ]) {
      const files = generate(scaffoldOptions({ packageManager: "pnpm" }));
      const yaml = files["pnpm-workspace.yaml"];
      expect(yaml, generate.name).toBeDefined();
      expect(yaml).toMatch(
        /onlyBuiltDependencies:\n(?:  - .+\n)*  - "esbuild"/,
      );
      // Scoped names must be quoted or the file is not valid YAML.
      expect(yaml).toContain('  - "@swc/core"');
      expect(yaml).not.toMatch(/^\s+- @/m);
      expect(yaml).toMatch(/allowBuilds:\n(?:  .+\n)*  "esbuild": true/);
    }
  });

  it("keeps the microservice workspace globs", () => {
    const files = generateMicroserviceFiles(
      scaffoldOptions({ architecture: "microservice", packageManager: "pnpm" }),
    );
    expect(files["pnpm-workspace.yaml"]).toMatch(
      /packages:\n  - "apps\/gateway"\n  - "apps\/services\/\*"/,
    );
  });

  it("is not written for other package managers", () => {
    const files = generateMonolithFiles(
      scaffoldOptions({ packageManager: "npm" }),
    );
    expect(files["pnpm-workspace.yaml"]).toBeUndefined();
  });

  it("does not turn a single-package project into a workspace", async () => {
    const root = await scaffoldBackend("monolith");
    expect(resolveProjectLayout(root)?.isWorkspace).toBe(false);
    expect(
      getBuildArgs("pnpm", resolveProjectLayout(root)!.isWorkspace),
    ).toEqual(["run", "build"]);
  });
});
