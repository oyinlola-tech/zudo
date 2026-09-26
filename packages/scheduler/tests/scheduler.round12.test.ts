/**
 * @zudojs/scheduler — Round 12 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import { InvalidScheduleError } from "@zudojs/errors";

import {
  CronTrigger,
  Scheduler,
  UTC_ZONE,
  nextCronDate,
  parseCron,
  resolveCronZone,
} from "../src/index.js";

const iso = (date: Date | null | undefined): string | undefined =>
  date?.toISOString();

/* ─── #128: CronTrigger rejected IANA zones such as Africa/Lagos ────────── */

describe("#128", () => {
  it("evaluates a cron expression in Africa/Lagos", () => {
    const trigger = new CronTrigger("0 9 * * *", "Africa/Lagos");

    expect(trigger.timezone).toBe("Africa/Lagos");
    expect(iso(trigger.next(new Date("2026-01-01T00:00:00Z")))).toBe(
      "2026-01-01T08:00:00.000Z",
    );
  });

  it("follows daylight-saving time in America/New_York", () => {
    const trigger = new CronTrigger("0 9 * * *", "America/New_York");

    // Friday 6 March: still EST (UTC-5), so 09:00 wall-clock is 14:00Z.
    expect(iso(trigger.next(new Date("2026-03-06T00:00:00Z")))).toBe(
      "2026-03-06T14:00:00.000Z",
    );

    // DST starts Sunday 8 March at 02:00: 09:00 EDT (UTC-4) is 13:00Z.
    const first = trigger.next(new Date("2026-03-07T20:00:00Z"));
    expect(iso(first)).toBe("2026-03-08T13:00:00.000Z");
    expect(iso(trigger.next(first as Date))).toBe("2026-03-09T13:00:00.000Z");
  });

  it("visits every minute of a half-hour zone", () => {
    const hourly = new CronTrigger("0 * * * *", "Asia/Kolkata");
    // 00:00Z is 05:30 IST; the next top of the hour is 06:00 IST.
    expect(iso(hourly.next(new Date("2026-01-01T00:00:00Z")))).toBe(
      "2026-01-01T00:30:00.000Z",
    );

    const daily = new CronTrigger("30 5 * * *", "Asia/Kolkata");
    // 00:00Z is exactly 05:30 IST; "strictly after" means the next day.
    expect(iso(daily.next(new Date("2026-01-01T00:00:00Z")))).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("matches the day of week in the schedule's zone, not the host's", () => {
    // Monday 5 January 2026 01:00 NZDT (UTC+13) is Sunday 4 January 12:00Z.
    const trigger = new CronTrigger("0 1 * * mon", "Pacific/Auckland");

    expect(iso(trigger.next(new Date("2026-01-03T00:00:00Z")))).toBe(
      "2026-01-04T12:00:00.000Z",
    );
  });

  it("keeps UTC, its aliases and the boolean form of nextCronDate working", () => {
    const parsed = parseCron("15 10 * * *");
    const after = new Date("2026-06-01T00:00:00Z");

    expect(iso(nextCronDate(parsed, after, true))).toBe(
      "2026-06-01T10:15:00.000Z",
    );
    expect(iso(nextCronDate(parsed, after, UTC_ZONE))).toBe(
      "2026-06-01T10:15:00.000Z",
    );
    expect(iso(new CronTrigger("15 10 * * *", "utc").next(after))).toBe(
      "2026-06-01T10:15:00.000Z",
    );
    expect(new CronTrigger("15 10 * * *", "Etc/UTC").timezone).toBe("UTC");
    expect(new CronTrigger("15 10 * * *").timezone).toBeUndefined();
  });

  it("rejects an unknown zone name where the schedule is declared", () => {
    expect(() => new CronTrigger("0 0 * * *", "Mars/Olympus_Mons")).toThrow(
      InvalidScheduleError,
    );
    expect(resolveCronZone("Mars/Olympus_Mons")).toBeUndefined();
  });

  it("accepts an IANA zone through Scheduler.cron()", () => {
    const scheduler = new Scheduler();
    scheduler.define({
      id: "report",
      name: "report",
      handler: async () => {},
    });

    const handle = scheduler.cron("0 9 * * *", "report", {
      timezone: "Africa/Lagos",
    });
    const schedule = scheduler.getSchedule(handle.id);

    expect(schedule?.nextRunAt.getUTCHours()).toBe(8);
    expect(schedule?.nextRunAt.getUTCMinutes()).toBe(0);
  });
});
