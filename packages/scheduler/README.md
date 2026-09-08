# @zudojs/scheduler

In-process scheduling for delayed, recurring and cron-driven jobs.

## Installation

```bash
npm install @zudojs/scheduler
```

## Quick Start

```typescript
import { Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler({
  onError: ({ jobId, error }) => log.error({ jobId, error }, "job failed"),
});

// Register the job, then schedule it. A job must be defined before it can be
// scheduled — scheduling an unregistered id throws.
scheduler.define({
  id: "cleanup",
  name: "Clean up old records",
  handler: async (ctx) => {
    await cleanupOldRecords({ signal: ctx.signal });
  },
});

scheduler.cron("0 0 * * *", "cleanup", { timezone: "UTC" });

scheduler.start();

// On shutdown: aborts in-flight jobs and waits for them to settle.
await scheduler.stop({ timeoutMs: 30_000 });
```

## Scheduling

Four entry points, each returning a `ScheduleHandle`:

```typescript
scheduler.after("30s", "job-id"); // once, after a delay
scheduler.at(new Date("2027-01-01"), "job-id"); // once, at an instant
scheduler.every("5m", "job-id"); // repeating interval
scheduler.cron("*/15 * * * *", "job-id"); // repeating cron
```

Durations accept `ms`, `s`, `m`, `h`, `d` and `w`, and compose: `"1h30m"`.
Zero, negative and out-of-range durations are rejected.

Cron expressions are standard five-field (`minute hour day-of-month month
day-of-week`) with ranges, lists, steps and three-letter names, plus the
`@daily`/`@hourly`/`@weekly`/`@monthly`/`@yearly` macros. An invalid expression
throws where the schedule is declared, not at fire time.

Only `timezone: "UTC"` and the system local zone are supported. Any other zone
is rejected rather than silently ignored — honouring an arbitrary IANA zone
needs real zone data this package does not carry.

## Controlling a schedule

The handle is bound to its scheduler, so these reach the queue:

```typescript
const handle = scheduler.every("1h", "sync");

handle.nextRun(); // Date — the real next fire time
await handle.pause(); // stops firing; recomputes from now on resume
await handle.resume();
await handle.cancel(); // aborts any in-flight run and removes the schedule
```

## Failure handling

Nothing is swallowed. A job that throws is reported to `onError`, after its
retry policy is exhausted:

```typescript
scheduler.define({
  id: "flaky",
  name: "Flaky upstream call",
  options: {
    timeout: 10_000,
    retry: {
      attempts: 3,
      strategy: "exponential", // or "fixed" | "linear"
      delay: 1_000,
      maxDelay: 30_000,
      jitter: true,
    },
  },
  handler: callUpstream,
});
```

A timeout raises `SchedulerJobTimeoutError` and **aborts the handler** via
`ctx.signal`; anything else raises `SchedulerJobExecutionError` carrying the
original error as `cause`.

## Concurrency and overlap

`maxConcurrency` (default 10) bounds executions in flight across all schedules;
work over the ceiling waits for the next tick. Per schedule, `overlap` decides
what happens when a fire time arrives while the previous run is still going:

```typescript
scheduler.every("10s", "report", { overlap: "skip" });
// "allow" (default) | "skip" | "replace"
```

## Misfires

A fire time already in the past follows the schedule's `misfire` policy —
`"run-once"` (default) runs immediately, `"skip"` refuses the schedule. This is
the case for `at(pastDate)` and for schedules restored after a restart.

## Features

- Delay, date, interval and cron triggers
- Real five-field cron parsing with macros, ranges, steps and names
- Bound schedule handles: pause, resume, cancel, next-run
- Retry policies with fixed, linear and exponential backoff, capping and jitter
- Per-job timeouts that abort the handler through `AbortSignal`
- Concurrency ceiling and per-schedule overlap policy
- Graceful shutdown with abort or drain
- Min-heap priority queue, O(log n) insert and remove

## Not included

This package schedules work inside one process. It has no persistence, no
cross-process locking and no worker pool — a restart loses the schedule, and two
instances will each run the same job. Pair it with `@zudojs/queue` when you need
durability or distribution.

## Use Cases

- Scheduled maintenance and cleanup
- Periodic synchronisation
- Report generation
- Cache warming and refresh
