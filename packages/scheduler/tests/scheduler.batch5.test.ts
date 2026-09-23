/**
 * @zudojs/scheduler — batch 5 regression tests.
 *
 * Bugs reproduced by lesson writers against the published package. One
 * describe block per report.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { CronParseError, Scheduler, parseCron } from "../src/index.js";
import type { Clock, JobContext } from "../src/index.js";

const TSX = fileURLToPath(
  new URL("../../../node_modules/.bin/tsx", import.meta.url),
);
const ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/** Runs a TypeScript module in a fresh process and reports how it ended. */
function runScript(
  body: string,
): Promise<{ readonly code: number | null; readonly stdout: string }> {
  const dir = mkdtempSync(join(tmpdir(), "zudo-scheduler-"));
  const file = join(dir, "script.mts");
  writeFileSync(
    file,
    `import * as lib from ${JSON.stringify(ENTRY)};\n${body}`,
  );
  return new Promise((resolve) => {
    execFile(TSX, [file], { timeout: 20_000 }, (error, stdout) => {
      resolve({
        code: error ? ((error as { code?: number }).code ?? 1) : 0,
        stdout,
      });
    });
  });
}

describe("a started scheduler keeps the process alive", () => {
  it("runs a delayed job in a script that only starts the scheduler", async () => {
    const result = await runScript(`
      const scheduler = new lib.Scheduler();
      scheduler.define({
        id: "job",
        name: "job",
        handler: () => {
          console.log("ran");
          void scheduler.stop();
        },
      });
      scheduler.after("100ms", "job");
      scheduler.start();
    `);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ran");
  });

  it("lets the process exit once stop() is called", async () => {
    const result = await runScript(`
      const scheduler = new lib.Scheduler();
      scheduler.start();
      await scheduler.stop();
      console.log("stopped");
    `);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stopped");
  });

  it("keepAlive: false restores the unreferenced timer", async () => {
    const result = await runScript(`
      const scheduler = new lib.Scheduler({ keepAlive: false });
      scheduler.define({ id: "job", name: "job", handler: () => console.log("ran") });
      scheduler.after("5s", "job");
      scheduler.start();
    `);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("ran");
  });
});

describe("Clock is exported from the package root", () => {
  it("accepts a custom clock typed with the exported Clock", () => {
    const fixed: Clock = {
      now: () => new Date(0),
      nowMs: () => 0,
    };
    const scheduler = new Scheduler({ clock: fixed, keepAlive: false });
    expect(scheduler.isRunning).toBe(false);
  });
});

describe("stop() is idempotent", () => {
  it("resolves when the scheduler never started", async () => {
    const scheduler = new Scheduler();
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });

  it("resolves when called twice", async () => {
    const scheduler = new Scheduler();
    scheduler.start();
    await scheduler.stop();
    await expect(scheduler.stop()).resolves.toBeUndefined();
    expect(scheduler.isRunning).toBe(false);
  });

  it("resolves for concurrent calls", async () => {
    const scheduler = new Scheduler();
    scheduler.start();
    await expect(
      Promise.all([scheduler.stop(), scheduler.stop()]),
    ).resolves.toEqual([undefined, undefined]);
  });
});

describe("CronParseError puts the expression and reason in order", () => {
  it("quotes the expression, then states the reason", () => {
    let caught: unknown;
    try {
      parseCron("99 0 * * *");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CronParseError);
    const error = caught as CronParseError;
    expect(error.message).toBe(
      'Invalid cron expression "99 0 * * *": Cron field "minute" value 99 is outside 0-59.',
    );
    expect(error.metadata).toMatchObject({
      expression: "99 0 * * *",
      reason: 'Cron field "minute" value 99 is outside 0-59',
    });
  });

  it("reports the field count against the expression", () => {
    expect(() => parseCron("* * *")).toThrow(
      'Invalid cron expression "* * *": Cron expression must have 5 fields',
    );
  });
});

describe("getExecutions records the attempt that settled the run", () => {
  it("records attempt 3 for a run that succeeded on its third attempt", async () => {
    const scheduler = new Scheduler({ keepAlive: false });
    const seen: number[] = [];
    let calls = 0;

    scheduler.define({
      id: "flaky",
      name: "flaky",
      options: { retry: { attempts: 3, strategy: "fixed", delay: 1 } },
      handler: (ctx: JobContext) => {
        seen.push(ctx.attempt);
        calls += 1;
        if (calls < 3) throw new Error("not yet");
      },
    });
    scheduler.after("1ms", "flaky");
    scheduler.start();

    await expect
      .poll(() => scheduler.getExecutions("flaky")[0]?.status)
      .toBe("completed");
    await scheduler.stop();

    expect(seen).toEqual([1, 2, 3]);
    expect(scheduler.getExecutions("flaky")[0]?.attempt).toBe(3);
  });

  it("records the last attempt for a run that failed every attempt", async () => {
    const scheduler = new Scheduler({ keepAlive: false });
    scheduler.define({
      id: "broken",
      name: "broken",
      options: { retry: { attempts: 2, strategy: "fixed", delay: 1 } },
      handler: () => {
        throw new Error("always");
      },
    });
    scheduler.after("1ms", "broken");
    scheduler.start();

    await expect
      .poll(() => scheduler.getExecutions("broken")[0]?.status)
      .toBe("failed");
    await scheduler.stop();

    expect(scheduler.getExecutions("broken")[0]?.attempt).toBe(2);
  });

  it("exposes attemptNumber on the context, equal to the 1-based attempt", async () => {
    const scheduler = new Scheduler({ keepAlive: false });
    const numbers: number[] = [];
    scheduler.define({
      id: "numbered",
      name: "numbered",
      handler: (ctx: JobContext) => {
        numbers.push(ctx.attemptNumber);
      },
    });
    scheduler.after("1ms", "numbered");
    scheduler.start();

    await expect.poll(() => numbers.length).toBe(1);
    await scheduler.stop();
    expect(numbers).toEqual([1]);
  });
});
