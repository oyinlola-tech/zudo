/**
 * @zudojs/scheduler — Round 9 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import { Scheduler, SystemClock, MAX_TIMER_DELAY } from "../src/index.js";
import type { Clock } from "../src/scheduler/clock/schedulerClock.type.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A clock that counts how often the scheduler consults it. */
function countingClock(): { clock: Clock; calls: () => number } {
  const base = new SystemClock();
  let calls = 0;
  return {
    clock: {
      now: () => {
        calls++;
        return base.now();
      },
      nowMs: () => {
        calls++;
        return base.nowMs();
      },
    },
    calls: () => calls,
  };
}

/* ─── SCHEDULER-R9-01: a saturated scheduler spun a zero-delay tick loop ── */

describe("SCHEDULER-R9-01", () => {
  it("does not re-tick while a due schedule waits on the concurrency ceiling", async () => {
    const { clock, calls } = countingClock();
    const scheduler = new Scheduler({ clock, maxConcurrency: 1 });

    let fastRuns = 0;
    scheduler.define({
      id: "slow",
      name: "slow",
      handler: async () => {
        await sleep(150);
      },
    });
    scheduler.define({
      id: "fast",
      name: "fast",
      handler: async () => {
        fastRuns++;
      },
    });

    scheduler.every("50ms", "slow");
    scheduler.every("50ms", "fast");
    scheduler.start();

    await sleep(60); // "slow" is running; "fast" is due and held back
    const before = calls();
    await sleep(80);
    const ticksWorth = calls() - before;

    // Previously ~120 clock reads in this window (one tick per millisecond).
    expect(ticksWorth).toBeLessThan(10);

    // The held-back schedule still runs once capacity frees up.
    await sleep(150);
    expect(fastRuns).toBeGreaterThanOrEqual(1);

    await scheduler.stop();
  });
});

/* ─── SCHEDULER-R9-02: resuming past a one-shot's fire time stranded it ──── */

describe("SCHEDULER-R9-02", () => {
  it("fires a resumed one-shot whose time passed while paused (run-once)", async () => {
    const scheduler = new Scheduler();
    let runs = 0;
    scheduler.define({
      id: "once",
      name: "once",
      handler: async () => {
        runs++;
      },
    });

    const handle = scheduler.at(new Date(Date.now() + 20), "once");
    await handle.pause();
    await sleep(50);
    await handle.resume();
    scheduler.start();
    await sleep(60);

    expect(runs).toBe(1);
    expect(scheduler.scheduleCount).toBe(0);

    await scheduler.stop();
  });

  it("retires a resumed one-shot whose time passed when misfire is skip", async () => {
    const scheduler = new Scheduler();
    let runs = 0;
    scheduler.define({
      id: "once-skip",
      name: "once-skip",
      handler: async () => {
        runs++;
      },
    });

    const handle = scheduler.at(new Date(Date.now() + 20), "once-skip", {
      misfire: "skip",
    });
    await handle.pause();
    await sleep(50);
    await handle.resume();
    scheduler.start();
    await sleep(60);

    expect(runs).toBe(0);
    expect(scheduler.scheduleCount).toBe(0);
    expect(scheduler.getSchedule(handle.id)).toBeUndefined();

    await scheduler.stop();
  });
});

/* ─── SCHEDULER-R9-03: an unbounded timeout was clamped to 1ms by Node ───── */

describe("SCHEDULER-R9-03", () => {
  it("rejects a non-finite or oversized timeout at define()", () => {
    const scheduler = new Scheduler();
    for (const timeout of [Infinity, Number.NaN, MAX_TIMER_DELAY + 1]) {
      expect(() =>
        scheduler.define({
          id: `t-${String(timeout)}`,
          name: "t",
          options: { timeout },
          handler: async () => {},
        }),
      ).toThrow(/timeout must be a positive number/);
    }
  });

  it("lets a job registered with the maximum timeout run to completion", async () => {
    const errors: unknown[] = [];
    const scheduler = new Scheduler({ onError: (e) => errors.push(e.error) });
    let completed = false;
    scheduler.define({
      id: "long-budget",
      name: "long-budget",
      options: { timeout: MAX_TIMER_DELAY },
      handler: async () => {
        await sleep(30);
        completed = true;
      },
    });

    scheduler.after("1ms", "long-budget");
    scheduler.start();
    await sleep(90);

    expect(completed).toBe(true);
    expect(errors).toEqual([]);
    expect(scheduler.getExecutions("long-budget").map((e) => e.status)).toEqual(
      ["completed"],
    );

    await scheduler.stop();
  });
});

/* ─── SCHEDULER-R9-04: a fired one-shot's handle still reported "active" ── */

describe("SCHEDULER-R9-04", () => {
  it("reports completed on the handle once a one-shot has fired", async () => {
    const scheduler = new Scheduler();
    scheduler.define({ id: "one", name: "one", handler: async () => {} });

    const handle = scheduler.after("5ms", "one");
    expect(handle.state).toBe("active");

    scheduler.start();
    await sleep(50);

    expect(scheduler.scheduleCount).toBe(0);
    expect(handle.state).toBe("completed");
    expect(handle.nextRun()).toBeUndefined();

    await scheduler.stop();
  });

  it("keeps reporting cancelled after cancel()", async () => {
    const scheduler = new Scheduler();
    scheduler.define({ id: "c", name: "c", handler: async () => {} });
    const handle = scheduler.every("1h", "c");
    await handle.cancel();
    expect(handle.state).toBe("cancelled");
  });
});
