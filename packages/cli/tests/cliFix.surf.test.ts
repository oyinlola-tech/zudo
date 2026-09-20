/**
 * zudojs-cli — Surface fixes
 *
 * Regression tests for the CLI surface findings: prompt cancellation,
 * per-command help, option-value parsing, surplus positionals, exit-code
 * preservation, project-name validation, and the constants that had no
 * caller.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clackStub = vi.hoisted(() => {
  const CANCEL = Symbol("test:clack:cancel");
  return { CANCEL, answer: { current: undefined as unknown } };
});

vi.mock("@clack/prompts", () => ({
  isCancel: (value: unknown): boolean => value === clackStub.CANCEL,
  cancel: vi.fn(),
  text: vi.fn(async () => clackStub.answer.current),
  select: vi.fn(async () => clackStub.answer.current),
  confirm: vi.fn(async () => clackStub.answer.current),
  multiselect: vi.fn(async () => clackStub.answer.current),
}));

import * as clack from "@clack/prompts";

import { ZudojsCLI } from "../src/cliApplication/cliApplication.core.js";
import { printCommandHelp } from "../src/cliApplication/cliApplication.help.js";
import { createCommand } from "../src/cliCommand/cliCommand.factory.js";
import { CLIParser } from "../src/cliParser/cliParser.core.js";
import {
  InvalidArgumentsError,
  MissingOptionValueError,
} from "../src/cliError/index.js";
import { normalizeCLIError } from "../src/cliError/cliError.base.js";
import { CommandNotFoundError } from "../src/cliError/cliError.command.js";
import { CLIPermissionError } from "../src/cliError/cliError.execution.js";
import { CLI_EXIT_CODES } from "../src/cliConstant/cliConstant.value.js";
import {
  FEATURE_CHOICES,
  FEATURE_PACKAGES,
  PACKAGE_MANAGER_CHOICES,
  SCHEMATIC_NAMES,
} from "../src/constants/index.js";
import type { CLICommand, CLIWriter } from "../src/cliType/cliType.type.js";

import { cancelled } from "../src/prompts/cancel.prompt.js";
import { promptProjectName } from "../src/prompts/project/project-name.prompt.js";
import { promptProjectType } from "../src/prompts/project/project-type.prompt.js";
import { promptConfirmation } from "../src/prompts/project/confirmation.prompt.js";
import { promptApiStyle } from "../src/prompts/backend/api-style.prompt.js";
import { promptBackendArchitecture } from "../src/prompts/backend/backend-architecture.prompt.js";
import { promptDatabase } from "../src/prompts/backend/database.prompt.js";
import { promptServices } from "../src/prompts/backend/services.prompt.js";
import { promptPackageManager } from "../src/prompts/workspace/package-manager.prompt.js";
import { promptFramework } from "../src/prompts/frontend/framework.prompt.js";
import { promptFrontendArchitecture } from "../src/prompts/frontend/frontend-architecture.prompt.js";
import { promptCapabilities } from "../src/prompts/capabilities/capabilities.prompt.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(CLI_DIR, "src", "bin", "zudojs.ts");
const TSX = join(CLI_DIR, "node_modules", ".bin", "tsx");

interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the real binary in a scratch directory and reports its exit status. */
function runCLI(...args: string[]): RunResult {
  const result = spawnSync(TSX, [BIN, ...args], {
    cwd: tmpdir(),
    encoding: "utf-8",
    timeout: 60_000,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function createMockWriter(): CLIWriter & { stdout: string } {
  return {
    stdout: "",
    write(message: string): void {
      this.stdout += message;
    },
    writeLine(message = ""): void {
      this.stdout += `${message}\n`;
    },
    error(): void {},
    errorLine(): void {},
  };
}

/** Captures everything the application writes to stdout during `run`. */
async function captureRun(
  cli: ZudojsCLI,
  args: readonly string[],
): Promise<{ code: number; stdout: string }> {
  let stdout = "";
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    });
  try {
    const code = await cli.run([...args]);
    return { code, stdout };
  } finally {
    spy.mockRestore();
  }
}

function exampleCLI(): ZudojsCLI {
  const cli = new ZudojsCLI({ name: "zudojs", version: "9.9.9" });
  cli.register(
    createCommand({
      name: "create",
      description: "Create a new Zudojs project",
      arguments: [
        {
          name: "project-name",
          description: "The name of the project to create",
          required: false,
        },
      ],
      options: [
        {
          name: "type",
          short: "t",
          description: "Project type",
          type: "string",
          defaultValue: "backend",
        },
        { name: "port", short: "p", type: "number" },
      ],
      execute: () => {},
    }),
  );
  cli.register(
    createCommand({
      name: "doctor",
      description: "Run diagnostics",
      execute: () => {},
    }),
  );
  return cli;
}

/* -------------------------------------------------------------------------- */
/* CLI-SURF-01 — a cancelled prompt exits 130                                 */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-01: cancelling a prompt exits 130, not 0", () => {
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clackStub.answer.current = clackStub.CANCEL;
    exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    exit.mockRestore();
    vi.clearAllMocks();
  });

  const sites: readonly (readonly [string, () => Promise<unknown>])[] = [
    ["project name", () => promptProjectName()],
    ["project type", () => promptProjectType()],
    ["confirmation", () => promptConfirmation("Continue?")],
    ["api style", () => promptApiStyle()],
    ["backend architecture", () => promptBackendArchitecture()],
    ["database", () => promptDatabase()],
    ["services", () => promptServices()],
    ["package manager", () => promptPackageManager()],
    ["framework", () => promptFramework("fullstack")],
    ["frontend architecture", () => promptFrontendArchitecture()],
    ["capabilities", () => promptCapabilities()],
  ];

  for (const [name, call] of sites) {
    it(`exits ${CLI_EXIT_CODES.INTERRUPTED} when the ${name} prompt is cancelled`, async () => {
      await expect(call()).rejects.toThrow("process.exit:130");
      expect(exit).toHaveBeenCalledWith(CLI_EXIT_CODES.INTERRUPTED);
      expect(exit).not.toHaveBeenCalledWith(0);
    });
  }

  it("returns the answer and never exits when the prompt is answered", async () => {
    clackStub.answer.current = "my-api";
    await expect(promptProjectName()).resolves.toBe("my-api");
    expect(exit).not.toHaveBeenCalled();
  });

  it("routes every prompt through the shared cancelled() helper", () => {
    expect(() => cancelled(clackStub.CANCEL)).toThrow("process.exit:130");
    expect(cancelled("kept")).toBe("kept");
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-03 — per-command help                                             */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-03: `<command> --help` prints command-scoped help", () => {
  it("exits 0 for --help and -h on a registered command", async () => {
    for (const flag of ["--help", "-h"]) {
      const result = await captureRun(exampleCLI(), ["create", flag]);
      expect(result.code).toBe(CLI_EXIT_CODES.SUCCESS);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("zudojs create");
    }
  });

  it("lists the command's arguments, options, shorts and defaults", () => {
    const writer = createMockWriter();
    const command = exampleCLI().commands.resolve("create") as CLICommand;
    printCommandHelp(writer, "zudojs", command);

    expect(writer.stdout).toContain("Arguments:");
    expect(writer.stdout).toContain("project-name");
    expect(writer.stdout).toContain("The name of the project to create");
    expect(writer.stdout).toContain("-t, --type <string>");
    expect(writer.stdout).toContain("(default: backend)");
    expect(writer.stdout).toContain("-h, --help");
  });

  it("does not hand --help to the parser as an unknown option", () => {
    expect(runCLI("create", "--help").status).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(runCLI("generate", "-h").status).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(runCLI("doctor", "--help").status).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it("names the positional so `--project-name` is not guessed", () => {
    const help = runCLI("create", "--help").stdout;
    expect(help).toContain("Arguments:");
    expect(help).toContain("project-name");
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-12 — `help <command>` and a flag-only invocation                   */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-12: `help <command>` and flag-only invocations", () => {
  it("routes `help create` to the command-scoped block", async () => {
    const viaHelp = await captureRun(exampleCLI(), ["help", "create"]);
    const viaFlag = await captureRun(exampleCLI(), ["create", "--help"]);
    expect(viaHelp.code).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(viaHelp.stdout).toBe(viaFlag.stdout);
    expect(viaHelp.stdout).toContain("Arguments:");
  });

  it("reports an unknown help target instead of printing global help", async () => {
    const result = await captureRun(exampleCLI(), ["help", "bogus"]);
    expect(result.code).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
  });

  it('says "No command given" when the first token is a flag', () => {
    const result = runCLI("-vh");
    expect(result.status).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.stderr).toContain("No command given.");
    expect(result.stderr).not.toContain('"-vh"');
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-08 — an option value may not be another flag                      */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-08: a flag is not swallowed as an option value", () => {
  const command: CLICommand = {
    name: "create",
    options: [
      { name: "type", short: "t", type: "string" },
      { name: "frontend", short: "f", type: "string" },
      { name: "port", short: "p", type: "number" },
    ],
    execute: () => {},
  };

  it("refuses `--type --frontend react` and names --type", () => {
    const parser = new CLIParser();
    expect(() =>
      parser.parse(["--type", "--frontend", "react"], command),
    ).toThrow(MissingOptionValueError);
    expect(() =>
      parser.parse(["--type", "--frontend", "react"], command),
    ).toThrow(/"--type"/);
  });

  it("refuses `-t -f react` and names -t", () => {
    const parser = new CLIParser();
    expect(() => parser.parse(["-t", "-f", "react"], command)).toThrow(
      MissingOptionValueError,
    );
  });

  it("keeps `--port=-1` and `--port -1` working for numeric options", () => {
    const parser = new CLIParser();
    expect(parser.parse(["--port=-1"], command).options.port).toBe(-1);
    expect(parser.parse(["--port", "-1"], command).options.port).toBe(-1);
    expect(parser.parse(["-p", "-1"], command).options.port).toBe(-1);
  });

  it("still rejects a flag where a number is expected", () => {
    const parser = new CLIParser();
    expect(() => parser.parse(["--port", "--type"], command)).toThrow(
      MissingOptionValueError,
    );
  });

  it("exits 2 from the binary rather than mis-assigning the value", () => {
    const result = runCLI("create", "--type", "--frontend", "react");
    expect(result.status).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.stderr).toContain('"--type"');
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-11 — surplus positionals are reported                              */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-11: commands with no arguments reject surplus positionals", () => {
  it("throws for a command that declares no arguments", () => {
    const parser = new CLIParser();
    const doctor: CLICommand = { name: "doctor", execute: () => {} };
    expect(() => parser.parse(["my-proj"], doctor)).toThrow(
      InvalidArgumentsError,
    );
    expect(() => parser.parse(["my-proj"], doctor)).toThrow(/my-proj/);
  });

  it("does not run the command and exits non-zero", async () => {
    let ran = false;
    const cli = new ZudojsCLI({ name: "zudojs" });
    cli.register(
      createCommand({
        name: "doctor",
        execute: () => {
          ran = true;
        },
      }),
    );
    const code = await cli.run(["doctor", "my-proj"]);
    expect(code).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(ran).toBe(false);
  });

  it("still parses a bare command with no positionals", async () => {
    let ran = false;
    const cli = new ZudojsCLI({ name: "zudojs" });
    cli.register(
      createCommand({
        name: "doctor",
        execute: () => {
          ran = true;
        },
      }),
    );
    expect(await cli.run(["doctor"])).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(ran).toBe(true);
  });

  it("leaves a command-less parse alone", () => {
    const parser = new CLIParser();
    expect(() => parser.parse(["start", "extra"])).not.toThrow();
  });

  it("keeps the `--` pass-through usable", () => {
    const parser = new CLIParser();
    const doctor: CLICommand = { name: "doctor", execute: () => {} };
    const result = parser.parse(["--", "--inspect"], doctor);
    expect(result.args).toEqual(["--inspect"]);
  });

  it("reports the discarded argument from the binary", () => {
    const result = runCLI("doctor", "my-proj");
    expect(result.status).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.stderr).toContain("my-proj");
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-09 — declared exit codes survive normalization                     */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-09: exit codes declared by errors reach the shell", () => {
  it("preserves COMMAND_NOT_FOUND (3)", () => {
    expect(normalizeCLIError(new CommandNotFoundError("nope")).exitCode).toBe(
      CLI_EXIT_CODES.COMMAND_NOT_FOUND,
    );
  });

  it("preserves PERMISSION_DENIED (4)", () => {
    expect(normalizeCLIError(new CLIPermissionError()).exitCode).toBe(
      CLI_EXIT_CODES.PERMISSION_DENIED,
    );
  });

  it("preserves a numeric exitCode on any error that carries one", () => {
    const error = Object.assign(new Error("interrupted"), { exitCode: 130 });
    expect(normalizeCLIError(error).exitCode).toBe(
      CLI_EXIT_CODES.INTERRUPTED,
    );
  });

  it("falls back to GENERAL_ERROR for a plain error", () => {
    expect(normalizeCLIError(new Error("boom")).exitCode).toBe(
      CLI_EXIT_CODES.GENERAL_ERROR,
    );
    const bogus = Object.assign(new Error("boom"), { exitCode: "nope" });
    expect(normalizeCLIError(bogus).exitCode).toBe(
      CLI_EXIT_CODES.GENERAL_ERROR,
    );
  });

  it("returns 3 from run() for an unknown command", async () => {
    const cli = exampleCLI();
    expect(await cli.run(["nope"])).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
  });

  it("returns 3 from the binary for an unknown command", () => {
    expect(runCLI("nope").status).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-06 — project names may not start with a hyphen                     */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-06: the project-name prompt rejects a leading hyphen", () => {
  beforeEach(() => {
    clackStub.answer.current = "my-api";
    vi.clearAllMocks();
  });

  async function validator(): Promise<
    (value: string | undefined) => string | undefined
  > {
    await promptProjectName();
    const options = vi.mocked(clack.text).mock.calls[0]?.[0] as {
      validate: (value: string | undefined) => string | undefined;
    };
    return options.validate;
  }

  it("rejects names starting with '-'", async () => {
    const validate = await validator();
    expect(validate("-dash")).toBeTruthy();
    expect(validate("--dash")).toBeTruthy();
  });

  it("accepts ordinary names", async () => {
    const validate = await validator();
    expect(validate("my-api")).toBeUndefined();
    expect(validate("api_2")).toBeUndefined();
    expect(validate("9lives")).toBeUndefined();
  });

  it("still rejects empty names and illegal characters", async () => {
    const validate = await validator();
    expect(validate("")).toBeTruthy();
    expect(validate("my api")).toBeTruthy();
    expect(validate("my/api")).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* CLI-SURF-10 — the unused constant groups now have callers                   */
/* -------------------------------------------------------------------------- */

describe("CLI-SURF-10: constants are wired and correct", () => {
  beforeEach(() => {
    clackStub.answer.current = "pnpm";
    vi.clearAllMocks();
  });

  it("offers bun in the package-manager prompt", async () => {
    await promptPackageManager();
    const options = vi.mocked(clack.select).mock.calls[0]?.[0] as {
      options: readonly { value: string }[];
    };
    expect(options.options.map((choice) => choice.value)).toEqual([
      "pnpm",
      "npm",
      "yarn",
      "bun",
    ]);
    expect(PACKAGE_MANAGER_CHOICES.map((choice) => choice.value)).toContain(
      "bun",
    );
  });

  it("derives the feature list from FEATURE_PACKAGES", () => {
    expect(FEATURE_CHOICES.map((choice) => choice.value)).toEqual(
      Object.keys(FEATURE_PACKAGES),
    );
  });

  it("lists every schematic `generate` accepts", () => {
    expect(SCHEMATIC_NAMES).toHaveLength(13);
    const help = runCLI("generate", "--help").stdout;
    for (const schematic of SCHEMATIC_NAMES) {
      expect(help).toContain(schematic);
    }
    expect(help).toContain("--module");
  });

  it("lists every feature `add` accepts", () => {
    const help = runCLI("add", "--help").stdout;
    for (const feature of Object.keys(FEATURE_PACKAGES)) {
      expect(help).toContain(feature);
    }
  });

  it("prints the help labels from CLI_HELP", async () => {
    const { stdout } = await captureRun(exampleCLI(), ["--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("Commands:");
    expect(stdout).toContain("Options:");
  });
});
