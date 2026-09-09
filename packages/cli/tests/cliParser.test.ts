/**
 * zudojs-cli — CLI Parser Tests
 *
 * Tests for CLIParser, long/short option parsing, and helper utilities.
 */

import { describe, it, expect } from "vitest";

import { CLIParser } from "../src/cliParser/cliParser.core.js";
import {
  parseCLIArguments,
  parseOptionValue,
  parseBoolean,
  isOption,
  isLongOption,
  isShortOption,
  resolveCommand,
  normalizeCLIValue,
} from "../src/cliParser/cliParser.helper.js";
import {
  findOption,
  assignOptionValue,
} from "../src/cliParser/cliParser.longOption.js";
import { InvalidArgumentsError } from "../src/cliError/cliError.argument.js";
import {
  InvalidOptionError,
  MissingOptionValueError,
} from "../src/cliError/cliError.option.js";
import type { CLICommand, CLIOption } from "../src/cliType/cliType.type.js";

// ─── CLIParser ─────────────────────────────────────────────────────────────

describe("CLIParser", () => {
  const parser = new CLIParser({ allowUnknownOptions: true });

  it("parses a single command", () => {
    const result = parser.parse(["start"]);
    expect(result.command).toBe("start");
    expect(result.commands).toEqual(["start"]);
  });

  it("parses multiple tokens with command first", () => {
    const result = parser.parse(["deploy", "--force"]);
    expect(result.command).toBe("deploy");
    expect(result.options).toEqual({ force: true });
  });

  it("parses long options with values", () => {
    const result = parser.parse(["--port", "3000"]);
    expect(result.options).toEqual({ port: "3000" });
  });

  it("parses --option=value syntax", () => {
    const result = parser.parse(["--port=3000"]);
    expect(result.options).toEqual({ port: "3000" });
  });

  it("parses boolean long options", () => {
    const result = parser.parse(["--verbose"]);
    expect(result.options).toEqual({ verbose: true });
  });

  it("parses --no- prefix for negation with definition", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "color", type: "boolean" }],
      execute: () => {},
    };
    const result = parser.parse(["--no-color"], command);
    expect(result.options).toEqual({ color: false });
  });

  it("parses short options", () => {
    const result = parser.parse(["-v"]);
    expect(result.options).toEqual({ v: true });
  });

  it("parses short option with value via command definition", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "port", short: "p", type: "string" }],
      execute: () => {},
    };
    const strictParser = new CLIParser();
    const result = strictParser.parse(["-p", "3000"], command);
    expect(result.options).toEqual({ port: "3000" });
  });

  it("parses grouped short boolean options via definition", () => {
    const command: CLICommand = {
      name: "test",
      options: [
        { name: "all", short: "a", type: "boolean" },
        { name: "brief", short: "b", type: "boolean" },
        { name: "color", short: "c", type: "boolean" },
      ],
      execute: () => {},
    };
    const strictParser = new CLIParser();
    const result = strictParser.parse(["-abc"], command);
    expect(result.options).toEqual({ all: true, brief: true, color: true });
  });

  it("stops at -- separator", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "verbose", type: "boolean" }],
      execute: () => {},
    };
    const strictParser = new CLIParser();
    const result = strictParser.parse(
      ["--verbose", "--", "--not-parsed"],
      command,
    );
    expect(result.args).toEqual(["--not-parsed"]);
  });

  it("handles empty args", () => {
    const result = parser.parse([]);
    expect(result.command).toBeUndefined();
    expect(result.commands).toEqual([]);
  });

  it("works with a command definition for typed options", () => {
    const command: CLICommand = {
      name: "serve",
      options: [
        { name: "port", short: "p", type: "number" },
        { name: "verbose", type: "boolean" },
      ],
      execute: () => {},
    };
    const result = parser.parse(["--port", "8080", "--verbose"], command);
    expect(result.options.port).toBe(8080);
    expect(result.options.verbose).toBe(true);
  });

  it("rejects unknown options when not allowed", () => {
    const strictParser = new CLIParser();
    expect(() => strictParser.parse(["--unknown"])).toThrow(InvalidOptionError);
  });

  it("allows unknown options when configured", () => {
    const lenient = new CLIParser({ allowUnknownOptions: true });
    const result = lenient.parse(["--unknown", "value"]);
    expect(result.options).toEqual({ unknown: "value" });
  });
});

// ─── Parser with typed command ─────────────────────────────────────────────

describe("CLIParser with argument definitions", () => {
  it("maps positional arguments to named definitions", () => {
    const command: CLICommand = {
      name: "cp",
      arguments: [
        { name: "source", required: true },
        { name: "dest", required: true },
      ],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse(["src.ts", "dest.ts"], command);
    expect(result.options.source).toBe("src.ts");
    expect(result.options.dest).toBe("dest.ts");
  });

  it("throws for missing required arguments", () => {
    const command: CLICommand = {
      name: "cp",
      arguments: [{ name: "source", required: true }],
      execute: () => {},
    };
    const parser = new CLIParser();
    expect(() => parser.parse([], command)).toThrow(InvalidArgumentsError);
  });

  it("handles variadic arguments", () => {
    const command: CLICommand = {
      name: "cat",
      arguments: [{ name: "files", variadic: true }],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse(["a.ts", "b.ts", "c.ts"], command);
    expect(result.options.files).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("uses default values for missing optional arguments", () => {
    const command: CLICommand = {
      name: "run",
      arguments: [{ name: "env", defaultValue: "dev" }],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse([], command);
    expect(result.options.env).toBe("dev");
  });
});

// ─── parseBoolean ──────────────────────────────────────────────────────────

describe("parseBoolean", () => {
  it("parses true-like values", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
    expect(parseBoolean("yes")).toBe(true);
    expect(parseBoolean("on")).toBe(true);
    expect(parseBoolean("TRUE")).toBe(true);
    expect(parseBoolean("Yes")).toBe(true);
  });

  it("parses false-like values", () => {
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("0")).toBe(false);
    expect(parseBoolean("no")).toBe(false);
    expect(parseBoolean("off")).toBe(false);
  });

  it("throws for invalid boolean values", () => {
    expect(() => parseBoolean("maybe")).toThrow(InvalidArgumentsError);
    expect(() => parseBoolean("abc")).toThrow(InvalidArgumentsError);
  });
});

// ─── parseOptionValue ──────────────────────────────────────────────────────

describe("parseOptionValue", () => {
  it("parses string type", () => {
    const def: CLIOption = { name: "name", type: "string" };
    expect(parseOptionValue(def, "hello")).toBe("hello");
  });

  it("parses number type", () => {
    const def: CLIOption = { name: "port", type: "number" };
    expect(parseOptionValue(def, "3000")).toBe(3000);
  });

  it("throws for non-numeric number value", () => {
    const def: CLIOption = { name: "port", type: "number" };
    expect(() => parseOptionValue(def, "abc")).toThrow(InvalidArgumentsError);
  });

  it("parses boolean type", () => {
    const def: CLIOption = { name: "verbose", type: "boolean" };
    expect(parseOptionValue(def, "true")).toBe(true);
    expect(parseOptionValue(def, "false")).toBe(false);
  });
});

// ─── Token Classification ──────────────────────────────────────────────────

describe("isOption", () => {
  it("identifies options", () => {
    expect(isOption("--verbose")).toBe(true);
    expect(isOption("-v")).toBe(true);
  });

  it("rejects non-options", () => {
    expect(isOption("start")).toBe(false);
    expect(isOption("--")).toBe(false);
    expect(isOption("-")).toBe(false);
  });
});

describe("isLongOption", () => {
  it("identifies long options", () => {
    expect(isLongOption("--verbose")).toBe(true);
    expect(isLongOption("--port=3000")).toBe(true);
  });

  it("rejects short options and non-options", () => {
    expect(isLongOption("-v")).toBe(false);
    expect(isLongOption("--")).toBe(false);
    expect(isLongOption("start")).toBe(false);
  });
});

describe("isShortOption", () => {
  it("identifies short options", () => {
    expect(isShortOption("-v")).toBe(true);
    expect(isShortOption("-abc")).toBe(true);
  });

  it("rejects long options and non-options", () => {
    expect(isShortOption("--verbose")).toBe(false);
    expect(isShortOption("-")).toBe(false);
    expect(isShortOption("start")).toBe(false);
  });
});

// ─── resolveCommand ────────────────────────────────────────────────────────

describe("resolveCommand", () => {
  const commands: CLICommand[] = [
    { name: "start", execute: () => {} },
    { name: "stop", aliases: ["-s"], execute: () => {} },
  ];

  it("resolves by name", () => {
    expect(resolveCommand(commands, "start")?.name).toBe("start");
  });

  it("resolves by alias", () => {
    expect(resolveCommand(commands, "-s")?.name).toBe("stop");
  });

  it("returns undefined for unknown", () => {
    expect(resolveCommand(commands, "unknown")).toBeUndefined();
  });

  it("trims whitespace", () => {
    expect(resolveCommand(commands, "  start  ")?.name).toBe("start");
  });
});

// ─── normalizeCLIValue ─────────────────────────────────────────────────────

describe("normalizeCLIValue", () => {
  it("passes through strings", () => {
    expect(normalizeCLIValue("hello")).toBe("hello");
  });

  it("passes through numbers", () => {
    expect(normalizeCLIValue(42)).toBe(42);
  });

  it("passes through booleans", () => {
    expect(normalizeCLIValue(true)).toBe(true);
    expect(normalizeCLIValue(false)).toBe(false);
  });

  it("passes through undefined", () => {
    expect(normalizeCLIValue(undefined)).toBeUndefined();
  });

  it("converts objects to strings", () => {
    expect(normalizeCLIValue({ foo: "bar" })).toBe("[object Object]");
  });
});

// ─── parseCLIArguments convenience ─────────────────────────────────────────

describe("parseCLIArguments", () => {
  it("parses arguments without a parser instance", () => {
    const result = parseCLIArguments(["start", "--verbose"], undefined, {
      allowUnknownOptions: true,
    });
    expect(result.command).toBe("start");
    expect(result.options.verbose).toBe(true);
  });

  it("accepts parser options", () => {
    const result = parseCLIArguments(["--unknown"], undefined, {
      allowUnknownOptions: true,
    });
    expect(result.options.unknown).toBe(true);
  });
});

// ─── Long Option Edge Cases ────────────────────────────────────────────────

describe("Long option edge cases", () => {
  it("handles --option=value with equals", () => {
    const parser = new CLIParser({ allowUnknownOptions: true });
    const result = parser.parse(["--name=hello"]);
    expect(result.options.name).toBe("hello");
  });

  it("handles --no- prefix with definitions", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "color", type: "boolean" }],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse(["--no-color"], command);
    expect(result.options.color).toBe(false);
  });

  it("throws MissingOptionValueError when value needed", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "port", type: "number" }],
      execute: () => {},
    };
    const parser = new CLIParser();
    expect(() => parser.parse(["--port"], command)).toThrow(
      MissingOptionValueError,
    );
  });
});

// ─── Short Option Edge Cases ───────────────────────────────────────────────

describe("Short option edge cases", () => {
  it("handles -p3000 attached value syntax", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "port", short: "p", type: "number" }],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse(["-p3000"], command);
    expect(result.options.port).toBe(3000);
  });

  it("handles mixed grouped booleans with value", () => {
    const command: CLICommand = {
      name: "test",
      options: [
        { name: "verbose", short: "v", type: "boolean" },
        { name: "port", short: "p", type: "number" },
      ],
      execute: () => {},
    };
    const parser = new CLIParser();
    const result = parser.parse(["-vp", "8080"], command);
    expect(result.options.verbose).toBe(true);
    expect(result.options.port).toBe(8080);
  });

  it("rejects unknown short options", () => {
    const parser = new CLIParser();
    expect(() => parser.parse(["-z"])).toThrow(InvalidOptionError);
  });

  it("throws MissingOptionValueError for missing value", () => {
    const command: CLICommand = {
      name: "test",
      options: [{ name: "port", short: "p", type: "number" }],
      execute: () => {},
    };
    const parser = new CLIParser();
    expect(() => parser.parse(["-p"], command)).toThrow(
      MissingOptionValueError,
    );
  });
});

// ─── findOption ────────────────────────────────────────────────────────────

describe("findOption", () => {
  const defs: CLIOption[] = [
    { name: "verbose", short: "v", type: "boolean" },
    { name: "port", short: "p", type: "number" },
  ];

  it("finds by name", () => {
    expect(findOption("verbose", defs)?.name).toBe("verbose");
  });

  it("finds by short form", () => {
    expect(findOption("p", defs)?.name).toBe("port");
  });

  it("returns undefined for unknown", () => {
    expect(findOption("unknown", defs)).toBeUndefined();
  });
});

// ─── assignOptionValue ─────────────────────────────────────────────────────

describe("assignOptionValue", () => {
  it("assigns a single value", () => {
    const values: Record<string, unknown> = {};
    const def: CLIOption = { name: "port", type: "number" };
    assignOptionValue(def, "3000", values);
    expect(values.port).toBe(3000);
  });

  it("collects multiple values when multiple=true", () => {
    const values: Record<string, unknown> = {};
    const def: CLIOption = { name: "file", type: "string", multiple: true };
    assignOptionValue(def, "a.ts", values);
    assignOptionValue(def, "b.ts", values);
    expect(values.file).toEqual(["a.ts", "b.ts"]);
  });

  it("handles first value when multiple=true", () => {
    const values: Record<string, unknown> = {};
    const def: CLIOption = { name: "file", type: "string", multiple: true };
    assignOptionValue(def, "a.ts", values);
    expect(values.file).toEqual(["a.ts"]);
  });
});
