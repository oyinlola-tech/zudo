/**
 * zudojs-cli — State / command regression tests (audit slice "state").
 *
 * One `describe` per finding. Every assertion is on observable behaviour:
 * what is on disk after the command, the value a function returns, the
 * error a command rejects with, or a recorded spy.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { findProjectRoot } from "../src/resolvers/project.resolver.js";
import { runBuildCommand } from "../src/commands/build.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runAddCommand } from "../src/commands/add.command.js";
import { runEnvironmentChecks } from "../src/commands/doctor.command.js";
import { RollbackManager } from "../src/rollback/rollbackManager.core.js";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";
import { CapabilityResolver } from "../src/resolvers/capability/capabilityResolver.core.js";
import { EnvironmentValidator } from "../src/validators/environment/environmentValidator.core.js";
import { ProjectValidator } from "../src/validators/project/projectValidator.core.js";
import { DependencyRegistry } from "../src/registries/dependency/dependencyRegistry.core.js";
import { GeneratorRegistry } from "../src/registries/generator/generatorRegistry.core.js";
import { FrontendAdapterRegistry } from "../src/registries/adapter/frontendAdapterRegistry.core.js";
import { PackageManagerRegistry } from "../src/registries/adapter/packageManagerRegistry.core.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

/* -------------------------------------------------------------------------- */
/* Test doubles                                                               */
/* -------------------------------------------------------------------------- */

/** Binaries whose spawn fails, so an install can be made to fail on demand. */
const execState = vi.hoisted(() => ({ failing: new Set<string>() }));

vi.mock("../src/utils/utils.exec.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/utils/utils.exec.js")>();

  return {
    ...actual,
    execCommand: async (...args: Parameters<typeof actual.execCommand>) => {
      if (execState.failing.has(args[0])) {
        throw new Error(`spawn ${args[0]} ENOENT`);
      }
      return actual.execCommand(...args);
    },
    runStreaming: async (...args: Parameters<typeof actual.runStreaming>) => {
      if (execState.failing.has(args[0])) {
        throw new Error(`spawn ${args[0]} ENOENT`);
      }
      return actual.runStreaming(...args);
    },
  };
});

/** Records the SIGINT handler `create` registers. */
const interruptState = vi.hoisted(() => ({
  handler: null as null | (() => void | Promise<void>),
  registered: 0,
  unregistered: 0,
}));

vi.mock("../src/cliApplication/cliApplication.writer.js", async (original) => {
  const actual =
    await original<
      typeof import("../src/cliApplication/cliApplication.writer.js")
    >();

  return {
    ...actual,
    registerCLIInterruptHandler: (onInterrupt: () => void | Promise<void>) => {
      interruptState.handler = onInterrupt;
      interruptState.registered += 1;
      return () => {
        interruptState.unregistered += 1;
      };
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs.splice(0)) {
    try {
      chmodSync(dir, 0o755);
    } catch {
      // already writable
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix = "zudojs-state-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function context(
  cwd: string,
  values: Record<string, unknown>,
  args: string[] = [],
): CLIContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };

  return {
    args,
    values: values as CLIContext["values"],
    cwd,
    env: {},
    logger: logger as unknown as CLIContext["logger"],
  };
}

async function monolithProject(): Promise<string> {
  const dir = tempDir("zudojs-state-proj-");
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

const isRoot = process.getuid?.() === 0;

function resetInterruptState(): void {
  interruptState.handler = null;
  interruptState.registered = 0;
  interruptState.unregistered = 0;
}

/* -------------------------------------------------------------------------- */
/* CLI-STATE-01                                                               */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-01", () => {
  it("does not treat a bare package.json as a Zudojs project", async () => {
    const root = tempDir("zudojs-bare-");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "unrelated", scripts: { build: "exit 1" } }),
    );
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });

    expect(findProjectRoot(nested)).toBeNull();
  });

  it("still finds a project described by a zudojs block", async () => {
    const root = await monolithProject();
    const nested = join(root, "src", "modules");

    expect(findProjectRoot(nested)).toBe(root);
  });

  it("refuses to run an unrelated ancestor's build script", async () => {
    const root = tempDir("zudojs-bare-build-");
    const sentinel = join(root, "ran-build");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "unrelated",
        scripts: { build: `node -e "require('fs').writeFileSync('${sentinel}','')"` },
      }),
    );
    const nested = join(root, "deep");
    mkdirSync(nested);

    await expect(runBuildCommand(context(nested, {}))).rejects.toThrow(
      /must be run inside a Zudojs project/i,
    );
    expect(existsSync(sentinel)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-02 / CLI-EXEC-05                                                 */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-02", () => {
  it("registers an interrupt handler that rolls the project back", async () => {
    const cwd = tempDir("zudojs-sigint-");
    resetInterruptState();

    await runCreateCommand(
      context(
        cwd,
        {
          "project-name": "demo",
          "no-install": true,
          "no-git": true,
        },
        [],
      ),
    );

    const projectPath = join(cwd, "demo");
    expect(interruptState.registered).toBe(1);
    expect(interruptState.unregistered).toBe(1);
    expect(existsSync(projectPath)).toBe(true);

    // The handler SIGINT would have run removes what was created.
    await interruptState.handler?.();
    expect(existsSync(projectPath)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-03                                                               */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-03", () => {
  it.skipIf(isRoot)(
    "reports what it could not remove and keeps the entry",
    async () => {
      const root = tempDir("zudojs-rollback-fail-");
      const locked = join(root, "locked");
      mkdirSync(locked);
      const file = join(locked, "kept.txt");
      writeFileSync(file, "content");
      chmodSync(locked, 0o555);

      const manager = new RollbackManager();
      manager.trackFile(file);

      const result = await manager.rollback();
      chmodSync(locked, 0o755);

      expect(result.failures.map((failure) => failure.path)).toEqual([file]);
      expect(existsSync(file)).toBe(true);
      // The failed entry is still there to retry, instead of being dropped.
      expect(manager.entriesCount).toBe(1);
    },
  );

  it("reports what it removed", async () => {
    const root = tempDir("zudojs-rollback-ok-");
    const file = join(root, "gone.txt");
    writeFileSync(file, "x");

    const manager = new RollbackManager();
    manager.trackFile(file);

    const result = await manager.rollback();

    expect(result.removed).toEqual([file]);
    expect(result.failures).toEqual([]);
    expect(existsSync(file)).toBe(false);
    expect(manager.entriesCount).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-04                                                               */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-04", () => {
  it("adds a capability to a manifest that has no capabilities field", async () => {
    const root = tempDir("zudojs-manifest-old-");
    mkdirSync(join(root, ".zudojs"));
    writeFileSync(
      join(root, ".zudojs", "manifest.json"),
      JSON.stringify({ version: "1", architecture: "monolith" }),
    );

    const manager = new ManifestManager(root);
    await manager.addCapability("database");

    expect((await manager.read())?.capabilities).toEqual(["database"]);
  });

  it("leaves package.json untouched when the manifest is corrupt", async () => {
    const root = await monolithProject();
    mkdirSync(join(root, ".zudojs"), { recursive: true });
    writeFileSync(join(root, ".zudojs", "manifest.json"), "{ not json");

    const before = readFileSync(join(root, "package.json"), "utf-8");

    await expect(
      runAddCommand(
        context(root, { feature: "database", "skip-install": true }),
      ),
    ).rejects.toThrow(/manifest/i);

    expect(readFileSync(join(root, "package.json"), "utf-8")).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-05 / CLI-SURF-04                                                 */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-05", () => {
  it("generates into the project root when run from a subdirectory", async () => {
    const root = await monolithProject();
    const nested = join(root, "src", "modules");

    await runGenerateCommand(
      context(nested, { schematic: "service", name: "billing" }),
    );

    expect(
      existsSync(join(root, "src", "services", "billing.service.ts")),
    ).toBe(true);
    expect(existsSync(join(root, "src", "src"))).toBe(false);
    expect(existsSync(join(nested, "src"))).toBe(false);
  });
});

describe("CLI-SURF-04", () => {
  it("refuses to generate outside a Zudojs project and writes nothing", async () => {
    const root = tempDir("zudojs-no-project-");

    await expect(
      runGenerateCommand(
        context(root, { schematic: "service", name: "billing" }),
      ),
    ).rejects.toThrow(/must be run inside a Zudojs project/i);

    expect(readdirSync(root)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-06 / 07 / 08 / 09                                                */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-06", () => {
  it("replaces the manifest file instead of truncating it in place", async () => {
    const root = tempDir("zudojs-manifest-atomic-");
    const manager = new ManifestManager(root);
    await manager.create({
      version: "1",
      architecture: "monolith",
      capabilities: [],
    });

    const before = statSync(manager.path).ino;
    await manager.update({ architecture: "modular-monolith" });
    const after = statSync(manager.path).ino;

    expect(after).not.toBe(before);
    expect((await manager.read())?.architecture).toBe("modular-monolith");
    expect(
      readdirSync(join(root, ".zudojs")).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });
});

describe("CLI-STATE-07", () => {
  it("keeps every capability when three runs add one concurrently", async () => {
    const root = tempDir("zudojs-manifest-race-");
    await new ManifestManager(root).create({
      version: "1",
      architecture: "monolith",
      capabilities: [],
    });

    await Promise.all([
      new ManifestManager(root).addCapability("database"),
      new ManifestManager(root).addCapability("queue"),
      new ManifestManager(root).addCapability("security"),
    ]);

    expect(
      [...((await new ManifestManager(root).read())?.capabilities ?? [])].sort(),
    ).toEqual(["database", "queue", "security"]);
  });
});

describe("CLI-STATE-08", () => {
  it("fails instead of returning silently when there is no manifest", async () => {
    const manager = new ManifestManager(tempDir("zudojs-manifest-none-"));

    await expect(manager.addCapability("database")).rejects.toThrow(
      /No project manifest/i,
    );
    await expect(manager.update({ architecture: "monolith" })).rejects.toThrow(
      /No project manifest/i,
    );
  });
});

describe("CLI-STATE-09", () => {
  it("tells a missing manifest apart from a corrupt one", async () => {
    const empty = new ManifestManager(tempDir("zudojs-manifest-missing-"));
    expect((await empty.readResult()).status).toBe("missing");

    const root = tempDir("zudojs-manifest-corrupt-");
    mkdirSync(join(root, ".zudojs"));
    writeFileSync(join(root, ".zudojs", "manifest.json"), "{ nope");

    const corrupt = await new ManifestManager(root).readResult();
    expect(corrupt.status).toBe("invalid");
    expect(corrupt.reason).toMatch(/JSON/i);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-02 / CLI-SURF-15                                                  */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-02", () => {
  it("consumes the events and security capabilities", async () => {
    const cwd = tempDir("zudojs-caps-");
    await runCreateCommand(
      context(
        cwd,
        {
          "project-name": "demo",
          capabilities: "security,events",
          "no-install": true,
          "no-git": true,
        },
        ["--capabilities", "security,events"],
      ),
    );

    const root = join(cwd, "demo");
    const manifest = readJson(join(root, ".zudojs", "manifest.json"));
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining(["security", "events"]),
    );

    const pkg = readJson(join(root, "package.json"));
    const dependencies = pkg.dependencies as Record<string, string>;
    expect(Object.keys(dependencies)).toEqual(
      expect.arrayContaining(["@zudojs/security", "@zudojs/events"]),
    );
  });
});

describe("CLI-SURF-15", () => {
  it("honours --capabilities on the non-interactive path", async () => {
    const cwd = tempDir("zudojs-caps-flag-");
    await runCreateCommand(
      context(
        cwd,
        {
          "project-name": "demo",
          capabilities: "queue",
          "no-install": true,
          "no-git": true,
        },
        ["--capabilities=queue"],
      ),
    );

    const manifest = readJson(join(cwd, "demo", ".zudojs", "manifest.json"));
    expect(manifest.capabilities).toEqual(["queue"]);
  });

  it("keeps the previous default set when the flag is absent", async () => {
    const cwd = tempDir("zudojs-caps-default-");
    await runCreateCommand(
      context(cwd, {
        "project-name": "demo",
        "no-install": true,
        "no-git": true,
      }),
    );

    const manifest = readJson(join(cwd, "demo", ".zudojs", "manifest.json"));
    expect(manifest.capabilities).toEqual([
      "cqrs",
      "messaging",
      "observability",
      "openapi",
      "database",
    ]);
  });

  it("rejects an unknown capability", async () => {
    const cwd = tempDir("zudojs-caps-bad-");
    await expect(
      runCreateCommand(
        context(
          cwd,
          {
            "project-name": "demo",
            capabilities: "telepathy",
            "no-install": true,
            "no-git": true,
          },
          ["--capabilities=telepathy"],
        ),
      ),
    ).rejects.toThrow(/Invalid capability/i);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-EXEC-01                                                                */
/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-01", () => {
  it("exits non-zero when the dependency install fails, keeping the project", async () => {
    const cwd = tempDir("zudojs-install-fail-");
    execState.failing.add("pnpm");

    try {
      await expect(
        runCreateCommand(
          context(cwd, {
            "project-name": "demo",
            "package-manager": "pnpm",
            "no-git": true,
          }),
        ),
      ).rejects.toThrow(/dependency installation failed/i);
    } finally {
      execState.failing.delete("pnpm");
    }

    // The project itself is kept: the user is told how to retry.
    expect(existsSync(join(cwd, "demo", "package.json"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-05 / CLI-STATE-18                                                 */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-05", () => {
  it("renders the underlying failure when a schematic cannot be written", async () => {
    const root = await monolithProject();
    const services = join(root, "src", "services");
    rmSync(services, { recursive: true, force: true });
    writeFileSync(services, "not a directory");

    await expect(
      runGenerateCommand(
        context(root, { schematic: "service", name: "billing" }),
      ),
      // src/services is a file: mkdir reports EEXIST, a write through it
      // ENOTDIR. Either way the cause is rendered, not just "Failed to …".
    ).rejects.toThrow(/ENOTDIR|EEXIST|not a directory|file already exists/i);
  });
});

describe("CLI-STATE-18", () => {
  it.skipIf(isRoot)(
    "surfaces the cause when the project cannot be written",
    async () => {
      const cwd = tempDir("zudojs-readonly-");
      chmodSync(cwd, 0o555);

      try {
        await expect(
          runCreateCommand(
            context(cwd, {
              "project-name": "demo",
              "no-install": true,
              "no-git": true,
            }),
          ),
        ).rejects.toThrow(/EACCES|permission denied/i);
      } finally {
        chmodSync(cwd, 0o755);
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-06 / CLI-SURF-07                                                  */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-06", () => {
  it("rejects a project name that starts with a dash", async () => {
    for (const name of ["--weird", "-x", "-"]) {
      await expect(
        runCreateCommand(
          context(tempDir("zudojs-name-"), { "project-name": name }),
        ),
      ).rejects.toThrow(/Project name/i);
    }
  });
});

describe("CLI-SURF-07", () => {
  it("refuses --frontend on a backend project instead of discarding it", async () => {
    await expect(
      runCreateCommand(
        context(
          tempDir("zudojs-frontend-mismatch-"),
          {
            "project-name": "demo",
            type: "backend",
            frontend: "react",
            "no-install": true,
            "no-git": true,
          },
          ["--frontend", "react"],
        ),
      ),
    ).rejects.toThrow(/--frontend react/);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-11 / CLI-STATE-12                                                */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-11", () => {
  it("checks the package manager it was given, not the first one found", async () => {
    execState.failing.add("pnpm");

    try {
      const result = await new EnvironmentValidator().validate(
        "backend",
        "pnpm",
      );
      expect(result.missing).toContain("pnpm");
      expect(result.valid).toBe(false);
    } finally {
      execState.failing.delete("pnpm");
    }
  });

  it("checks a package manager for a backend project too", async () => {
    const result = await new EnvironmentValidator().validate("backend");
    expect(
      result.checks.some((check) =>
        ["pnpm", "npm", "yarn", "bun", "Package Manager"].includes(check.name),
      ),
    ).toBe(true);
  });
});

describe("CLI-STATE-12", () => {
  it("doctor reports the environment through the EnvironmentValidator", async () => {
    const root = await monolithProject();
    execState.failing.add("pnpm");

    try {
      const checks = await runEnvironmentChecks(root);
      const names = checks.map((check) => check.name);

      expect(names).toContain("Node.js version");
      expect(names).toContain("Git");
      // The project records pnpm, so pnpm is the one that gets checked.
      const packageManager = checks.find((check) =>
        check.name.startsWith("Package manager"),
      );
      expect(packageManager?.name).toContain("pnpm");
      expect(packageManager?.passed).toBe(false);
    } finally {
      execState.failing.delete("pnpm");
    }
  });

  it("create warns about an incompatible combination", async () => {
    const cwd = tempDir("zudojs-compat-");
    const ctx = context(
      cwd,
      {
        "project-name": "demo",
        type: "frontend",
        frontend: "flutter",
        "package-manager": "pnpm",
        "no-install": true,
        "no-git": true,
      },
      ["--frontend", "flutter", "--type", "frontend"],
    );

    // Flutter needs a toolchain this machine may not have, so the run is
    // allowed to fail afterwards; the compatibility warning is emitted
    // before any scaffolding happens.
    await runCreateCommand(ctx).catch(() => undefined);

    const warnings = (ctx.logger.warn as unknown as ReturnType<typeof vi.fn>)
      .mock.calls.flat()
      .join("\n");
    expect(warnings).toMatch(/flutter \+ pnpm/);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-STATE-14 / CLI-STATE-15 / ProjectValidator                             */
/* -------------------------------------------------------------------------- */

describe("CLI-STATE-14", () => {
  it("no longer returns an always-empty conflicts array", () => {
    const result = new CapabilityResolver().resolve(["cqrs"]);
    expect("conflicts" in result).toBe(false);
    expect(result.dependencies).toEqual(
      expect.arrayContaining(["messaging", "events"]),
    );
  });
});

describe("CLI-STATE-11/12 (ProjectValidator)", () => {
  it("never shells out to npx for the typescript check", async () => {
    const root = await monolithProject();
    const spawned: string[] = [];
    const exec = await import("../src/utils/utils.exec.js");
    const spy = vi
      .spyOn(exec, "execCommand")
      .mockImplementation(async (file: string) => {
        spawned.push(file);
        return { stdout: "", stderr: "" };
      });

    try {
      const result = await new ProjectValidator().validate(root, {
        expectInstalled: false,
      });
      const check = result.checks.find((c) => c.name === "typescript");
      expect(check?.passed).toBe(true);
      expect(check?.message).toMatch(/Skipped/);
      expect(spawned).not.toContain("npx");
    } finally {
      spy.mockRestore();
    }
  });

  it("skips the node_modules check when it was told not to expect one", async () => {
    const root = await monolithProject();
    const result = await new ProjectValidator().validate(root, {
      expectInstalled: false,
      typecheck: false,
    });

    expect(result.checks.map((check) => check.name)).not.toContain(
      "node_modules",
    );
    expect(result.valid).toBe(true);
  });
});

describe("CLI-STATE-15", () => {
  it("refuses a duplicate registration and offers replace()", () => {
    const dependencies = new DependencyRegistry();
    const record = {
      name: "react",
      version: "^19.0.0",
      type: "dependency" as const,
      source: "react-adapter",
    };
    dependencies.add(record);
    expect(() => dependencies.add({ ...record, version: "^18.0.0" })).toThrow(
      /already registered/i,
    );
    dependencies.replace({ ...record, version: "^18.0.0" });
    expect(dependencies.get("react")?.version).toBe("^18.0.0");

    const generators = new GeneratorRegistry();
    expect(() =>
      generators.register({
        name: "backend",
        generator: {},
        capabilities: [],
      }),
    ).toThrow(/already registered/i);
    generators.replace({ name: "backend", generator: {}, capabilities: ["x"] });
    expect(generators.get("backend")?.capabilities).toEqual(["x"]);

    const frontend = new FrontendAdapterRegistry();
    const react = frontend.get("react");
    expect(react).toBeDefined();
    expect(() => frontend.register(react!)).toThrow(/already registered/i);
    expect(() => frontend.replace(react!)).not.toThrow();

    const managers = new PackageManagerRegistry();
    const pnpm = managers.get("pnpm");
    expect(pnpm).toBeDefined();
    expect(() => managers.register(pnpm!)).toThrow(/already registered/i);
    expect(() => managers.replace(pnpm!)).not.toThrow();
  });
});
