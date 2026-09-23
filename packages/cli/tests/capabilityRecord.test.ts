/**
 * zudojs-cli — regressions reported against zudojs-cli 2.0.1.
 *
 * 1. `create --architecture modular-monolith` wrote an app.ts with no
 *    `for (const module of [` list, so `generate module` could never
 *    register a module and always printed "Could not register the module
 *    automatically".
 * 2. `--capabilities events,cqrs` recorded `["cqrs","events"]` in
 *    `.zudojs/manifest.json` but `["cqrs"]` in package.json
 *    `zudojs.features`. The manifest list (`resolveProjectCapabilities`) is
 *    now the one source both are written from, and `add` keeps them equal.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { runAddCommand } from "../src/commands/add.command.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runDoctorChecks } from "../src/commands/doctor.command.js";
import { runGenerateCommand } from "../src/commands/generate.command.js";
import { runInfoCommand } from "../src/commands/info.command.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { resolveProjectCapabilities } from "../src/templates/shared/index.js";
import { toProjectConfiguration } from "../src/types/scaffold.type.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-capabilities-"));
  dirs.push(dir);
  return dir;
}

interface TestContext extends CLIContext {
  readonly warnings: () => string[];
  readonly infos: () => string[];
}

function context(cwd: string, values: Record<string, unknown>, args: string[] = []): TestContext {
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
    env: { ZUDOJS_NO_UPDATE_CHECK: "1" },
    logger: logger as unknown as CLIContext["logger"],
    warnings: () => logger.warn.mock.calls.map((call) => String(call[0])),
    infos: () => logger.info.mock.calls.map((call) => String(call[0])),
  };
}

/** Runs `create <name> --no-git --no-install` with `values` in a new temp dir. */
async function create(
  name: string,
  values: Record<string, unknown>,
): Promise<string> {
  const cwd = tempDir();
  const args = Object.keys(values).map((key) => `--${key}`);
  await runCreateCommand(
    context(cwd, { "project-name": name, "no-install": true, "no-git": true, ...values }, args),
  );
  return join(cwd, name);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

function features(pkgPath: string): unknown {
  return (readJson(pkgPath)["zudojs"] as { features?: unknown } | undefined)?.features;
}

function capabilities(root: string): unknown {
  return readJson(join(root, ".zudojs", "manifest.json"))["capabilities"];
}

function check(root: string, name: string) {
  return runDoctorChecks(root).find((c) => c.name === name);
}

describe("modular monolith: generate module registers in app.ts", () => {
  it("the template writes a module list even with no modules", () => {
    const files = generateModularMonolithFiles({
      projectName: "shop",
      projectType: "backend",
      architecture: "modular-monolith",
      packageManager: "pnpm",
      services: [],
      enableCQRS: true,
      enableMessaging: false,
      enableObservability: false,
      enableOpenAPI: false,
      enableDatabase: false,
      enableQueue: false,
      enableDocker: false,
      installDeps: false,
      initGit: false,
    });
    expect(files["src/app.ts"]).toContain("  for (const module of [\n  ] as Module[]) {");
  });

  it.each([
    ["without --services", {}],
    ["with --services", { services: "billing,users" }],
  ] as const)("registers automatically %s", async (_label, extra) => {
    const root = await create("shop", {
      type: "backend",
      architecture: "modular-monolith",
      ...extra,
    });
    const generate = context(root, { schematic: "module", name: "catalog" });
    await runGenerateCommand(generate);

    expect(generate.warnings().join("\n")).not.toMatch(/Could not register/);
    const app = readFileSync(join(root, "src", "app.ts"), "utf-8");
    expect(app).toContain('import { CatalogModule } from "./modules/index.js";');
    expect(app).toMatch(/for \(const module of \[\n {4}new CatalogModule\(\),\n/);
    if ("services" in extra) {
      expect(app).toContain("new BillingModule(),");
      expect(app).toContain("new UsersModule(),");
    }
  });

  it("registers in apps/api of a fullstack modular monolith", async () => {
    const root = await create("shop", {
      type: "fullstack",
      frontend: "vanilla",
      architecture: "modular-monolith",
    });
    const generate = context(root, { schematic: "module", name: "catalog" });
    await runGenerateCommand(generate);

    expect(generate.warnings().join("\n")).not.toMatch(/Could not register/);
    expect(readFileSync(join(root, "apps", "api", "src", "app.ts"), "utf-8")).toContain(
      "new CatalogModule(),",
    );
  });
});

describe("create records one capability list in the manifest and package.json", () => {
  it.each([
    ["monolith", ["package.json"]],
    ["modular-monolith", ["package.json"]],
    [
      "microservice",
      ["package.json", "apps/gateway/package.json", "apps/services/users/package.json"],
    ],
  ] as const)("%s: --capabilities events,cqrs", async (architecture, packages) => {
    const root = await create("shop", {
      type: "backend",
      architecture,
      services: "users",
      capabilities: "events,cqrs",
    });

    expect(capabilities(root)).toEqual(["cqrs", "events"]);
    for (const pkg of packages) {
      expect(features(join(root, pkg)), pkg).toEqual(["cqrs", "events"]);
    }
    expect(check(root, "Capabilities")?.passed).toBe(true);
    expect(check(root, "Features")?.passed).toBe(true);
  });

  it("records capabilities that have no package mapping of their own", async () => {
    const root = await create("shop", { capabilities: "security,events" });

    expect(capabilities(root)).toEqual(["security", "events"]);
    expect(features(join(root, "package.json"))).toEqual(["security", "events"]);
  });

  it("records the fullstack backend app's capabilities in apps/api", async () => {
    const root = await create("shop", {
      type: "fullstack",
      frontend: "vanilla",
      capabilities: "queue,security,events",
    });

    expect(capabilities(root)).toEqual(["queue", "security", "events"]);
    expect(features(join(root, "apps", "api", "package.json"))).toEqual(
      capabilities(root),
    );
  });

  it("gives a default microservice gateway the packages behind its features", async () => {
    const root = await create("shop", {
      type: "backend",
      architecture: "microservice",
      services: "users",
    });
    const gateway = readJson(join(root, "apps", "gateway", "package.json"));

    expect(features(join(root, "apps", "gateway", "package.json"))).toEqual(
      capabilities(root),
    );
    expect(Object.keys(gateway["dependencies"] as object)).toContain("@zudojs/cqrs");
    expect(check(root, "Features")?.passed, check(root, "Features")?.message).toBe(true);
  });

  it("records no capabilities for a frontend-only project and says why", async () => {
    const cwd = tempDir();
    const ctx = context(
      cwd,
      {
        "project-name": "web",
        type: "frontend",
        frontend: "vanilla",
        capabilities: "queue",
        "no-install": true,
        "no-git": true,
      },
      ["--type", "--frontend", "--capabilities"],
    );
    await runCreateCommand(ctx);

    expect(capabilities(join(cwd, "web"))).toEqual([]);
    expect(ctx.warnings().join("\n")).toMatch(/--capabilities applies to backend apps/);
  });

  it("uses the capability list, not the service names, as ProjectConfiguration.features", () => {
    const options: ScaffoldOptions = {
      projectName: "shop",
      architecture: "microservice",
      packageManager: "pnpm",
      services: ["users"],
      enableCQRS: true,
      enableMessaging: false,
      enableObservability: false,
      enableOpenAPI: false,
      enableDatabase: false,
      enableQueue: false,
      capabilities: ["cqrs", "events"],
      enableDocker: false,
      installDeps: false,
      initGit: false,
    };

    expect(resolveProjectCapabilities(options)).toEqual(["cqrs", "events"]);
    expect(toProjectConfiguration(options).features).toEqual(["cqrs", "events"]);
  });
});

describe("add keeps the manifest and package.json in step", () => {
  it("records the feature on the microservice root as well as the app", async () => {
    const root = await create("shop", {
      type: "backend",
      architecture: "microservice",
      services: "users",
      capabilities: "events",
    });
    await runAddCommand(
      context(root, { feature: "queue", service: "users", "skip-install": true }),
    );

    expect(capabilities(root)).toEqual(["events", "queue"]);
    expect(features(join(root, "package.json"))).toEqual(["events", "queue"]);
    expect(features(join(root, "apps", "services", "users", "package.json"))).toEqual([
      "events",
      "queue",
    ]);
    expect(features(join(root, "apps", "gateway", "package.json"))).toEqual(["events"]);
    expect(check(root, "Capabilities")?.passed).toBe(true);
  });

  it("records an alias under its canonical name in both places", async () => {
    const root = await create("shop", { capabilities: "events" });
    await runAddCommand(context(root, { feature: "postgres", "skip-install": true }));

    expect(capabilities(root)).toEqual(["events", "database"]);
    expect(features(join(root, "package.json"))).toEqual(["events", "database"]);
  });
});

describe("doctor and info read the same capabilities", () => {
  it("doctor reports a manifest capability missing from package.json", async () => {
    const root = await create("shop", { capabilities: "events,cqrs" });
    const pkgPath = join(root, "package.json");
    const pkg = readJson(pkgPath) as { zudojs: { features: string[] } };
    // What zudojs-cli 2.0.1 wrote for --capabilities events,cqrs.
    pkg.zudojs.features = ["cqrs"];
    writeFileSync(pkgPath, JSON.stringify(pkg));

    const result = check(root, "Capabilities");
    expect(result?.passed).toBe(false);
    expect(result?.message).toContain('"events" is in .zudojs/manifest.json');
  });

  it("info prints the recorded capabilities", async () => {
    const root = await create("shop", { capabilities: "events,cqrs" });
    const info = context(root, {});
    await runInfoCommand(info);

    expect(info.infos()).toContain("  Capabilities: cqrs, events");
  });
});
