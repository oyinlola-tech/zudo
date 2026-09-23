/**
 * zudojs-cli — `info`, `doctor` and `add` work from any directory inside a
 * project.
 *
 * They read the layout of the current directory only, so from `src/routes`
 * they reported "not in a Zudojs project" while `generate` and `build`
 * walked up and worked. They now walk up with `findProjectRoot`; inside a
 * workspace app they resolve to the workspace, whose manifest they read
 * and update.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { runAddCommand } from "../src/commands/add.command.js";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runDoctorChecks, runDoctorCommand } from "../src/commands/doctor.command.js";
import { runInfoCommand } from "../src/commands/info.command.js";
import { findProjectRoot } from "../src/resolvers/project.resolver.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-nested-"));
  dirs.push(dir);
  return dir;
}

function context(cwd: string, values: Record<string, unknown> = {}, args: string[] = []) {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() };
  const ctx: CLIContext = {
    args,
    values: values as CLIContext["values"],
    cwd,
    env: { ZUDOJS_NO_UPDATE_CHECK: "1" },
    logger: logger as unknown as CLIContext["logger"],
  };
  return {
    ctx,
    infos: () => logger.info.mock.calls.map((call) => String(call[0])),
    warnings: () => logger.warn.mock.calls.map((call) => String(call[0])),
  };
}

async function create(values: Record<string, string> = {}): Promise<string> {
  const cwd = tempDir();
  const args = Object.keys(values).map((key) => `--${key}`);
  await runCreateCommand(
    context(cwd, { "project-name": "shop", "no-install": true, "no-git": true, ...values }, args).ctx,
  );
  return join(cwd, "shop");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

function manifestCapabilities(root: string): unknown {
  return readJson(join(root, ".zudojs", "manifest.json"))["capabilities"];
}

describe("from src/routes of a monolith", () => {
  it("info describes the project", async () => {
    const root = await create({ capabilities: "events" });
    const info = context(join(root, "src", "routes"));
    await runInfoCommand(info.ctx);

    expect(info.infos()).toContain("  Name: shop");
    expect(info.infos()).toContain("  Capabilities: events");
    expect(info.infos()).not.toContain("Not in a Zudojs project directory.");
  });

  it("doctor checks the project", async () => {
    const root = await create();
    const nested = join(root, "src", "routes");

    const project = runDoctorChecks(nested).find((c) => c.name === "Zudojs project");
    expect(project?.passed).toBe(true);
    expect(project?.message).toContain("monolith");
    expect(runDoctorChecks(nested).map((c) => c.name)).toEqual(
      runDoctorChecks(root).map((c) => c.name),
    );

    const doctor = context(nested);
    await runDoctorCommand(doctor.ctx);
    expect(doctor.infos().join("\n")).toContain("Zudojs project: backend (monolith)");
  });

  it("add writes to the project, not the current directory", async () => {
    const root = await create({ capabilities: "events" });
    await runAddCommand(
      context(join(root, "src", "routes"), { feature: "queue", "skip-install": true }).ctx,
    );

    expect(manifestCapabilities(root)).toEqual(["events", "queue"]);
    expect(readJson(join(root, "package.json"))["dependencies"]).toHaveProperty("@zudojs/queue");
    expect(readFileSync(join(root, "src", "integrations", "index.ts"), "utf-8")).toContain("queue");
  });
});

describe("from inside a workspace app", () => {
  it("microservice: doctor, info and add resolve to the workspace", async () => {
    const root = await create({ architecture: "microservice", services: "users", capabilities: "events" });
    const nested = join(root, "apps", "services", "users", "src", "routes");

    expect(runDoctorChecks(nested).find((c) => c.name === "Zudojs project")?.message).toContain(
      "microservice",
    );

    const info = context(nested);
    await runInfoCommand(info.ctx);
    expect(info.infos()).toContain("  Architecture: microservice");
    expect(info.infos()).toContain("  Services: users");

    const add = context(nested, { feature: "cache", "skip-install": true });
    await runAddCommand(add.ctx);
    expect(add.warnings().join("\n")).not.toMatch(/No \.zudojs\/manifest\.json/);
    expect(manifestCapabilities(root)).toEqual(["events", "cache"]);
    for (const app of ["apps/gateway", "apps/services/users"]) {
      expect(readJson(join(root, app, "package.json"))["dependencies"], app).toHaveProperty(
        "@zudojs/cache",
      );
    }
  });

  it("fullstack: apps/api/src resolves to the fullstack root", async () => {
    const root = await create({ type: "fullstack", frontend: "vanilla" });
    const nested = join(root, "apps", "api", "src");

    expect(findProjectRoot(nested, { workspace: true })).toBe(root);
    expect(runDoctorChecks(nested).find((c) => c.name === "Zudojs project")?.message).toContain(
      "fullstack",
    );
  }, 120_000);

  it("generate and build keep resolving to the app they run in", async () => {
    const root = await create({ architecture: "microservice", services: "users" });
    const app = join(root, "apps", "services", "users");

    expect(findProjectRoot(join(app, "src", "routes"))).toBe(app);
    expect(findProjectRoot(join(app, "src", "routes"), { workspace: true })).toBe(root);
  });
});

describe("outside any project", () => {
  it("info says so and add refuses", async () => {
    const cwd = tempDir();
    const info = context(cwd);
    await runInfoCommand(info.ctx);
    expect(info.infos()).toContain("Not in a Zudojs project directory.");

    await expect(
      runAddCommand(context(cwd, { feature: "queue", "skip-install": true }).ctx),
    ).rejects.toThrow(/No Zudojs project found/);
  });
});
