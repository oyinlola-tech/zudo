/**
 * How the CLI reads its own invocation: the `zudo` / `zudojs` name, the
 * `new` alias, where the command sits, the hints under a usage error, the
 * escaping of echoed input, and parser hardening.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ZudojsCLI } from "../src/cliApplication/cliApplication.core.js";
import { createCommand } from "../src/cliCommand/index.js";
import { CLIParser } from "../src/cliParser/index.js";
import {
  escapeControlCharacters,
  localizeCommandName,
  resolveInvokedName,
  suggestCommand,
} from "../src/cliApplication/invocation/index.js";
import { CLI_EXIT_CODES } from "../src/cliConstant/cliConstant.value.js";
import type { CLICommand, CLIWriter } from "../src/cliType/cliType.type.js";

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly ran: readonly string[];
}

/** Builds an app with `create (new)`, `dev (d)` and `info`, then runs it. */
async function run(name: string, args: readonly string[]): Promise<Captured> {
  const ran: string[] = [];
  const cli = new ZudojsCLI({ name, version: "1.2.3" });
  const writer = cli.writer as CLIWriter;
  let stdout = "";
  let stderr = "";
  Object.assign(writer, {
    write: (m: string) => void (stdout += m),
    writeLine: (m = "") => void (stdout += `${m}\n`),
    error: (m: string) => void (stderr += m),
    errorLine: (m = "") => void (stderr += `${m}\n`),
  });
  const record = (id: string): CLICommand["execute"] => () => {
    ran.push(id);
  };
  cli.register(
    createCommand({
      name: "create",
      aliases: ["new"],
      arguments: [{ name: "project-name", required: true }],
      options: [{ name: "type", short: "t", type: "string" }],
      execute: record("create"),
    }),
  );
  cli.register(
    createCommand({
      name: "dev",
      aliases: ["d"],
      options: [{ name: "port", short: "p", type: "number" }],
      execute: record("dev"),
    }),
  );
  cli.register(createCommand({ name: "info", execute: record("info") }));
  const code = await cli.run([...args]);
  return { code, stdout, stderr, ran };
}

describe("invoked name", () => {
  it("reads zudo and zudojs from the script path, with any extension", () => {
    expect(resolveInvokedName("/usr/local/bin/zudo")).toBe("zudo");
    expect(resolveInvokedName("/usr/local/bin/zudojs")).toBe("zudojs");
    expect(resolveInvokedName("C:\\npm\\zudo.cmd")).toBe("zudo");
    expect(resolveInvokedName("/x/dist/src/bin/zudojs.js")).toBe("zudojs");
  });

  it("falls back to zudojs for anything else", () => {
    expect(resolveInvokedName(undefined)).toBe("zudojs");
    expect(resolveInvokedName("/x/index.js")).toBe("zudojs");
    expect(resolveInvokedName("/x/zudo-evil")).toBe("zudojs");
  });

  it("answers to zudojs for the zudojs-cli bin (npx zudojs-cli)", () => {
    expect(resolveInvokedName("/usr/local/bin/zudojs-cli")).toBe("zudojs");
    expect(resolveInvokedName("C:\\npm\\zudojs-cli.cmd")).toBe("zudojs");
  });

  it("rewrites command examples only", () => {
    const words = ["create", "dev"];
    expect(
      localizeCommandName("Run `zudojs create` first.", "zudo", words),
    ).toBe("Run `zudo create` first.");
    const prose =
      "npm i -g zudojs-cli; @zudojs/core; the zudojs block in package.json";
    expect(localizeCommandName(prose, "zudo", words)).toBe(prose);
    expect(localizeCommandName("zudojs create", "zudojs", words)).toBe(
      "zudojs create",
    );
  });

  it("shows the typed name in help, usage and errors", async () => {
    const help = await run("zudo", ["--help"]);
    expect(help.stdout).toContain("zudo <command> [options]");
    expect(help.stdout).toContain("create (new)");
    const usage = await run("zudo", ["new", "--help"]);
    expect(usage.stdout).toContain("zudo create <project-name> [options]");
    const missing = await run("zudo", ["new"]);
    expect(missing.stderr).toContain('Run "zudo create --help" for usage.');
  });
});

describe("`new` alias", () => {
  it("runs create", async () => {
    const result = await run("zudojs", ["new", "my-api"]);
    expect(result.code).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(result.ran).toEqual(["create"]);
  });

  it("reports a missing project name as a usage error", async () => {
    const result = await run("zudojs", ["new"]);
    expect(result.code).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.ran).toEqual([]);
  });
});

describe("command location", () => {
  it("does not skip a mistyped command to run a later one", async () => {
    const result = await run("zudo", ["creat", "dev"]);
    expect(result.code).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
    expect(result.ran).toEqual([]);
    expect(result.stderr).toContain('Did you mean "zudo create"?');
    expect(result.stderr).toContain('Run "zudo --help" to see all commands.');
  });

  it("rejects options placed before the command", async () => {
    const result = await run("zudo", ["--verbose", "info"]);
    expect(result.code).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.ran).toEqual([]);
    expect(result.stderr).toContain('"zudo info --verbose"');
  });

  it("keeps `No command given` for a flag-only line", async () => {
    const result = await run("zudo", ["-vh"]);
    expect(result.code).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.stderr).toContain("No command given.");
  });

  it("rejects arguments after --version", async () => {
    const result = await run("zudo", ["--version", "extra"]);
    expect(result.code).toBe(CLI_EXIT_CODES.INVALID_ARGUMENTS);
    expect(result.stdout).toBe("");
    expect((await run("zudo", ["--version"])).stdout).toBe("1.2.3\n");
  });

  it("does not treat --help after -- as a help request", async () => {
    const result = await run("zudo", ["create", "--", "--help"]);
    expect(result.code).toBe(CLI_EXIT_CODES.SUCCESS);
    expect(result.ran).toEqual(["create"]);
  });

  it("suggests aliases and ignores one-letter ones", () => {
    const commands = [
      { name: "create", aliases: ["new"], execute: () => {} },
      { name: "build", aliases: ["b"], execute: () => {} },
    ];
    expect(suggestCommand("nwe", commands)).toBe("new");
    expect(suggestCommand("buidl", commands)).toBe("build");
    expect(suggestCommand("bx", commands)).toBeUndefined();
  });
});

describe("echoed input", () => {
  it("escapes terminal control sequences in error output", async () => {
    const hostile = "\u001B]0;pwned\u0007\u001B[31mred\u202E";
    const result = await run("zudo", [hostile]);
    expect(result.code).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
    expect(result.stderr).not.toContain("\u001B");
    expect(result.stderr).not.toContain("\u202E");
    expect(result.stderr).toContain("\\x1b]0;pwned\\x07\\x1b[31mred\\u202e");
  });

  it("keeps newlines and tabs", () => {
    expect(escapeControlCharacters("a\n\tb")).toBe("a\n\tb");
  });
});

describe("parser hardening", () => {
  const dev: CLICommand = {
    name: "dev",
    options: [{ name: "port", type: "number" }],
    execute: () => {},
  };

  it.each(["--port=", "--port= ", "--port=Infinity", "--port=abc"])(
    "rejects %s instead of reading it as a number",
    (token) => {
      expect(() => new CLIParser().parse([token], dev)).toThrow(
        /expects a number/,
      );
    },
  );

  it("still accepts negative and decimal numbers", () => {
    expect(new CLIParser().parse(["--port", "-1"], dev).options.port).toBe(-1);
    expect(new CLIParser().parse(["--port=8.5"], dev).options.port).toBe(8.5);
  });

  it.each(["--__proto__", "--__proto__=x", "--constructor", "--prototype"])(
    "refuses %s even when unknown options are allowed",
    (token) => {
      const parser = new CLIParser({ allowUnknownOptions: true });
      expect(() => parser.parse([token], dev)).toThrow(/invalid option/i);
    },
  );

  it("keeps the last value of a repeated flag and the prototype clean", () => {
    const parsed = new CLIParser().parse(["--port=1", "--port=2"], dev);
    expect(parsed.options.port).toBe(2);
    expect(({} as Record<string, unknown>).port).toBeUndefined();
  });
});

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_BIN = join(CLI_DIR, "dist", "src", "bin", "zudojs.js");

describe.skipIf(!existsSync(DIST_BIN))("built binary", () => {
  it("answers as `zudo` through a symlink and prints help off a TTY", () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-bin-"));
    try {
      const link = join(dir, "zudo");
      symlinkSync(DIST_BIN, link);
      const help = spawnSync(process.execPath, [link], {
        cwd: dir,
        encoding: "utf-8",
      });
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("zudo <command> [options]");
      const typo = spawnSync(process.execPath, [link, "creat"], {
        cwd: dir,
        encoding: "utf-8",
      });
      expect(typo.status).toBe(CLI_EXIT_CODES.COMMAND_NOT_FOUND);
      expect(typo.stderr).toContain('Did you mean "zudo create"?');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
