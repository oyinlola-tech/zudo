/**
 * @zudojs/runtime — a SIGTERM must hold the process open until the
 * graceful shutdown it triggered has finished.
 *
 * Reproduced under plain `node` against the built package: with nothing
 * else keeping the event loop alive, the process exited at once with code
 * 0, the runtime still `running`, and `onShutdown` never ran. Under `tsx`
 * it worked, because tsx keeps the loop alive, so these tests spawn a real
 * child process with plain `node` and the compiled `dist/`.
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { SignalHandler } from "../src/signalHandler/index.js";

import type { Logger } from "@zudojs/logger";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(packageDir, "tests/fixtures/signalShutdown.fixture.mjs");

interface ChildOutcome {
  readonly exitCode: number | null;
  readonly report: {
    code: number;
    state: string;
    events: string[];
    failures: string[];
  };
}

/**
 * Newest modification time under `dir`, in milliseconds. `.tsbuildinfo` is
 * skipped: `tsc --noEmit` (typecheck) rewrites it without emitting, which
 * made a stale `dist/` look fresh.
 */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith(".tsbuildinfo")) continue;
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestMtime(path)
      : statSync(path).mtimeMs;
    newest = Math.max(newest, mtime);
  }
  return newest;
}

/** Runs the fixture under plain node; signals it once it reports ready. */
function runFixture(mode: string): Promise<ChildOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture, mode], { cwd: packageDir });
    let stdout = "";
    let stderr = "";
    let signalled = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!signalled && stdout.includes("ready\n")) {
        signalled = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      const line = stdout.split("\n").find((entry) => entry.startsWith("{"));
      if (line === undefined) {
        reject(new Error(`fixture printed no report: ${stdout}${stderr}`));
        return;
      }
      resolve({ exitCode, report: JSON.parse(line) as ChildOutcome["report"] });
    });
  });
}

beforeAll(() => {
  const dist = join(packageDir, "dist/index.js");
  if (
    !existsSync(dist) ||
    newestMtime(join(packageDir, "src")) > newestMtime(join(packageDir, "dist"))
  ) {
    execFileSync(
      join(packageDir, "node_modules/.bin/tsc"),
      ["-p", "tsconfig.json"],
      { cwd: packageDir, stdio: "inherit" },
    );
  }
}, 120_000);

describe("SIGTERM under plain node", () => {
  it("runs onShutdown and exits 0 when the process signals itself", async () => {
    const { exitCode, report } = await runFixture("clean");

    expect(report.events).toEqual(["onShutdown"]);
    expect(report.state).toBe("stopped");
    expect(exitCode).toBe(0);
  });

  it("exits non-zero when a module's onShutdown fails", async () => {
    const { exitCode, report } = await runFixture("fail");

    expect(report.events).toEqual(["onShutdown"]);
    expect(report.state).toBe("stopped");
    expect(exitCode).toBe(1);
  });

  it("exits non-zero and emits runtime.failed once when shutdownTimeout elapses", async () => {
    const { exitCode, report } = await runFixture("hang");

    expect(report.events).toEqual(["onShutdown"]);
    expect(report.state).toBe("failed");
    expect(report.failures).toEqual(["stop"]);
    expect(exitCode).toBe(1);
  });

  it("finishes onShutdown after it closes the last open handle", async () => {
    const { exitCode, report } = await runFixture("external");

    expect(report.events).toEqual(["onShutdown"]);
    expect(report.state).toBe("stopped");
    expect(exitCode).toBe(0);
  });
});

describe("SignalHandler exit code", () => {
  const silent = {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  } as unknown as Logger;

  async function codesAfterSigterm(
    shutdown: () => Promise<void>,
  ): Promise<number[]> {
    const codes: number[] = [];
    const handler = new SignalHandler(silent, {
      handleSignals: true,
      handleFatalErrors: false,
      exit: () => undefined,
      setExitCode: (code) => codes.push(code),
    });
    handler.register(shutdown);
    try {
      process.emit("SIGTERM", "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      handler.unregister();
    }
    return codes;
  }

  it("leaves the exit code alone after a clean shutdown", async () => {
    expect(await codesAfterSigterm(async () => undefined)).toEqual([]);
  });

  it("sets exit code 1 when the shutdown fails", async () => {
    const codes = await codesAfterSigterm(async () => {
      throw new Error("stop failed");
    });
    expect(codes).toEqual([1]);
  });
});
