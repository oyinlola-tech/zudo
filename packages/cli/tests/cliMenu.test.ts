/**
 * The interactive menu a bare `zudojs` / `zudo` opens on a terminal: the
 * flow (with a fake prompter), the digit-or-arrow select (with injected
 * streams), and the runner's TTY / CI gating.
 */

import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MENU_CANCEL,
  MENU_ITEMS,
  numberedSelect,
  runMenuFlow,
  type MenuFlowOptions,
  type MenuItemId,
  type MenuPrompter,
} from "../src/prompts/menu/index.js";
import { runBinary, shouldShowMenu } from "../src/bin/bin.runner.js";
import { isZudojsProject } from "../src/bin/bin.menu.js";
import { CLI_EXIT_CODES } from "../src/cliConstant/cliConstant.value.js";

type Answer = string | typeof MENU_CANCEL;

/** A prompter that replays scripted answers and records what it showed. */
function fakePrompter(
  choices: readonly (MenuItemId | typeof MENU_CANCEL)[],
  answers: readonly Answer[] = [],
): MenuPrompter & { warnings: string[]; cancels: string[]; asked: string[] } {
  const queue = [...choices];
  const replies = [...answers];
  const warnings: string[] = [];
  const cancels: string[] = [];
  const asked: string[] = [];
  return {
    warnings,
    cancels,
    asked,
    choose: async () => queue.shift() ?? MENU_CANCEL,
    select: async (message) => {
      asked.push(message);
      return replies.shift() ?? MENU_CANCEL;
    },
    text: async (message, _placeholder, validate) => {
      asked.push(message);
      const reply = replies.shift() ?? MENU_CANCEL;
      if (reply !== MENU_CANCEL && validate(reply) !== undefined) {
        throw new Error(`invalid: ${validate(reply)}`);
      }
      return reply;
    },
    warn: (message) => void warnings.push(message),
    cancel: (message) => void cancels.push(message),
  };
}

function flow(
  prompter: MenuPrompter,
  inProject = true,
): MenuFlowOptions {
  return {
    prompter,
    cwd: "/work/app",
    name: "zudo",
    isProject: () => inProject,
    schematics: [{ value: "service", label: "Service" }],
    features: [{ value: "queue", label: "queue" }],
  };
}

describe("menu entries", () => {
  it("lists the nine documented entries with their digits", () => {
    expect(MENU_ITEMS.map((item) => `${item.key}. ${item.label}`)).toEqual([
      "1. Create a new project",
      "2. Start dev server",
      "3. Generate code",
      "4. Add a feature",
      "5. Build",
      "6. Doctor",
      "7. Info",
      "8. Help",
      "0. Exit",
    ]);
  });

  it("marks exactly dev, generate, add and build as project-only", () => {
    const projectOnly = MENU_ITEMS.filter((item) => item.project).map(
      (item) => item.id,
    );
    expect(projectOnly).toEqual(["dev", "generate", "add", "build"]);
  });
});

describe("runMenuFlow", () => {
  it.each([
    ["create", ["create"]],
    ["dev", ["dev"]],
    ["build", ["build"]],
    ["doctor", ["doctor"]],
    ["info", ["info"]],
    ["help", ["--help"]],
  ] as const)("maps %s to %j", async (id, args) => {
    const outcome = await runMenuFlow(flow(fakePrompter([id])));
    expect(outcome).toEqual({ kind: "run", args });
  });

  it("prompts for the schematic and name of `generate`", async () => {
    const prompter = fakePrompter(["generate"], ["service", " billing "]);
    const outcome = await runMenuFlow(flow(prompter));
    expect(outcome).toEqual({
      kind: "run",
      args: ["generate", "service", "billing"],
    });
    expect(prompter.asked).toHaveLength(2);
  });

  it("refuses a generate name that would parse as an option", async () => {
    const prompter = fakePrompter(["generate"], ["service", "--force"]);
    await expect(runMenuFlow(flow(prompter))).rejects.toThrow(/invalid/);
  });

  it("prompts for the feature of `add`", async () => {
    const outcome = await runMenuFlow(flow(fakePrompter(["add"], ["queue"])));
    expect(outcome).toEqual({ kind: "run", args: ["add", "queue"] });
  });

  it("exits with no command for `0. Exit`", async () => {
    expect(await runMenuFlow(flow(fakePrompter(["exit"])))).toEqual({
      kind: "exit",
    });
  });

  it("reports a cancel from the menu itself", async () => {
    const prompter = fakePrompter([MENU_CANCEL]);
    expect(await runMenuFlow(flow(prompter))).toEqual({ kind: "cancel" });
    expect(prompter.cancels).toEqual(["Operation cancelled."]);
  });

  it("reports a cancel from a follow-up question", async () => {
    const prompter = fakePrompter(["generate"], ["service", MENU_CANCEL]);
    expect(await runMenuFlow(flow(prompter))).toEqual({ kind: "cancel" });
  });

  it.each(["dev", "generate", "add", "build"] as const)(
    "says clearly when %s is chosen outside a project, then re-shows the menu",
    async (id) => {
      const prompter = fakePrompter([id, "exit"]);
      const outcome = await runMenuFlow(flow(prompter, false));
      expect(outcome).toEqual({ kind: "exit" });
      expect(prompter.warnings).toHaveLength(1);
      expect(prompter.warnings[0]).toContain("needs a Zudojs project");
      expect(prompter.warnings[0]).toContain("/work/app");
      expect(prompter.warnings[0]).toContain('run "zudo" again');
      expect(prompter.asked).toEqual([]);
    },
  );

  it("does not check for a project for create, doctor and info", async () => {
    const isProject = vi.fn(() => false);
    for (const id of ["create", "doctor", "info"] as const) {
      await runMenuFlow({ ...flow(fakePrompter([id])), isProject });
    }
    expect(isProject).not.toHaveBeenCalled();
  });
});

describe("isZudojsProject", () => {
  it("is false for an empty directory in both scopes", () => {
    const dir = mkdtempSync(join(tmpdir(), "zudojs-menu-"));
    try {
      expect(isZudojsProject(dir, "cwd")).toBe(false);
      expect(isZudojsProject(dir, "ancestor")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Runs the numbered select against scripted key bytes. */
async function select(keys: readonly string[]): Promise<unknown> {
  const input = new PassThrough();
  const output = new PassThrough();
  let drawn = "";
  output.on("data", (chunk: Buffer) => (drawn += chunk.toString()));
  const result = numberedSelect(MENU_ITEMS, { input, output });
  for (const key of keys) {
    input.write(key);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const value = await result;
  expect(drawn).toContain("What would you like to do?");
  return value;
}

describe("numberedSelect", () => {
  it("picks an entry by its digit", async () => {
    expect(await select(["3"])).toBe("generate");
    expect(await select(["0"])).toBe("exit");
  });

  it("moves with the arrow keys and confirms with Enter", async () => {
    expect(await select(["\u001B[B", "\u001B[B", "\r"])).toBe("generate");
    expect(await select(["\u001B[A", "\r"])).toBe("exit");
  });

  it("ignores digits that name no entry", async () => {
    expect(await select(["9", "\r"])).toBe("create");
  });

  it("cancels on Ctrl+C and on Esc", async () => {
    expect(await select(["\u0003"])).toBe(MENU_CANCEL);
    expect(await select(["\u001B"])).toBe(MENU_CANCEL);
  });
});

describe("shouldShowMenu / runBinary", () => {
  const tty = { isTTY: true };
  const base = { argv: [], stdin: tty, stdout: tty, env: {} };

  it("opens only with no arguments on two TTYs outside CI", () => {
    expect(shouldShowMenu(base)).toBe(true);
    expect(shouldShowMenu({ ...base, argv: ["--help"] })).toBe(false);
    expect(shouldShowMenu({ ...base, argv: ["--version"] })).toBe(false);
    expect(shouldShowMenu({ ...base, stdin: {} })).toBe(false);
    expect(shouldShowMenu({ ...base, stdout: { isTTY: false } })).toBe(false);
    expect(shouldShowMenu({ ...base, env: { CI: "true" } })).toBe(false);
    expect(shouldShowMenu({ ...base, env: { CI: "0" } })).toBe(true);
  });

  it("prints help (runs with no args) and never opens the menu off a TTY", async () => {
    const run = vi.fn(async () => 0);
    const openMenu = vi.fn();
    const code = await runBinary({ run }, { ...base, stdin: {} }, openMenu);
    expect(code).toBe(0);
    expect(run).toHaveBeenCalledWith([]);
    expect(openMenu).not.toHaveBeenCalled();
  });

  it("runs the chosen command and returns its exit code", async () => {
    const run = vi.fn(async () => 3);
    const code = await runBinary({ run }, base, async () => ({
      kind: "run",
      args: ["generate", "service", "billing"],
    }));
    expect(code).toBe(3);
    expect(run).toHaveBeenCalledWith(["generate", "service", "billing"]);
  });

  it("exits 0 for Exit and 130 for a cancel without running anything", async () => {
    const run = vi.fn(async () => 0);
    expect(await runBinary({ run }, base, async () => ({ kind: "exit" }))).toBe(
      CLI_EXIT_CODES.SUCCESS,
    );
    expect(
      await runBinary({ run }, base, async () => ({ kind: "cancel" })),
    ).toBe(CLI_EXIT_CODES.INTERRUPTED);
    expect(run).not.toHaveBeenCalled();
  });
});
