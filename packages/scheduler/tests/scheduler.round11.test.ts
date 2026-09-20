/**
 * @zudojs/scheduler — Round 11 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  JobRegistry,
  Scheduler,
  isSchedulerError,
  parseCron,
} from "../src/index.js";
import type { SchedulerErrorEvent } from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ─── MSG-S-01: cancel() did not abort a running one-shot ───────────────── */

describe("MSG-S-01", () => {
  it("aborts an in-flight one-shot when its handle is cancelled", async () => {
    const log: string[] = [];
    const scheduler = new Scheduler();

    scheduler.define({
      id: "slow",
      name: "slow",
      handler: async (context) => {
        log.push("start");
        for (let i = 0; i < 40; i++) {
          if (context.signal.aborted) {
            log.push("aborted-observed");
            return;
          }
          await sleep(10);
        }
        log.push("ran-to-completion");
      },
    });

    const handle = scheduler.after("20ms", "slow");
    scheduler.start();

    await sleep(60);
    expect(log).toContain("start");

    await handle.cancel();
    await sleep(80);

    // Asserted before stop(): stopping the scheduler aborts everything still
    // running, which would mask a cancel() that aborted nothing.
    expect(log).toContain("aborted-observed");
    expect(log).not.toContain("ran-to-completion");

    await scheduler.stop();
  });

  it("still aborts an in-flight recurring schedule", async () => {
    const log: string[] = [];
    const scheduler = new Scheduler();

    scheduler.define({
      id: "tick",
      name: "tick",
      handler: async (context) => {
        log.push("start");
        for (let i = 0; i < 40; i++) {
          if (context.signal.aborted) {
            log.push("aborted-observed");
            return;
          }
          await sleep(10);
        }
        log.push("ran-to-completion");
      },
    });

    const handle = scheduler.every("20ms", "tick");
    scheduler.start();

    await sleep(60);
    await handle.cancel();
    await sleep(80);

    expect(log).toContain("aborted-observed");
    expect(log).not.toContain("ran-to-completion");

    await scheduler.stop();
  });
});

/* ─── MSG-S-02: day-of-week ranges spanning Sunday ──────────────────────── */

describe("MSG-S-02", () => {
  const days = (expression: string): number[] =>
    [...parseCron(expression).dayOfWeek].sort((a, b) => a - b);

  it("treats 0-7, 1-7, 0-6 and mon-sun as every day", () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    expect(days("0 0 * * 0-7")).toEqual(everyDay);
    expect(days("0 0 * * 1-7")).toEqual(everyDay);
    expect(days("0 0 * * 0-6")).toEqual(everyDay);
    expect(days("0 0 * * mon-sun")).toEqual(everyDay);
  });

  it("fires a 0-7 cron daily, not weekly", () => {
    const parsed = parseCron("0 0 * * 0-7");
    expect(parsed.dayOfWeek.size).toBe(7);
  });

  it("keeps a bare 7 as Sunday and a weekend range intact", () => {
    expect(days("0 0 * * 7")).toEqual([0]);
    expect(days("0 0 * * fri-sun")).toEqual([0, 5, 6]);
    expect(days("0 0 * * sun-sat")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("still rejects a genuinely inverted range and an out-of-range value", () => {
    expect(() => parseCron("0 0 * * 5-2")).toThrow(/inverted range/);
    expect(() => parseCron("0 0 * * 3-8")).toThrow(/outside/);
  });
});

/* ─── MSG-S-03: a schedule whose job was unregistered ticked forever ────── */

describe("MSG-S-03", () => {
  it("retires the schedule and reports the missing job", async () => {
    const registry = new JobRegistry();
    const errors: SchedulerErrorEvent[] = [];
    const scheduler = new Scheduler({
      jobs: registry,
      onError: (event) => errors.push(event),
    });

    let runs = 0;
    registry.register({
      id: "tick",
      name: "tick",
      handler: async () => {
        runs++;
      },
    });

    const handle = scheduler.every("20ms", "tick");
    scheduler.start();

    await sleep(70);
    const before = runs;
    expect(before).toBeGreaterThan(0);

    registry.unregister("tick");
    await sleep(80);
    await scheduler.stop();

    expect(runs).toBe(before);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.jobId).toBe("tick");
    expect(isSchedulerError(errors[0]?.error)).toBe(true);
    expect(handle.state).toBe("cancelled");
    expect(scheduler.listSchedules()).toHaveLength(0);
  });
});

/* ─── MSG-S-04: resume() on an active schedule postponed it ─────────────── */

describe("MSG-S-04", () => {
  it("leaves the next fire time alone when the schedule is already active", async () => {
    const scheduler = new Scheduler();
    scheduler.define({ id: "hourly", name: "hourly", handler: async () => {} });

    const handle = scheduler.every("1h", "hourly");
    scheduler.start();

    const before = handle.nextRun()?.getTime();
    await sleep(50);
    await handle.resume();
    const after = handle.nextRun()?.getTime();

    await scheduler.stop();

    expect(before).toBeDefined();
    expect(after).toBe(before);
  });

  it("still recomputes the fire time when the schedule was paused", async () => {
    const scheduler = new Scheduler();
    let runs = 0;
    scheduler.define({
      id: "paused-job",
      name: "paused-job",
      handler: async () => {
        runs++;
      },
    });

    const handle = scheduler.every("40ms", "paused-job");
    scheduler.start();

    await handle.pause();
    await sleep(120);
    expect(runs).toBe(0);

    await handle.resume();
    expect(handle.state).toBe("active");

    await sleep(140);
    await scheduler.stop();

    expect(runs).toBeGreaterThan(0);
  });
});
