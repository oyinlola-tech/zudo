/**
 * zudojs-cli — Regression tests for previously unwired capabilities.
 *
 * Each test here covers an option, callback or result that the CLI accepted
 * and then never read.
 */

import { describe, it, expect, vi } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCreateCommand } from "../src/commands/create.command.js";
import { runDoctorCommand } from "../src/commands/doctor.command.js";
import { IntegrationGenerator } from "../src/generators/integration/integrationGenerator.core.js";
import { ProcessRunner } from "../src/runners/process/processRunner.core.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

function createContext(overrides?: Partial<CLIContext>): CLIContext {
  const logger = {
    debug: () => {},
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: () => {},
    fatal: () => {},
    child: () => logger,
    level: 3,
    flush: () => {},
  };

  return {
    args: [],
    values: {},
    cwd: tmpdir(),
    env: {},
    logger: logger as unknown as CLIContext["logger"],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */

describe("create --services in `--flag=value` form", () => {
  // `hasExplicitFlag` used to compare whole tokens, so `--services=x` was not
  // recognized as explicit and the value was silently discarded for every
  // architecture but microservice — including its validation.
  it("is recognized as explicitly provided", async () => {
    const context = createContext({
      args: ["--services=../evil"],
      values: {
        "project-name": "my-app",
        architecture: "monolith",
        services: "../evil",
      },
    });

    await expect(runCreateCommand(context)).rejects.toThrow(
      /Invalid service name/i,
    );
  });

  it("is recognized in short attached form for other options", async () => {
    // `-d` with an attached value must still be validated.
    const context = createContext({
      args: ["-dmongo-db"],
      values: { "project-name": "my-app", database: "mongo-db" },
    });

    await expect(runCreateCommand(context)).rejects.toThrow(
      /Invalid database/i,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("zudojs doctor exit status", () => {
  it("fails (throws) when checks fail so CI sees a non-zero exit", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudojs-doctor-bad-"));
    try {
      const context = createContext({ cwd: root });
      await expect(runDoctorCommand(context)).rejects.toThrow(
        /found \d+ problem/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("succeeds on a project that passes every fatal check", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudojs-doctor-good-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "ok",
          zudojs: { features: [] },
          dependencies: { "@zudojs/core": "0.1.0" },
        }),
      );
      writeFileSync(join(root, "tsconfig.json"), "{}");

      const context = createContext({ cwd: root });
      await expect(runDoctorCommand(context)).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("IntegrationGenerator", () => {
  it("writes the frontend port it was given and does not clobber an existing vite config", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudojs-integration-"));
    try {
      mkdirSync(join(root, "apps", "web"), { recursive: true });
      const viteConfig = join(root, "apps", "web", "vite.config.ts");
      writeFileSync(viteConfig, "// adapter-generated config with aliases\n");

      await new IntegrationGenerator().generate({
        project: {
          name: "app",
          type: "fullstack",
          backend: { architecture: "monolith", api: "rest" },
          frontend: {
            framework: "react",
            architecture: "zudojs-standard",
            language: "typescript",
          },
          workspace: { packageManager: "pnpm" },
        },
        projectPath: root,
        backendPort: 3000,
        frontendPort: 4321,
      });

      const env = readFileSync(join(root, ".env.example"), "utf-8");
      expect(env).toContain("FRONTEND_PORT=4321");

      // The adapter's own config survives.
      expect(readFileSync(viteConfig, "utf-8")).toContain(
        "adapter-generated config",
      );

      // CORS config lands next to the backend, not at the workspace root.
      expect(existsSync(join(root, "apps", "api", "config", "cors.ts"))).toBe(
        true,
      );
      expect(existsSync(join(root, "config", "cors.ts"))).toBe(false);
      expect(
        readFileSync(join(root, "apps", "api", "config", "cors.ts"), "utf-8"),
      ).toContain("http://localhost:4321");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates a vite config when the frontend adapter did not", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudojs-integration2-"));
    try {
      await new IntegrationGenerator().generate({
        project: {
          name: "app",
          type: "fullstack",
          backend: { architecture: "monolith", api: "rest" },
          frontend: {
            framework: "react",
            architecture: "zudojs-standard",
            language: "typescript",
          },
          workspace: { packageManager: "pnpm" },
        },
        projectPath: root,
      });

      expect(
        readFileSync(join(root, "apps", "web", "vite.config.ts"), "utf-8"),
      ).toContain("proxy");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("ProcessRunner", () => {
  it("returns the captured stdout instead of an empty string", async () => {
    const runner = new ProcessRunner();
    const result = await runner.run(
      process.execPath,
      ["-e", "process.stdout.write('captured')"],
      { cwd: tmpdir() },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("captured");
  });

  it("passes env through to the child process", async () => {
    const runner = new ProcessRunner();
    const result = await runner.run(
      process.execPath,
      ["-e", "process.stdout.write(process.env.ZUDOJS_TEST_VAR || 'missing')"],
      { cwd: tmpdir(), env: { ZUDOJS_TEST_VAR: "wired" } },
    );

    expect(result.stdout).toBe("wired");
  });

  it("reports a non-zero exit code for a failing command", async () => {
    const runner = new ProcessRunner();
    const result = await runner.run(
      process.execPath,
      ["-e", "process.exit(3)"],
      { cwd: tmpdir() },
    );

    expect(result.exitCode).toBe(3);
  });
});

describe("CLI version is derived, not duplicated", () => {
  it("matches the version declared in package.json", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const manifestPath = join(
      dirname(dirname(fileURLToPath(import.meta.url))),
      "package.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly version: string;
    };

    const { CLI_VERSION } = await import("../src/constants/index.js");
    const { CLI_DEFAULTS } =
      await import("../src/cliConstant/cliConstant.value.js");

    // Both were hand-maintained literals that agreed with package.json by
    // convention only; a release that bumped the manifest alone would have
    // stamped the previous version into every generated project.
    expect(CLI_VERSION).toBe(manifest.version);
    expect(CLI_DEFAULTS.VERSION).toBe(manifest.version);
  });
});
