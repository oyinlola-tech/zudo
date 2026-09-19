/**
 * @zudojs/scheduler — Round 10 regression tests.
 *
 * One describe block per finding.
 */

import { afterEach, describe, it, expect } from "vitest";

import {
  Scheduler,
  InvalidScheduleError,
  parseCron,
  nextCronDate,
} from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function counting(scheduler: Scheduler, id: string): { runs: () => number } {
  let runs = 0;
  scheduler.define({
    id,
    name: id,
    handler: async () => {
      runs++;
    },
  });
  return { runs: () => runs };
}

/* ─── INF-01: a schedule added after start() was never armed ─────────────── */

describe("INF-01", () => {
  it("fires an every() schedule added to an empty, started scheduler", async () => {
    const scheduler = new Scheduler();
    const job = counting(scheduler, "late");
    scheduler.start();
    scheduler.every("40ms", "late");
    await sleep(200);
    await scheduler.stop();
    expect(job.runs()).toBeGreaterThanOrEqual(2);
  });

  it("fires an after() schedule sooner than the one currently armed", async () => {
    const scheduler = new Scheduler();
    counting(scheduler, "far");
    const near = counting(scheduler, "near");
    scheduler.after("1h", "far");
    scheduler.start();
    scheduler.after("30ms", "near");
    await sleep(150);
    await scheduler.stop();
    expect(near.runs()).toBe(1);
  });
});

/* ─── INF-05: UTC cron skipped minutes on a half-hour host zone ─────────── */

describe("INF-05", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it("finds minute 0 and 15 of a restricted UTC hour when the host is +05:30", () => {
    process.env.TZ = "Asia/Kolkata";
    const after = new Date("2026-09-19T03:10:00Z");
    expect(nextCronDate(parseCron("0 5 * * *"), after, true)?.toISOString()).toBe(
      "2026-09-19T05:00:00.000Z",
    );
    expect(nextCronDate(parseCron("15 5 * * *"), after, true)?.toISOString()).toBe(
      "2026-09-19T05:15:00.000Z",
    );
    expect(nextCronDate(parseCron("45 5 * * *"), after, true)?.toISOString()).toBe(
      "2026-09-19T05:45:00.000Z",
    );
  });

  it("still honours local minutes in local mode on a half-hour zone", () => {
    process.env.TZ = "Asia/Kolkata";
    const after = new Date("2026-09-19T03:10:00Z");
    const next = nextCronDate(parseCron("0 5 * * *"), after, false);
    expect(next?.getHours()).toBe(5);
    expect(next?.getMinutes()).toBe(0);
  });
});

/* ─── INF-06: a cron with no next fire time ran immediately ─────────────── */

describe("INF-06", () => {
  it("rejects an unsatisfiable cron at registration instead of running it", async () => {
    const scheduler = new Scheduler();
    const job = counting(scheduler, "feb30");
    expect(() => scheduler.cron("0 0 30 2 *", "feb30")).toThrow(
      InvalidScheduleError,
    );
    scheduler.start();
    await sleep(50);
    await scheduler.stop();
    expect(job.runs()).toBe(0);
    expect(scheduler.listSchedules()).toHaveLength(0);
  });

  it("keeps the run-once misfire behaviour for a past one-shot", async () => {
    const scheduler = new Scheduler();
    const job = counting(scheduler, "past");
    scheduler.at(new Date(Date.now() - 1000), "past");
    scheduler.start();
    await sleep(50);
    await scheduler.stop();
    expect(job.runs()).toBe(1);
  });
});
