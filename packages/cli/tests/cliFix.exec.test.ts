/**
 * zudojs-cli — Exec / runner / scaffolder regression tests
 *
 * One `describe` per audit finding in the `exec` area.
 */

import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EXEC_TIMEOUT_MS,
  execCommand,
  quoteForWindowsShell,
  resolveChildEnv,
  resolveSpawnTarget,
} from "../src/utils/utils.exec.js";
import {
  SCAFFOLD_TIMEOUT_MS,
  scaffoldWithFallback,
} from "../src/scaffolders/scaffolder.helper.js";
import { ProcessRunner } from "../src/runners/process/processRunner.core.js";
import { TaskRunner } from "../src/runners/task/taskRunner.core.js";
import { PackageManagerRunner } from "../src/runners/package-manager/packageManagerRunner.core.js";
import { FlutterAdapter } from "../src/adapters/frontend/flutter.adapter.js";
import type { FrontendGenerationContext } from "../src/adapters/frontend/frontendAdapter.type.js";
import type { PackageManager } from "../src/types/index.js";
import { CLIValidationError } from "../src/errors/index.js";

type ExecModule = typeof import("../src/utils/utils.exec.js");

vi.mock("../src/utils/utils.exec.js", async (importOriginal) => {
  const actual = await importOriginal<ExecModule>();
  return {
    ...actual,
    execCommand: vi.fn(actual.execCommand),
    resolveSpawnTarget: vi.fn(actual.resolveSpawnTarget),
  };
});

const actualExec = await vi.importActual<ExecModule>(
  "../src/utils/utils.exec.js",
);

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-exec-fix-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.mocked(execCommand).mockImplementation(actualExec.execCommand);
  vi.mocked(resolveSpawnTarget).mockImplementation(
    actualExec.resolveSpawnTarget,
  );
  vi.mocked(execCommand).mockClear();
  vi.mocked(resolveSpawnTarget).mockClear();
});

/** An `execFile` rejection shaped like the real thing. */
function execFailure(
  message: string,
  extra: Record<string, unknown>,
): Error & Record<string, unknown> {
  return Object.assign(new Error(message), extra);
}

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-03 — scaffolders get a timeout long enough to finish", () => {
  it("passes an explicit multi-minute timeout to execCommand", async () => {
    vi.mocked(execCommand).mockResolvedValue({ stdout: "", stderr: "" });

    await scaffoldWithFallback({
      command: "npm",
      args: ["create", "vite@latest", "."],
      targetPath: makeTempDir(),
      fallbackFiles: {},
    });

    const options = vi.mocked(execCommand).mock.calls[0]?.[3];
    expect(options?.timeout).toBe(SCAFFOLD_TIMEOUT_MS);
    expect(SCAFFOLD_TIMEOUT_MS).toBeGreaterThan(DEFAULT_EXEC_TIMEOUT_MS);
    expect(SCAFFOLD_TIMEOUT_MS).toBeGreaterThanOrEqual(600000);
  });

  it("still writes the fallback template when the scaffolder really fails", async () => {
    const dir = makeTempDir();
    vi.mocked(execCommand).mockRejectedValue(
      execFailure("Command failed: npm create vite@latest .", {
        code: 1,
        stderr: "",
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ok = await scaffoldWithFallback({
      command: "npm",
      args: ["create", "vite@latest", "."],
      targetPath: dir,
      fallbackFiles: { "index.html": "<!doctype html>" },
    });

    warn.mockRestore();
    expect(ok).toBe(false);
    expect(readFileSync(join(dir, "index.html"), "utf-8")).toBe(
      "<!doctype html>",
    );
  });

  it("reports a killed child as a timeout, not as a plain failure", async () => {
    vi.mocked(execCommand).mockRejectedValue(
      execFailure("Command failed: npx create-next-app@latest .", {
        killed: true,
        signal: "SIGTERM",
        code: null,
        stderr: "",
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await scaffoldWithFallback({
      command: "npx",
      args: ["create-next-app@latest", "."],
      targetPath: makeTempDir(),
      fallbackFiles: {},
    });

    const message = String(warn.mock.calls[0]?.[0]);
    warn.mockRestore();
    expect(message).toContain("timed out");
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-11 — the scaffolder warning carries the child's stderr", () => {
  it("includes the stderr the child actually produced", async () => {
    vi.mocked(execCommand).mockRejectedValue(
      execFailure("Command failed: npm create vite@latest .", {
        code: 1,
        stderr: "  npm ERR! 404 Not Found - GET vite@latest  \n",
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await scaffoldWithFallback({
      command: "npm",
      args: ["create", "vite@latest", "."],
      targetPath: makeTempDir(),
      fallbackFiles: {},
    });

    const message = String(warn.mock.calls[0]?.[0]);
    warn.mockRestore();
    expect(message).toContain("npm ERR! 404 Not Found - GET vite@latest");
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-04 — runBackground surfaces spawn failures", () => {
  const runner = new ProcessRunner();

  it("rejects instead of returning a fake pid when the binary is missing", async () => {
    await expect(
      runner.runBackground("zudojs-no-such-binary-4f2a", [], {
        cwd: makeTempDir(),
      }),
    ).rejects.toThrow(/was not found/);
  });

  it("resolves with the real pid of a process that started", async () => {
    const result = await runner.runBackground(
      process.execPath,
      ["-e", "setTimeout(() => {}, 50)"],
      { cwd: makeTempDir() },
    );

    expect(result.pid).toBeGreaterThan(0);
  });

  it("routes the command through resolveSpawnTarget", async () => {
    await runner.runBackground(process.execPath, ["-e", ""], {
      cwd: makeTempDir(),
    });

    expect(vi.mocked(resolveSpawnTarget)).toHaveBeenCalledWith(
      process.execPath,
      ["-e", ""],
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-08 — PackageManagerRunner validates its manager", () => {
  it("rejects a manager that is not on the allowlist", () => {
    expect(
      () => new PackageManagerRunner("evil-binary" as PackageManager),
    ).toThrow(CLIValidationError);
  });

  it("accepts the four supported managers and spawns them by name", async () => {
    vi.mocked(execCommand).mockResolvedValue({ stdout: "", stderr: "" });

    for (const manager of ["pnpm", "npm", "yarn", "bun"] as const) {
      await new PackageManagerRunner(manager).install("/tmp");
    }

    expect(
      vi.mocked(execCommand).mock.calls.map((call) => call[0]),
    ).toEqual(["pnpm", "npm", "yarn", "bun"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-09 — TaskRunner reports what the child did", () => {
  const runner = new TaskRunner();

  it("returns the child's stdout on success", async () => {
    const result = await runner.run({
      name: "echo",
      command: process.execPath,
      args: ["-e", "process.stdout.write('captured')"],
      cwd: makeTempDir(),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("captured");
  });

  it("returns the child's real exit code and stderr on failure", async () => {
    const result = await runner.run({
      name: "fail",
      command: process.execPath,
      args: ["-e", "process.stderr.write('child-said-this'); process.exit(7)"],
      cwd: makeTempDir(),
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toBe("child-said-this");
  });

  it("cancels the remaining tasks when a required task fails", async () => {
    const cwd = makeTempDir();
    const results = await runner.runParallel([
      {
        name: "required",
        command: process.execPath,
        args: ["-e", "process.exit(2)"],
        cwd,
        required: true,
      },
      {
        name: "slow",
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 20000)"],
        cwd,
      },
    ]);

    expect(results[0]?.exitCode).toBe(2);
    expect(results[1]?.cancelled).toBe(true);
    expect(results[1]?.success).toBe(false);
  });

  it("lets the other tasks finish when the failing task is not required", async () => {
    const cwd = makeTempDir();
    const results = await runner.runParallel([
      {
        name: "optional",
        command: process.execPath,
        args: ["-e", "process.exit(2)"],
        cwd,
      },
      {
        name: "slow",
        command: process.execPath,
        args: ["-e", "setTimeout(() => process.stdout.write('done'), 300)"],
        cwd,
      },
    ]);

    expect(results[1]?.success).toBe(true);
    expect(results[1]?.cancelled).toBe(false);
    expect(results[1]?.output).toBe("done");
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-12 — Flutter gets a lower_snake_case project name", () => {
  const context = (name: string): FrontendGenerationContext => ({
    project: { name, type: "frontend" },
    projectPath: "/tmp/flutter-app",
    framework: "flutter",
    packageManager: "pnpm",
    language: "typescript",
    architecture: "zudojs-standard",
    features: {},
  });

  it("normalizes the name it passes to --project-name", async () => {
    vi.mocked(execCommand).mockResolvedValue({ stdout: "", stderr: "" });

    await new FlutterAdapter().scaffold(context("MyApp-Client"));

    const args = vi.mocked(execCommand).mock.calls[0]?.[1] ?? [];
    const value = args[args.indexOf("--project-name") + 1];
    expect(value).toBe("myapp_client");
  });

  it("maps every accepted CLI name to a valid Dart package name", () => {
    expect(FlutterAdapter.toFlutterProjectName("MyApp")).toBe("myapp");
    expect(FlutterAdapter.toFlutterProjectName("my-cool-app")).toBe(
      "my_cool_app",
    );
    expect(FlutterAdapter.toFlutterProjectName("2fast")).toBe("app_2fast");
    expect(FlutterAdapter.toFlutterProjectName("...")).toBe("zudojs_app");

    for (const name of ["MyApp", "my-cool-app", "2fast", "..."]) {
      expect(FlutterAdapter.toFlutterProjectName(name)).toMatch(
        /^[a-z_][a-z0-9_]*$/,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-06 — cmd.exe arguments are rejected, not mis-escaped", () => {
  it("rejects characters cmd.exe cannot be made to treat as literal", () => {
    for (const argument of ['a"b', 'x" & calc & "', "%PATH%", "a!b!"]) {
      expect(() => quoteForWindowsShell(argument)).toThrow(CLIValidationError);
    }
  });

  it("never emits a backslash-escaped quote", () => {
    expect(() => quoteForWindowsShell('say "hi"')).toThrow();
    expect(quoteForWindowsShell("a&b")).toBe('"a&b"');
    expect(quoteForWindowsShell("")).toBe('""');
    expect(quoteForWindowsShell("plain")).toBe("plain");
  });

  it("rejects at the spawn-target boundary on Windows", () => {
    expect(() =>
      actualExec.resolveSpawnTarget("pnpm", ['run', 'a" & calc & "'], "win32"),
    ).toThrow(CLIValidationError);

    expect(
      actualExec.resolveSpawnTarget("pnpm", ["run", "dev"], "win32").args,
    ).toEqual(["run", "dev"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("CLI-EXEC-07 — the Windows shell path does not search the cwd", () => {
  it("sets NoDefaultCurrentDirectoryInExePath for a win32 shell child", () => {
    const env = resolveChildEnv(true, { PATH: "C:\\bin" }, "win32");
    expect(env?.NoDefaultCurrentDirectoryInExePath).toBe("1");
    expect(env?.PATH).toBe("C:\\bin");
  });

  it("leaves the environment alone where it is not needed", () => {
    const base = { PATH: "/usr/bin" };
    expect(resolveChildEnv(false, base, "win32")).toBe(base);
    expect(resolveChildEnv(true, base, "linux")).toBe(base);
    expect(resolveChildEnv(false, undefined, "linux")).toBeUndefined();
  });

  it("defaults from process.env when the caller passed none", () => {
    const env = resolveChildEnv(true, undefined, "win32");
    expect(env?.NoDefaultCurrentDirectoryInExePath).toBe("1");
  });
});
