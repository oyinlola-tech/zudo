# @zudojs/scheduler

In-process scheduling for delayed, recurring and cron-driven jobs.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-scheduler](https://zudojs.oyinlola.site/docs/packages-scheduler) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-scheduler.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

## Starting and stopping

A started scheduler keeps the Node.js process alive until `stop()`, so a
script whose only work is a scheduler runs its jobs instead of exiting
straight away. Pass `keepAlive: false` for a scheduler that should never hold
the process open by itself (the behaviour before 1.2.0).

`stop()` is idempotent: calling it on a scheduler that never started, or
calling it twice, resolves instead of throwing `SchedulerStoppedError`.
`stop({ drain: true })` lets running jobs finish instead of aborting them.

For deterministic tests, pass your own clock. `Clock` is exported from the
package root:

```typescript
import { Scheduler } from "@zudojs/scheduler";
import type { Clock } from "@zudojs/scheduler";

const clock: Clock = { now: () => new Date(0), nowMs: () => 0 };
const scheduler = new Scheduler({ clock });
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

`ctx.attempt` is the attempt in progress, **1-based**: `1` on the first run,
`2` on the first retry. `ctx.attemptNumber` is the same number under the name
`@zudojs/queue` uses for its processor context, so both packages count
attempts the same way.

An invalid cron expression throws `CronParseError` with the expression quoted
first and the reason after it:
`Invalid cron expression "99 0 * * *": Cron field "minute" value 99 is outside 0-59.`

## Concurrency and overlap

`maxConcurrency` (default 10) bounds executions in flight across all schedules;
work over the ceiling waits for the next tick. Per schedule, `overlap` decides
what happens when a fire time arrives while the previous run is still going:

```typescript
scheduler.every("10s", "report", { overlap: "skip" });
```

| `overlap`           | Behaviour when the previous run is still going  |
| ------------------- | ----------------------------------------------- |
| `"allow"` (default) | starts the new run alongside it                 |
| `"skip"`            | drops the fire time                             |
| `"queue"`           | holds it and runs it when the current one ends  |
| `"replace"`         | aborts the running execution and starts a new one |

`JobOptions.overlap` sets the default for every schedule of a job;
`ScheduleOptions.overlap` overrides it per schedule.

`JobOptions.concurrency` caps how many executions of one job run at once
across every schedule that fires it. A fire time arriving at the ceiling is
held and dispatched when an execution finishes, not dropped:

```typescript
scheduler.define({
  id: "reindex",
  name: "Reindex a tenant",
  options: { concurrency: 2 },
  handler: reindex,
});
```

`ScheduleOptions.priority` breaks ties between schedules due at the same
instant — higher runs first. It never lets a schedule jump ahead of one due
earlier.

## Misfires

A fire time already in the past follows the schedule's `misfire` policy. This
is the case for `at(pastDate)`, for a schedule restored after a restart, and
for a recurring schedule whose process was blocked past its fire time.

| `misfire`              | Behaviour                                            |
| ---------------------- | ---------------------------------------------------- |
| `"run-once"` (default) | runs once immediately, then resumes from now         |
| `"skip"`               | refuses the schedule                                 |
| `"catch-up"`           | replays every missed occurrence until it is current  |

```typescript
scheduler.every("1h", "hourly-rollup", { misfire: "catch-up" });
```

A cron expression that can never fire (`0 0 30 2 *`, 30 February) is not a
misfire: `cron()` throws `InvalidScheduleError` at registration.

Schedules may be added before or after `start()`. One added to a running
scheduler re-arms the timer immediately, so it fires on time even when it is
due sooner than every existing schedule.

## Execution history

The scheduler keeps the last 100 executions (`MAX_EXECUTION_HISTORY`), each a
`JobExecution` with its status, timings and error:

```typescript
scheduler.getExecutions("cleanup");
// [{ id, jobId, scheduleId, status: "completed" | "failed" | "timed_out" |
//    "cancelled" | "running", scheduledAt, startedAt, completedAt,
//    duration, attempt, error? }]
```

`attempt` is the attempt that settled the run — `3` for a run whose retry
policy let it succeed on its third try — and, while the run is still going,
the attempt currently in progress.

## Features

- Delay, date, interval and cron triggers
- Real five-field cron parsing with macros, ranges, steps and names
- Bound schedule handles: pause, resume, cancel, next-run
- Retry policies with fixed, linear and exponential backoff, capping and jitter
- Per-job timeouts that abort the handler through `AbortSignal`
- Global concurrency ceiling, per-job concurrency limits, and per-schedule
  overlap and misfire policies
- Bounded execution history
- Graceful shutdown with abort or drain
- Min-heap priority queue, O(log n) insert and remove

## Not included

This package schedules work inside one process. It has no persistence, no
cross-process locking and no worker pool — a restart loses the schedule, and two
instances will each run the same job. Pair it with `@zudojs/queue` when you need
durability or distribution.

Because there is no store and no lock, the store, lock, not-started and
schedule-lookup error classes are not re-exported here; they live in
`@zudojs/errors` for a durable scheduler built on top.

## Use Cases

- Scheduled maintenance and cleanup
- Periodic synchronisation
- Report generation
- Cache warming and refresh
