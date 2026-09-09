/**
 * zudojs-cli — CLI Application Tests
 *
 * Tests for ZudojsCLI, builtins, writer, runner, help generator,
 * and version utilities.
 */

import { describe, it, expect, vi } from "vitest";

import {
  ZudojsCLI,
  createCLI,
} from "../src/cliApplication/cliApplication.core.js";
import {
  isHelpRequest,
  isVersionRequest,
  printVersion,
  printHelp,
} from "../src/cliApplication/cliApplication.builtins.js";
import { createCLIWriter } from "../src/cliApplication/cliApplication.writer.js";
import {
  getCLIVersion,
  formatCLIVersion,
  getVersionString,
  isValidVersion,
  compareVersions,
  parseVersion,
  isCompatibleVersion,
} from "../src/cliVersion/cliVersion.core.js";
import { createCommand } from "../src/cliCommand/cliCommand.factory.js";
import { CLI_EXIT_CODES } from "../src/cliConstant/cliConstant.value.js";
import type { CLICommand, CLIWriter } from "../src/cliType/cliType.type.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function createMockWriter(): CLIWriter & {
  stdout: string;
  stderr: string;
  reset(): void;
} {
  let stdout = "";
  let stderr = "";
  return {
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    write(message: string) {
      stdout += message;
    },
    writeLine(message = "") {
      stdout += message + "\n";
    },
    error(message: string) {
      stderr += message;
    },
    errorLine(message = "") {
      stderr += message + "\n";
    },
    reset() {
      stdout = "";
      stderr = "";
    },
  };
}

// ─── Builtins ──────────────────────────────────────────────────────────────

describe("isHelpRequest", () => {
  it("detects --help", () => {
    expect(isHelpRequest(["--help"])).toBe(true);
  });

  it("detects -h", () => {
    expect(isHelpRequest(["-h"])).toBe(true);
  });

  it("detects help command", () => {
    expect(isHelpRequest(["help"])).toBe(true);
  });

  it("returns false for non-help args", () => {
    expect(isHelpRequest(["start"])).toBe(false);
    expect(isHelpRequest([])).toBe(false);
  });
});

describe("isVersionRequest", () => {
  it("detects --version", () => {
    expect(isVersionRequest(["--version"])).toBe(true);
  });

  it("detects -v", () => {
    expect(isVersionRequest(["-v"])).toBe(true);
  });

  it("detects version command", () => {
    expect(isVersionRequest(["version"])).toBe(true);
  });

  it("returns false for non-version args", () => {
    expect(isVersionRequest(["start"])).toBe(false);
  });
});

describe("printVersion", () => {
  it("prints the version", () => {
    const writer = createMockWriter();
    printVersion(writer, "1.0.0");
    expect(writer.stdout).toContain("1.0.0");
  });

  it("prints default version when none given", () => {
    const writer = createMockWriter();
    printVersion(writer);
    expect(writer.stdout).toBeTruthy();
  });
});

describe("printHelp", () => {
  it("prints application name", () => {
    const writer = createMockWriter();
    printHelp(writer, "my-app", "1.0.0", "My app", []);
    expect(writer.stdout).toContain("my-app");
    expect(writer.stdout).toContain("1.0.0");
  });

  it("prints command list", () => {
    const writer = createMockWriter();
    const commands: CLICommand[] = [
      createCommand({ name: "start", execute: () => {} }),
      createCommand({ name: "stop", execute: () => {} }),
    ];
    printHelp(writer, "app", undefined, undefined, commands);
    expect(writer.stdout).toContain("start");
    expect(writer.stdout).toContain("stop");
  });

  it("prints 'No commands registered' for empty list", () => {
    const writer = createMockWriter();
    printHelp(writer, "app");
    expect(writer.stdout).toContain("No commands registered");
  });
});

// ─── CLI Writer ────────────────────────────────────────────────────────────

describe("createCLIWriter", () => {
  it("creates a writer with write methods", () => {
    const writer = createCLIWriter();
    expect(typeof writer.write).toBe("function");
    expect(typeof writer.writeLine).toBe("function");
    expect(typeof writer.error).toBe("function");
    expect(typeof writer.errorLine).toBe("function");
  });
});

// ─── ZudojsCLI ────────────────────────────────────────────────────────────

describe("ZudojsCLI", () => {
  it("creates with default options", () => {
    const cli = new ZudojsCLI();
    expect(cli.name).toBe("zudojs");
    expect(cli.version).toBeTruthy();
  });

  it("creates with custom options", () => {
    const cli = new ZudojsCLI({
      name: "my-app",
      version: "2.0.0",
      description: "My application",
    });
    expect(cli.name).toBe("my-app");
    expect(cli.version).toBe("2.0.0");
    expect(cli.description).toBe("My application");
  });

  it("registers commands", () => {
    const cli = new ZudojsCLI();
    const cmd = createCommand({ name: "test", execute: () => {} });
    cli.register(cmd);
    expect(cli.commandCount).toBe(1);
  });

  it("registers multiple commands", () => {
    const cli = new ZudojsCLI();
    cli.registerMany([
      createCommand({ name: "a", execute: () => {} }),
      createCommand({ name: "b", execute: () => {} }),
    ]);
    expect(cli.commandCount).toBe(2);
  });

  it("returns exit code 0 for --help", async () => {
    const cli = new ZudojsCLI();
    const code = await cli.run(["--help"]);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it("returns exit code 0 for --version", async () => {
    const cli = new ZudojsCLI({ version: "1.0.0" });
    const code = await cli.run(["--version"]);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it("returns exit code 0 for no args (shows help)", async () => {
    const cli = new ZudojsCLI();
    const code = await cli.run([]);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it("returns error exit code for unknown command", async () => {
    const cli = new ZudojsCLI();
    const code = await cli.run(["nonexistent"]);
    expect(code).not.toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it("executes a registered command", async () => {
    let executed = false;
    const cli = new ZudojsCLI();
    cli.register(
      createCommand({
        name: "test",
        execute: () => {
          executed = true;
        },
      }),
    );
    const code = await cli.run(["test"]);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(executed).toBe(true);
  });

  it("returns general error for command execution failure", async () => {
    const cli = new ZudojsCLI();
    cli.register(
      createCommand({
        name: "fail",
        execute: () => {
          throw new Error("boom");
        },
      }),
    );
    const code = await cli.run(["fail"]);
    expect(code).toBe(CLI_EXIT_CODES.GENERAL_ERROR);
  });

  it("prevents concurrent runs", async () => {
    const cli = new ZudojsCLI();
    cli.register(
      createCommand({
        name: "slow",
        execute: () => new Promise((r) => setTimeout(r, 100)),
      }),
    );

    // Start first run
    const p1 = cli.run(["slow"]);
    // Try to start second run while first is in progress — should throw
    await expect(cli.run(["slow"])).rejects.toThrow();

    // Wait for first to finish
    await p1;
  });

  it("reports isRunning correctly", async () => {
    const cli = new ZudojsCLI();
    cli.register(
      createCommand({
        name: "slow",
        execute: () => new Promise((r) => setTimeout(r, 50)),
      }),
    );
    expect(cli.isRunning).toBe(false);
    const p = cli.run(["slow"]);
    // Small delay to let it start
    await new Promise((r) => setTimeout(r, 5));
    expect(cli.isRunning).toBe(true);
    await p;
    expect(cli.isRunning).toBe(false);
  });

  it("calls lifecycle hooks", async () => {
    const beforeRun = vi.fn();
    const afterRun = vi.fn();
    const cli = new ZudojsCLI();
    cli.use({ beforeRun, afterRun });
    cli.register(createCommand({ name: "test", execute: () => {} }));
    await cli.run(["test"]);
    expect(beforeRun).toHaveBeenCalled();
    expect(afterRun).toHaveBeenCalled();
  });
});

describe("createCLI", () => {
  it("creates a ZudojsCLI instance", () => {
    const cli = createCLI({ name: "test-app" });
    expect(cli).toBeInstanceOf(ZudojsCLI);
    expect(cli.name).toBe("test-app");
  });
});

// ─── Version Utilities ─────────────────────────────────────────────────────

describe("getCLIVersion", () => {
  it("returns version info", () => {
    const info = getCLIVersion("my-app", "2.0.0");
    expect(info.name).toBe("my-app");
    expect(info.version).toBe("2.0.0");
    expect(info.formatted).toBe("my-app v2.0.0");
  });
});

describe("formatCLIVersion", () => {
  it("formats name and version", () => {
    expect(formatCLIVersion("app", "1.0.0")).toBe("app v1.0.0");
  });
});

describe("getVersionString", () => {
  it("returns the version string", () => {
    expect(getVersionString("3.0.0")).toBe("3.0.0");
  });

  it("returns default version when none given", () => {
    expect(getVersionString()).toBeTruthy();
  });
});

describe("isValidVersion", () => {
  it("accepts valid semver", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
    expect(isValidVersion("2.1.3-beta.1")).toBe(true);
    expect(isValidVersion("1.0.0+build.123")).toBe(true);
  });

  it("rejects invalid versions", () => {
    expect(isValidVersion("v0.0.1")).toBe(false);
    expect(isValidVersion("1.0")).toBe(false);
    expect(isValidVersion("abc")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });
});

describe("parseVersion", () => {
  it("parses a valid version", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses version with prerelease", () => {
    expect(parseVersion("1.0.0-beta.1")).toEqual([1, 0, 0]);
  });

  it("throws for invalid version", () => {
    expect(() => parseVersion("abc")).toThrow(TypeError);
    expect(() => parseVersion("1.0")).toThrow(TypeError);
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns 1 when first is greater", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("returns -1 when first is less", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
  });
});

describe("isCompatibleVersion", () => {
  it("returns true when version >= minimum", () => {
    expect(isCompatibleVersion("2.0.0", "1.0.0")).toBe(true);
    expect(isCompatibleVersion("1.0.0", "1.0.0")).toBe(true);
  });

  it("returns false when version < minimum", () => {
    expect(isCompatibleVersion("0.9.0", "1.0.0")).toBe(false);
  });
});
