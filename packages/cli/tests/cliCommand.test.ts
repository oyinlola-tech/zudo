/**
 * zudojs-cli — CLI Command Tests
 *
 * Tests for CLICommandRegistry, CLICommandBuilder, createCommand,
 * command factory, validateCommand, and sortCommands.
 */

import { describe, it, expect } from "vitest";

import { CLICommandRegistry } from "../src/cliCommand/cliCommand.registry.js";
import { CLICommandBuilder } from "../src/cliCommand/cliCommand.builder.js";
import {
  createCommand,
  command,
  executeCommand,
} from "../src/cliCommand/cliCommand.factory.js";
import {
  validateCommand,
  isCLICommand,
  sortCommands,
} from "../src/cliCommand/cliCommand.validator.js";
import {
  DuplicateCommandError,
  InvalidCommandNameError,
} from "../src/cliError/index.js";
import type { CLICommand, CLIContext } from "../src/cliType/cliType.type.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function createTestCommand(
  name: string,
  options?: Partial<CLICommand>,
): CLICommand {
  return createCommand({
    name,
    execute: () => {},
    ...options,
  });
}

function createDummyContext(overrides?: Partial<CLIContext>): CLIContext {
  return {
    args: [],
    values: {},
    cwd: "/tmp",
    env: {},
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      trace: () => {},
      fatal: () => {},
      child: () => ({}) as any,
      level: 3,
      flush: () => {},
    } as any,
    ...overrides,
  };
}

// ─── CLICommandRegistry ────────────────────────────────────────────────────

describe("CLICommandRegistry", () => {
  it("registers a single command", () => {
    const registry = new CLICommandRegistry();
    const cmd = createTestCommand("start");
    registry.register(cmd);
    expect(registry.size).toBe(1);
    expect(registry.has("start")).toBe(true);
  });

  it("registers multiple commands", () => {
    const registry = new CLICommandRegistry();
    registry.registerMany([
      createTestCommand("start"),
      createTestCommand("stop"),
    ]);
    expect(registry.size).toBe(2);
  });

  it("resolves command by name", () => {
    const registry = new CLICommandRegistry();
    const cmd = createTestCommand("start");
    registry.register(cmd);
    expect(registry.resolve("start")).toBe(cmd);
  });

  it("resolves command by alias", () => {
    const registry = new CLICommandRegistry();
    const cmd = createTestCommand("start", { aliases: ["-s"] });
    registry.register(cmd);
    expect(registry.resolve("-s")).toBe(cmd);
  });

  it("returns undefined for unknown name", () => {
    const registry = new CLICommandRegistry();
    expect(registry.resolve("unknown")).toBeUndefined();
  });

  it("throws DuplicateCommandError for duplicate name", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("start"));
    expect(() => registry.register(createTestCommand("start"))).toThrow(
      DuplicateCommandError,
    );
  });

  it("throws DuplicateCommandError for alias collision with name", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("start"));
    registry.register(createTestCommand("stop", { aliases: ["go"] }));
    expect(() => registry.register(createTestCommand("go"))).toThrow(
      DuplicateCommandError,
    );
  });

  it("unregisters a command", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("start"));
    expect(registry.unregister("start")).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.has("start")).toBe(false);
  });

  it("returns false for unregistering unknown command", () => {
    const registry = new CLICommandRegistry();
    expect(registry.unregister("unknown")).toBe(false);
  });

  it("unregisters via alias", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("start", { aliases: ["-s"] }));
    expect(registry.unregister("-s")).toBe(true);
    expect(registry.size).toBe(0);
  });

  it("lists all commands", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("a"));
    registry.register(createTestCommand("b"));
    expect(registry.list()).toHaveLength(2);
  });

  it("returns command names", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("a"));
    registry.register(createTestCommand("b"));
    expect(registry.names()).toEqual(["a", "b"]);
  });

  it("returns alias map", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("start", { aliases: ["-s"] }));
    const map = registry.aliasesMap();
    expect(map.get("-s")).toBe("start");
  });

  it("clears all registrations", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("a"));
    registry.register(createTestCommand("b"));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it("trims command name whitespace", () => {
    const registry = new CLICommandRegistry();
    registry.register(createTestCommand("  start  "));
    expect(registry.has("start")).toBe(true);
  });
});

// ─── CLICommandBuilder ─────────────────────────────────────────────────────

describe("CLICommandBuilder", () => {
  it("builds a command with all fields", () => {
    const cmd = new CLICommandBuilder()
      .name("deploy")
      .description("Deploy the app")
      .alias("-d")
      .execute(() => {})
      .build();

    expect(cmd.name).toBe("deploy");
    expect(cmd.description).toBe("Deploy the app");
    expect(cmd.aliases).toContain("-d");
  });

  it("builds a command with options", () => {
    const cmd = new CLICommandBuilder()
      .name("build")
      .options([
        {
          name: "outDir",
          short: "o",
          type: "string",
          description: "Output directory",
        },
      ])
      .execute(() => {})
      .build();

    expect(cmd.options).toHaveLength(1);
    expect(cmd.options?.[0]?.name).toBe("outDir");
  });

  it("builds a command with arguments", () => {
    const cmd = new CLICommandBuilder()
      .name("run")
      .arguments([{ name: "script", required: true }])
      .execute(() => {})
      .build();

    expect(cmd.arguments).toHaveLength(1);
    expect(cmd.arguments?.[0]?.name).toBe("script");
  });

  it("builds a command with sub-commands", () => {
    const cmd = new CLICommandBuilder()
      .name("db")
      .commands([createTestCommand("migrate"), createTestCommand("seed")])
      .execute(() => {})
      .build();

    expect(cmd.commands).toHaveLength(2);
  });

  it("builds a command with multiple aliases", () => {
    const cmd = new CLICommandBuilder()
      .name("test")
      .aliases(["-t", "--run-tests"])
      .execute(() => {})
      .build();

    expect(cmd.aliases).toEqual(["-t", "--run-tests"]);
  });

  it("throws TypeError if execute is missing", () => {
    expect(() => new CLICommandBuilder().name("test").build()).toThrow(
      TypeError,
    );
  });
});

// ─── createCommand / command ───────────────────────────────────────────────

describe("createCommand", () => {
  it("creates a validated command", () => {
    const cmd = createCommand({
      name: "hello",
      execute: () => {},
    });
    expect(cmd.name).toBe("hello");
    expect(typeof cmd.execute).toBe("function");
  });

  it("trims whitespace from name", () => {
    const cmd = createCommand({ name: "  hello  ", execute: () => {} });
    expect(cmd.name).toBe("hello");
  });

  it("trims and filters aliases", () => {
    const cmd = createCommand({
      name: "hello",
      aliases: ["  -h  ", "  --hi  "],
      execute: () => {},
    });
    expect(cmd.aliases).toEqual(["-h", "--hi"]);
  });

  it("throws InvalidCommandNameError for empty name", () => {
    expect(() => createCommand({ name: "", execute: () => {} })).toThrow(
      InvalidCommandNameError,
    );
  });

  it("throws InvalidCommandNameError for invalid name pattern", () => {
    expect(() =>
      createCommand({ name: "bad name!", execute: () => {} }),
    ).toThrow(InvalidCommandNameError);
  });

  it("allows colon and hyphen in names", () => {
    expect(() =>
      createCommand({ name: "db:migrate", execute: () => {} }),
    ).not.toThrow();
    expect(() =>
      createCommand({ name: "db-migrate", execute: () => {} }),
    ).not.toThrow();
  });
});

describe("command (shorthand factory)", () => {
  it("creates a simple command", () => {
    const cmd = command("hello", () => {});
    expect(cmd.name).toBe("hello");
    expect(typeof cmd.execute).toBe("function");
  });
});

describe("executeCommand", () => {
  it("calls the command's execute method", async () => {
    let called = false;
    const cmd = createTestCommand("test", {
      execute: () => {
        called = true;
      },
    });
    await executeCommand(cmd, createDummyContext());
    expect(called).toBe(true);
  });

  it("passes context to execute", async () => {
    let receivedCtx: CLIContext | undefined;
    const cmd = createTestCommand("test", {
      execute: (ctx: CLIContext) => {
        receivedCtx = ctx;
      },
    });
    const ctx = createDummyContext({ args: ["hello"] });
    await executeCommand(cmd, ctx);
    expect(receivedCtx).toBe(ctx);
  });

  it("propagates errors from execute", async () => {
    const cmd = createTestCommand("test", {
      execute: () => {
        throw new Error("boom");
      },
    });
    await expect(executeCommand(cmd, createDummyContext())).rejects.toThrow(
      "boom",
    );
  });

  it("handles async execute", async () => {
    let resolved = false;
    const cmd = createTestCommand("test", {
      execute: async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
      },
    });
    await executeCommand(cmd, createDummyContext());
    expect(resolved).toBe(true);
  });
});

// ─── validateCommand / isCLICommand / sortCommands ─────────────────────────

describe("validateCommand", () => {
  it("accepts valid commands", () => {
    const cmd = createTestCommand("deploy");
    expect(() => validateCommand(cmd)).not.toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => validateCommand(null as any)).toThrow(TypeError);
    expect(() => validateCommand("string" as any)).toThrow(TypeError);
  });

  it("rejects empty name", () => {
    expect(() =>
      validateCommand({ name: "", execute: () => {} } as any),
    ).toThrow(InvalidCommandNameError);
  });

  it("rejects name with spaces", () => {
    expect(() =>
      validateCommand({ name: "my command", execute: () => {} } as any),
    ).toThrow(InvalidCommandNameError);
  });

  it("rejects duplicate alias matching name", () => {
    expect(() =>
      validateCommand({
        name: "start",
        aliases: ["start"],
        execute: () => {},
      } as any),
    ).toThrow(DuplicateCommandError);
  });

  it("rejects duplicate aliases", () => {
    expect(() =>
      validateCommand({
        name: "start",
        aliases: ["-s", "-s"],
        execute: () => {},
      } as any),
    ).toThrow(DuplicateCommandError);
  });

  it("rejects non-function execute", () => {
    expect(() =>
      validateCommand({ name: "test", execute: "not a function" } as any),
    ).toThrow(TypeError);
  });
});

describe("isCLICommand", () => {
  it("returns true for valid commands", () => {
    expect(isCLICommand(createTestCommand("test"))).toBe(true);
  });

  it("returns true for objects with name and execute", () => {
    expect(isCLICommand({ name: "test", execute: () => {} })).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isCLICommand(null)).toBe(false);
    expect(isCLICommand("string")).toBe(false);
    expect(isCLICommand(42)).toBe(false);
  });

  it("returns false for objects missing name", () => {
    expect(isCLICommand({ execute: () => {} })).toBe(false);
  });

  it("returns false for objects missing execute", () => {
    expect(isCLICommand({ name: "test" })).toBe(false);
  });
});

describe("sortCommands", () => {
  it("sorts commands alphabetically", () => {
    const commands = [
      createTestCommand("zeta"),
      createTestCommand("alpha"),
      createTestCommand("beta"),
    ];
    const sorted = sortCommands(commands);
    expect(sorted.map((c) => c.name)).toEqual(["alpha", "beta", "zeta"]);
  });

  it("does not mutate original array", () => {
    const commands = [createTestCommand("b"), createTestCommand("a")];
    sortCommands(commands);
    expect(commands[0]?.name).toBe("b");
  });

  it("returns empty array for empty input", () => {
    expect(sortCommands([])).toEqual([]);
  });
});
