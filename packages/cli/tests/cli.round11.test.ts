/**
 * zudojs-cli — Audit round 11 regression tests.
 */

import { describe, it, expect } from "vitest";

import { CLIParser } from "../src/cliParser/cliParser.core.js";

describe("TOOL-05 — stopAtFirstArgument keeps the first positional out of commands", () => {
  it("reports no command and every token as an argument", () => {
    const parsed = new CLIParser({ stopAtFirstArgument: true }).parse([
      "build",
      "x",
    ]);

    expect(parsed.command).toBeUndefined();
    expect(parsed.commands).toEqual([]);
    expect(parsed.args).toEqual(["build", "x"]);
  });

  it("holds for a single positional token", () => {
    const parsed = new CLIParser({ stopAtFirstArgument: true }).parse([
      "build",
    ]);

    expect(parsed.command).toBeUndefined();
    expect(parsed.commands).toEqual([]);
    expect(parsed.args).toEqual(["build"]);
  });

  it("holds when options precede the positional", () => {
    const parsed = new CLIParser({
      stopAtFirstArgument: true,
      allowUnknownOptions: true,
    }).parse(["--verbose=true", "build", "x"]);

    expect(parsed.commands).toEqual([]);
    expect(parsed.args).toEqual(["build", "x"]);
    expect(parsed.options["verbose"]).toBe("true");
  });

  it("still treats the first positional as the command by default", () => {
    const parsed = new CLIParser().parse(["build", "x"]);

    expect(parsed.command).toBe("build");
    expect(parsed.commands).toEqual(["build"]);
    expect(parsed.args).toEqual(["x"]);
  });

  it("leaves the allowUnknownCommands fallback intact by default", () => {
    const parsed = new CLIParser({ allowUnknownCommands: false }).parse([
      "deploy",
    ]);

    expect(parsed.command).toBe("deploy");
    expect(parsed.commands).toEqual(["deploy"]);
  });
});
