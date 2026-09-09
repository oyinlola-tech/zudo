/**
 * zudojs-cli — Build Command Tests
 *
 * Tests for the build command.
 */

import { describe, it, expect, vi } from "vitest";
import { runBuildCommand } from "../src/commands/build.command.js";
import type { CLIContext } from "../src/cliType/cliType.type.js";

function createContext(overrides?: Partial<CLIContext>): CLIContext {
  return {
    args: [],
    values: {},
    cwd: "/tmp",
    env: {},
    logger: {
      debug: () => {},
      info: vi.fn(),
      warn: () => {},
      error: vi.fn(),
      trace: () => {},
      fatal: () => {},
      child: () => ({}) as any,
      level: 3,
      flush: () => {},
    } as any,
    ...overrides,
  };
}

describe("runBuildCommand", () => {
  // This used to assert that the command merely logged and returned, which
  // gave `zudojs build` exit code 0 for a project it could not build. The
  // command now throws so the process exits non-zero.
  it("fails when no project root is found", async () => {
    const context = createContext({ cwd: "/nonexistent" });
    await expect(runBuildCommand(context)).rejects.toThrow(
      /must be run inside a Zudojs project/i,
    );
  });
});
