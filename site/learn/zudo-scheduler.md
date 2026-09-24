---
title: "Scheduled tasks"
description: "Run work on the clock, not on a request. Intervals, one-off runs and cron expressions, time zones, retries and failed runs, overlapping runs, restarts, and running a schedule on one instance only, with @zudojs/scheduler."
source: https://zudojs.oyinlola.site/learn/zudo-scheduler
---

LESSON 68 OF 84

Events, messages and background work Advanced

# Scheduled tasks

Run work on the clock, not on a request. Intervals, one-off runs and cron expressions, time zones, retries and failed runs, overlapping runs, restarts, and running a schedule on one instance only, with @zudojs/scheduler.

- **40 min** to read and try
- **You need:** The background jobs lesson
- **You build:** A weekday 09:00 digest and a nightly cleanup for the Task API, safe to run with several servers

  [Test yourself](#test)

## Work that the clock starts

Everything the Task API has done so far started with a request: a user clicks, a job is queued. Some work has no user behind it. It starts because of the time:

- At 09:00 every weekday, email each user a digest of their open tasks.
- Every night, delete completed tasks older than 30 days.
- Every 5 minutes, refresh the cached statistics.

A **scheduler** runs a function at the times you describe. You could build a crude one with `setTimeout`, but you would soon need everything else: repeating on a calendar, stopping cleanly on shutdown, timeouts, retries, and not starting a second run while the first is still going. `@zudojs/scheduler` is that machinery.

A scheduler and a queue work together. The scheduler decides *when*. The queue from [the background jobs lesson](https://zudojs.oyinlola.site/learn/zudo-queue) makes sure the work is *done*, with retries and dead letters. You will connect them at the end.

## Install @zudojs/scheduler

Terminal on your computer

```bash
$ npm install @zudojs/scheduler

added 1 package, and audited 78 packages in 3s
…
```

This package is not in the browser terminal, so every example on this page says **Node.js only**. Save each one in your `task-api/src` folder and run it with `npx tsx src/<file>.ts`. You will see the output shown under it.

## Your first schedule

Three steps, always in this order: create a scheduler, **define** a job (give a function a name), then **schedule** that name. Nothing runs until you call `start()`:

first.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler();
let runs = 0;
let done: () => void = () => {};
const threeRuns = new Promise<void>((resolve) => (done = resolve));

scheduler.define({
  id: "refresh-stats",
  name: "Refresh the cached statistics",
  handler: (ctx) => {
    runs += 1;
    console.log(`run ${runs} of ${ctx.jobId}`);
    if (runs === 3) done();
  },
});

const handle = scheduler.every("50ms", "refresh-stats");
console.log("schedule is", handle.state);

scheduler.start();
await threeRuns;
await scheduler.stop();
console.log("stopped after", runs, "runs");
```

Output of `npx tsx first.ts`

```ts
schedule is active
run 1 of refresh-stats
run 2 of refresh-stats
run 3 of refresh-stats
stopped after 3 runs
```

- A **job** is a named function: an `id`, a `name` for people, and a `handler`. Scheduling an id you never defined throws.
- A **schedule** is a rule about when to run a job. `every("50ms", id)` runs it every 50 milliseconds, starting 50 ms from now. In the Task API you would write `every("5m", …)`. One job can have several schedules.
- `every` returns a **handle**, a remote control for that one schedule.
- `stop()` ends the timers. Call it when your app shuts down, from the same place that stops the queue workers.

Waiting for a promise that the third run resolves, instead of waiting a fixed time, keeps the example exact even on a slow computer.

Node.js exits when it has nothing left to wait for. A started scheduler counts as something to wait for, so a small process that only runs schedules keeps running until you call `stop()`. That is why the example must call `stop()` to finish. (If you ever want the old behaviour, where the scheduler alone does not keep Node.js running, pass `keepAlive: false`.)

## Once, after, every

There are four ways to schedule a defined job:

| Call | Runs |
| --- | --- |
| `after("30s", id)` | Once, 30 seconds from now |
| `at(new Date("2027-01-01T00:00:00Z"), id)` | Once, at that instant |
| `every("5m", id)` | Again and again, every 5 minutes |
| `cron("0 9 * * 1-5", id)` | At calendar times: 09:00 on weekdays |

Durations are strings with a unit: `ms`, `s`, `m`, `h`, `d` and `w`, which you can combine. A bare number is rejected, because nobody can tell whether `5` means seconds or minutes:

durations.tsNode.js only

```ts
import { InvalidDurationError, parseDuration } from "@zudojs/scheduler";

for (const text of ["250ms", "30s", "5m", "1h30m", "1d", "1w"]) {
  console.log(text.padEnd(6), "=", parseDuration(text), "ms");
}

try {
  parseDuration("5");
} catch (error) {
  if (error instanceof InvalidDurationError) console.log("5 ->", error.name);
}
```

Output of `npx tsx durations.ts`

```ts
250ms  = 250 ms
30s    = 30000 ms
5m     = 300000 ms
1h30m  = 5400000 ms
1d     = 86400000 ms
1w     = 604800000 ms
5 -> InvalidDurationError
```

Each call can pass `data`, which the handler reads as `ctx.data`: `scheduler.every("1h", "sync", { data: { source: "billing" } })`.

## Cron expressions

`every("24h")` runs 24 hours after the app started, which could be 15:37. For "09:00 every weekday" you need a calendar rule. A **cron expression** is the standard way to write one, from the Unix tool `cron`. It is five fields separated by spaces:

| Field | Values | Example |
| --- | --- | --- |
| 1. minute | 0 to 59 | `0` = at minute 0 |
| 2. hour | 0 to 23 | `9` = 09:00 |
| 3. day of month | 1 to 31 | `*` = any day |
| 4. month | 1 to 12, or `jan` to `dec` | `*` = any month |
| 5. day of week | 0 to 6 (0 is Sunday), or `sun` to `sat` | `1-5` = Monday to Friday |

In each field, `*` means "any", `1-5` is a range, `1,15` is a list, and `*/15` means "every 15th": 0, 15, 30, 45. So `0 9 * * 1-5` reads "minute 0, hour 9, any day, any month, Monday to Friday".

Cron expressions are easy to get wrong, so check them. A `CronTrigger` computes the next run after any date you give it, without starting anything. Starting from a fixed date, Friday 2 October 2026 at 12:00 UTC, the answers are the same on every computer:

cron.tsNode.js only

```ts
import { CronTrigger } from "@zudojs/scheduler";

const from = new Date("2026-10-02T12:00:00Z");

function nextRuns(expression: string, count: number): string {
  const trigger = new CronTrigger(expression, "UTC");
  const runs: string[] = [];
  let after = from;
  for (let i = 0; i < count; i++) {
    const next = trigger.next(after);
    if (!next) break;
    runs.push(next.toISOString().slice(0, 16).replace("T", " "));
    after = next;
  }
  return runs.join(" | ");
}

console.log("0 9 * * 1-5  ", nextRuns("0 9 * * 1-5", 3));
console.log("*/15 * * * * ", nextRuns("*/15 * * * *", 3));
console.log("30 2 * * *   ", nextRuns("30 2 * * *", 3));
console.log("0 0 1 * *    ", nextRuns("0 0 1 * *", 3));
console.log("@hourly      ", nextRuns("@hourly", 2));
```

Output of `npx tsx cron.ts`

```ts
0 9 * * 1-5   2026-10-05 09:00 | 2026-10-06 09:00 | 2026-10-07 09:00
*/15 * * * *  2026-10-02 12:15 | 2026-10-02 12:30 | 2026-10-02 12:45
30 2 * * *    2026-10-03 02:30 | 2026-10-04 02:30 | 2026-10-05 02:30
0 0 1 * *     2026-11-01 00:00 | 2026-12-01 00:00 | 2027-01-01 00:00
@hourly       2026-10-02 13:00 | 2026-10-02 14:00
```

- The weekday digest skips Saturday 3 and Sunday 4 October and first runs on Monday the 5th.
- `*/15` starts at 12:15, not 12:00: the next run is always strictly *after* the date you give.
- `@hourly` is a shortcut for `0 * * * *`. `@daily`, `@weekly`, `@monthly` and `@yearly` exist too.

> THE TWO DAY FIELDS
>
> When both day fields are set, cron runs when *either* matches, not both. `0 0 13 * 5` does not mean "Friday the 13th": it runs on every 13th *and* on every Friday. Every cron tool behaves this way. Check an expression like this with `CronTrigger` before you trust it.

A broken expression fails when you write it, not at 2 a.m.:

cron-errors.tsNode.js only

```ts
import { CronParseError, InvalidScheduleError, Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler();
scheduler.define({ id: "digest", name: "Daily digest", handler: () => {} });

for (const expression of ["0 9 * *", "0 25 * * *", "0 0 30 2 *"]) {
  try {
    scheduler.cron(expression, "digest", { timezone: "UTC" });
  } catch (error) {
    if (error instanceof CronParseError || error instanceof InvalidScheduleError) {
      console.log(expression.padEnd(11), "->", error.name);
      console.log("   ", error.message);
    }
  }
}
```

Output of `npx tsx cron-errors.ts`

```ts
0 9 * *     -> CronParseError
    Invalid cron expression "0 9 * *": Cron expression must have 5 fields (minute hour day-of-month month day-of-week), got 4.
0 25 * * *  -> CronParseError
    Invalid cron expression "0 25 * * *": Cron field "hour" value 25 is outside 0-23.
0 0 30 2 *  -> InvalidScheduleError
    Recurring trigger has no future fire time ("0 0 30 2 *").
```

Four fields instead of five, and hour 25, cannot be parsed, and the message names the expression and the field that is wrong. `0 0 30 2 *` is valid cron, but 30 February never comes, so the schedule is refused.

## Time zones

"09:00" is not a moment until you say *where*. 09:00 in Lagos and 09:00 in Tokyo are eight hours apart. By default, cron fields are read in the **local time zone of the server**, whatever the operating system is set to. Pass `timezone: "UTC"` to read them in UTC, the same everywhere:

time-zones.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";
import type { Clock } from "@zudojs/scheduler";

const now = new Date("2026-10-02T12:00:00Z");
const clock: Clock = { now: () => new Date(now), nowMs: () => now.getTime() };
const scheduler = new Scheduler({ clock });
scheduler.define({ id: "digest", name: "Weekday digest", handler: () => {} });

const digest = scheduler.cron("0 9 * * 1-5", "digest", { timezone: "UTC" });
console.log("next digest:", digest.nextRun()?.toISOString());

try {
  scheduler.cron("0 9 * * 1-5", "digest", { timezone: "Africa/Lagos" });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx time-zones.ts`

```ts
next digest: 2026-10-05T09:00:00.000Z
InvalidScheduleError - CronTrigger supports only "UTC" or the system local zone, got "Africa/Lagos"
```

Two things are new here:

- A **clock** is where the scheduler reads the current time: an object with `now()` and `nowMs()`, described by the `Clock` type. This one always says 12:00 on 2 October, so `nextRun()` gives the same answer on every computer. That is how you test schedules without waiting for real time to pass.
- Named zones such as `"Africa/Lagos"` are refused rather than silently ignored, because the package carries no time-zone database.

The advice for servers: run schedules in **UTC**. Servers move between regions and clouds, and many places change their clocks for **daylight saving time**. On the night the clocks jump forward, 02:30 local time does not exist, and a local-time job at 02:30 is skipped. When they jump back, 02:30 happens twice. UTC never jumps. If users want their digest at 09:00 *their* time, store each user's zone and compute the UTC time for them.

## Pausing, resuming, cancelling

The handle controls a live schedule. `listSchedules()` shows everything the scheduler knows:

handles.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";

const now = new Date("2026-10-02T12:00:00Z");
const scheduler = new Scheduler({
  clock: { now: () => new Date(now), nowMs: () => now.getTime() },
});
scheduler.define({ id: "cleanup", name: "Delete old completed tasks", handler: () => {} });
scheduler.define({ id: "refresh-stats", name: "Refresh statistics", handler: () => {} });

const cleanup = scheduler.cron("30 2 * * *", "cleanup", { timezone: "UTC" });
const stats = scheduler.every("5m", "refresh-stats");

await stats.pause();
console.log("stats:", stats.state);
await stats.resume();
console.log("stats:", stats.state, stats.nextRun()?.toISOString());

await cleanup.cancel();
console.log("cleanup:", cleanup.state, cleanup.nextRun());

for (const schedule of scheduler.listSchedules()) {
  console.log(schedule.jobId, schedule.type, schedule.state, schedule.nextRunAt.toISOString());
}
```

Output of `npx tsx handles.ts`

```ts
stats: paused
stats: active 2026-10-02T12:05:00.000Z
cleanup: cancelled undefined
refresh-stats interval active 2026-10-02T12:05:00.000Z
```

A paused schedule does not fire. Resuming computes the next run from *now*: a schedule paused over three fire times does not fire three times at once when you resume it. A cancelled schedule is gone for good, and a run that was in progress is aborted through its signal.

## Failed runs, retries and timeouts

A handler that throws does not crash the scheduler, and it is not silently forgotten. A job can have a **retry policy**. What still fails after the last retry goes to the scheduler's `onError` callback, and every run is kept in a short history:

failures.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scheduler = new Scheduler({
  onError: ({ jobId, error }) => {
    if (error instanceof Error) console.log(`onError: ${jobId}: ${error.name}: ${error.message}`);
  },
});

scheduler.define({
  id: "sync-calendar",
  name: "Sync the calendar",
  options: { retry: { attempts: 3, strategy: "exponential", delay: 10 } },
  handler: (ctx) => {
    console.log(`sync-calendar attempt ${ctx.attempt}`);
    if (ctx.attempt < 3) throw new Error("calendar API returned 503");
  },
});

scheduler.define({
  id: "build-report",
  name: "Build the weekly report",
  options: { timeout: 50 },
  handler: async (ctx) => {
    await wait(150);
    console.log("build-report noticed the abort:", ctx.signal.aborted);
  },
});

scheduler.after("10ms", "sync-calendar");
scheduler.after("100ms", "build-report");
scheduler.start();
await wait(500);

for (const run of scheduler.getExecutions()) {
  console.log("history:", run.jobId, run.status, "after attempt", run.attempt);
}
await scheduler.stop();
```

Output of `npx tsx failures.ts`

```ts
sync-calendar attempt 1
sync-calendar attempt 2
sync-calendar attempt 3
onError: build-report: SchedulerJobTimeoutError: Job timed out after 50ms.
build-report noticed the abort: true
history: sync-calendar completed after attempt 3
history: build-report timed_out after attempt 1
```

- `sync-calendar` failed twice and worked on the third attempt, so `onError` never heard about it. `ctx.attempt` starts at 1. `ctx.attemptNumber` is the same number, under the name the queue uses.
- `build-report` ran past its 50 ms `timeout`. The scheduler aborted `ctx.signal` and reported a `SchedulerJobTimeoutError`. As with every signal in this course, the handler has to look at it. Pass it on to `fetch` and database calls.
- `getExecutions()` keeps the last 100 runs with their status and the attempt they ended on: `completed`, `failed`, `timed_out` or `cancelled`. Other errors arrive in `onError` as `SchedulerJobExecutionError`, with the original error as its `cause`.

In the Task API, `onError` should log with the logger and raise an alert. A nightly job that fails every night for a month without anyone noticing is a classic production story.

## Overlapping runs

You schedule a job every 10 minutes. One day the database is slow and a run takes 25 minutes. The next fire times arrive while the first run is still going. That is an **overlap**, and each schedule decides what to do with its `overlap` option:

overlap.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryPolicy(overlap: "allow" | "skip"): Promise<void> {
  const scheduler = new Scheduler();
  let running = 0;
  let mostAtOnce = 0;
  scheduler.define({
    id: "slow-cleanup",
    name: "A cleanup that is slower than its interval",
    handler: async () => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await wait(150);
      running -= 1;
    },
  });
  scheduler.every("40ms", "slow-cleanup", { overlap });
  scheduler.start();
  await wait(300);
  await scheduler.stop();
  console.log(`${overlap}: runs overlapped: ${mostAtOnce > 1}`);
}

await tryPolicy("allow");
await tryPolicy("skip");
```

Output of `npx tsx overlap.ts`

```ts
allow: runs overlapped: true
skip: runs overlapped: false
```

- `"allow"`, the default, starts a new run next to the old one. Runs pile up, each one slowing the database further.
- `"skip"` drops a fire time while a run is still going. For cleanups and syncs this is almost always what you want: the running one will do the work.
- `"queue"` holds one fire time and runs it right after the current run ends. `"replace"` aborts the running one and starts fresh, for when only the newest result matters.

`new Scheduler({ maxConcurrency })` also caps how many runs of *all* jobs may be in progress at once. The default is 10.

## Restarts and persistent schedules

The scheduler keeps everything in memory. Nothing is written to disk. When the process restarts, every schedule is gone. That sounds bad, but for most recurring work it is fine:

- **Recurring schedules live in your code.** The weekday digest and the nightly cleanup are defined when the app starts, every time it starts. The code is the source of truth, so there is nothing to lose.
- **Schedules that users create must be stored.** "Remind me on 12 October at 08:00" is data. Save it in the database, as in [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database), and when the app starts, read the rows and schedule them again.

When the app restores a reminder whose time already passed while it was down, the `misfire` option decides: `"run-once"` (the default) runs it once right away, and `"skip"` refuses it:

restore.tsNode.js only

```ts
import { Scheduler } from "@zudojs/scheduler";

interface ReminderRow {
  readonly id: number;
  readonly taskId: number;
  readonly remindAt: string;
}

const rows: ReminderRow[] = [
  { id: 1, taskId: 4, remindAt: "2026-10-02T08:00:00Z" },
  { id: 2, taskId: 7, remindAt: "2026-10-12T08:00:00Z" },
];

const now = new Date("2026-10-02T12:00:00Z");
const scheduler = new Scheduler({
  clock: { now: () => new Date(now), nowMs: () => now.getTime() },
});
scheduler.define({ id: "task-reminder", name: "Send one task reminder", handler: () => {} });

for (const row of rows) {
  const handle = scheduler.at(new Date(row.remindAt), "task-reminder", {
    misfire: "run-once",
    data: { reminderId: row.id, taskId: row.taskId },
  });
  console.log(`reminder ${row.id}: runs at ${handle.nextRun()?.toISOString()}`);
}
```

Output of `npx tsx restore.ts`

```ts
reminder 1: runs at 2026-10-02T12:00:00.000Z
reminder 2: runs at 2026-10-12T08:00:00.000Z
```

Reminder 1 was due at 08:00, while the server was down. With `run-once` it runs at once, at 12:00. Reminder 2 is still in the future and keeps its time. The handler then marks the row as sent, so a later restart does not send it again.

> TIP
>
> For one-off work like a reminder, a delayed job on a stored queue (`queue.add(name, data, { scheduledAt })` from the last lesson) is often simpler: the queue already stores it, retries it and survives restarts. Use the scheduler for recurring, clock-based work.

## Run it on one instance only

In production you usually run two or more copies of the Task API behind a load balancer, as you will in [the deployment lesson](https://zudojs.oyinlola.site/learn/deployment). Each copy starts its own scheduler. At 09:00 each one sends the digest, and every user gets it twice, or ten times.

There are three common fixes:

- **One scheduler process.** Start the scheduler only where a setting says so, for example `SCHEDULER_ENABLED=true` on exactly one instance, or in a separate small "scheduler" service. Simple, but if that one instance is down, nothing runs.
- **A lock in a shared store.** Every copy fires, but the job first takes a lock such as `digest.2026-10-05` in Redis. Only the copy that gets it does the work. The lock from [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache) works this way when you give it a shared lock store.
- **Let the scheduler only enqueue.** The scheduled handler does no work itself. It adds a job to a shared queue with a `deduplicationKey` made from the date. Duplicates are refused, and the real work gets the queue's retries and dead letters.

Here is the third pattern. Two schedulers stand for two servers, and they share one queue. Both fire, and both queue a job. The processor is **idempotent**, as in the last lesson: it records each day it has sent, so the second job does nothing:

one-instance.tsNode.js only

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { Scheduler } from "@zudojs/scheduler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sentDays = new Set<string>();

const digests = createInMemoryQueue<{ day: string }>(createQueueName("digests"));
digests.process("send-digest", async (job) => {
  if (sentDays.has(job.data.day)) {
    console.log("worker: digest already sent today, skipping");
    return;
  }
  sentDays.add(job.data.day);
  console.log("worker: sending the digest");
});

function startServer(name: string): Scheduler {
  const scheduler = new Scheduler();
  scheduler.define({
    id: "enqueue-digest",
    name: "Enqueue the daily digest",
    handler: async (ctx) => {
      const day = ctx.scheduledAt.toISOString().slice(0, 10);
      await digests.add("send-digest", { day });
      console.log(`${name}: queued the digest`);
    },
  });
  scheduler.after("20ms", "enqueue-digest");
  scheduler.start();
  return scheduler;
}

const a = startServer("server A");
const b = startServer("server B");
await wait(400);
await a.stop();
await b.stop();
await digests.close();
```

Output of `npx tsx one-instance.ts`

```ts
server A: queued the digest
server B: queued the digest
worker: sending the digest
worker: digest already sent today, skipping
```

Both "servers" fired and queued a job, but only one digest went out. The day comes from `ctx.scheduledAt`, the time the run was due, so tomorrow's run is a new day. In the real Task API, `sentDays` is a database table with a unique `day` column: the database then refuses the second insert even when two workers on two machines try at the same moment.

Why not use the queue's `deduplicationKey`? It only refuses a second job while the first one is still in the queue. Once the first digest job has finished, a job with the same key is accepted again. The idempotent processor protects you no matter when the duplicate arrives.

The production checklist for scheduled work:

- Run it on one instance, or make duplicates harmless with a lock or a deduplication key.
- Write cron expressions in UTC, and check them with `CronTrigger`.
- Choose `overlap: "skip"` for anything that can run longer than its interval.
- Give every job a `timeout`, honour `ctx.signal`, and send failures from `onError` to your logs and alerts.
- Keep handlers short. Heavy work goes on a queue.
- Call `stop()` on shutdown. By default it aborts running jobs and waits for them to settle. `stop({ drain: true })` lets them finish instead. Calling `stop()` twice, or on a scheduler that never started, is safe.

## Practice

TRY IT YOURSELF

### Write the expressions

Write cron expressions for: (a) every day at 23:45; (b) every 10 minutes during office hours, 08:00 to 17:59, Monday to Friday; (c) at 06:00 on the first day of every quarter (January, April, July, October). Check each with `CronTrigger` from 2 October 2026, 12:00 UTC.

**Show a solution**

exercise-cron.tsNode.js only

```ts
import { CronTrigger } from "@zudojs/scheduler";

const from = new Date("2026-10-02T12:00:00Z");
const expressions = ["45 23 * * *", "*/10 8-17 * * 1-5", "0 6 1 1,4,7,10 *"];

for (const expression of expressions) {
  const trigger = new CronTrigger(expression, "UTC");
  const first = trigger.next(from);
  const second = first ? trigger.next(first) : null;
  console.log(expression.padEnd(18), first?.toISOString(), second?.toISOString());
}
```

Output of `npx tsx exercise-cron.ts`

```ts
45 23 * * *        2026-10-02T23:45:00.000Z 2026-10-03T23:45:00.000Z
*/10 8-17 * * 1-5  2026-10-02T12:10:00.000Z 2026-10-02T12:20:00.000Z
0 6 1 1,4,7,10 *   2027-01-01T06:00:00.000Z 2027-04-01T06:00:00.000Z
```

The quarterly job's next run is 1 January 2027: 1 October 2026 has just passed.

TRY IT YOURSELF

### Skip the overlap

A "recalculate statistics" job runs every 30 seconds but sometimes takes 45 seconds. Which `overlap` policy should it use, and why? What would you change if it often took 2 minutes?

**Show a solution**

`"skip"`: a run that is still going will produce fresh statistics anyway, and a second run in parallel only doubles the load. If it often takes 2 minutes, the interval is simply too short for the work. Make the interval longer, make the job faster (for example by only recalculating users whose tasks changed), or move the work to a queue.

## Recap

- A scheduler runs work on the clock. Define a job, schedule it with `after`, `at`, `every` or `cron`, then `start()`. `stop()` on shutdown.
- A cron expression has five fields: minute, hour, day of month, month, day of week. Check expressions with `CronTrigger` from a fixed date.
- Use `timezone: "UTC"`. Local time has daylight-saving gaps and repeats.
- Handles pause, resume and cancel schedules. A fixed `clock` makes schedules testable.
- Retry policies, timeouts with `ctx.signal`, `onError` and `getExecutions()` keep failures visible.
- `overlap: "skip"` stops slow runs from piling up.
- Nothing is stored: define recurring schedules in code, and store user-created ones in the database.
- Several instances each run the schedule. Run it on one, or make duplicates harmless with a lock or a queue deduplication key.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
