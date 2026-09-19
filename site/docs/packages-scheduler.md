---
title: "@zudojs/scheduler — Time & Recurring Execution Engine"
description: "Complete documentation for @zudojs/scheduler — the time and recurring execution engine for the Zudojs framework."
source: https://zudojs.oyinlola.site/docs/packages-scheduler
---

v1.1.1

# @zudojs/scheduler

Runs your code later, or over and over: after a delay, at a date, on a fixed interval, or on a cron schedule — inside one Node.js process.

SCHEDULER CRON JOBS RETRIES TIMERS

## OVERVIEW

**Scheduling** means telling the computer “run this piece of code at this time” instead of running it right now. You hand over a function and a time rule; something else watches the clock and calls the function when the moment arrives.

You can do a crude version of this yourself with `setTimeout`. That stops being enough quickly: you need the job to repeat, to stop cleanly when the process shuts down, to give up if it hangs, to retry when it fails, and to not pile up ten copies of itself. This package is that machinery.

Everything happens inside your own process. There is no database, no Redis and no separate worker. That keeps it simple and makes it a poor fit for some jobs — see [Scheduler vs. queue](#scheduler-vs-queue).

USE IT WHEN

- You want housekeeping on a timer — expire sessions, prune logs, refresh a cache.
- You want a nightly or weekly task inside a service you already run.
- You want a heartbeat or a poll every few seconds.
- Missing a run because the process restarted is acceptable.

DO NOT USE IT WHEN

- The work must survive a restart. Nothing is written to disk.
- You run several copies of your service. Each copy runs the job, so it happens twice.
- The work is triggered by a user action rather than by the clock — that is a queue.
- You need a real IANA time zone such as `America/New_York`. Only UTC and the machine's local zone are supported.

## INSTALLATION

Install the package. It needs Node.js 24 or newer, and it pulls in `@zudojs/errors`, `@zudojs/constants` and `@zudojs/types` on its own.

```bash
$ npm install @zudojs/scheduler
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## QUICK START

Three steps, always in this order: create a scheduler, *define* a job so it has a name, then *schedule* that name. Scheduling a name you never defined throws.

This program prints a line once per second for about three seconds, then shuts down.

```ts
import { Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler();

// 1. Define the job: an id, a human-readable name, and the function to run.
scheduler.define({
  id: "heartbeat",
  name: "Print a heartbeat",
  handler: (ctx) => {
    console.log("beat", ctx.attempt);
  },
});

// 2. Schedule it: run every second, forever.
const handle = scheduler.every("1s", "heartbeat");
console.log("next run:", handle.nextRun());

// 3. Start the clock. Nothing runs until you call start().
scheduler.start();

// Shut down after 3.5 seconds.
setTimeout(async () => {
  await scheduler.stop();
  console.log("stopped");
}, 3500);
```

What you should see — the date will be yours, one second in the future:

```ts
next run: 2026-09-09T10:15:31.412Z
beat 1
beat 1
beat 1
stopped
```

> IN PLAIN WORDS
>
>
>
> A **job** is a named function. A **schedule** is a rule about when to call it. A **handle** is the remote control for one schedule. One job can have many schedules pointing at it.

## JOBS

`define()` registers a job. It takes an `id` (a non-empty string, unique), a `name` for humans, a `handler` function, and optional `options`. Defining the same id twice throws `SchedulerJobAlreadyExistsError`.

Your handler receives one argument, the **job context**. It carries the ids, the time the run was scheduled for, the time it actually started, the attempt number, any `data` you attached to the schedule, and an `AbortSignal`.

The **signal** is how the scheduler asks a running job to stop — on timeout, on cancel, or on shutdown. Pass it to anything that accepts one, such as `fetch`, and long jobs stop promptly instead of hanging around.

```ts
import { Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler();

scheduler.define({
  id: "fetch-rates",
  name: "Fetch exchange rates",
  options: { timeout: 5_000 },
  handler: async (ctx) => {
    // Hand the signal over: a timeout then cancels the request itself.
    const response = await fetch("https://example.com/rates", {
      signal: ctx.signal,
    });
    console.log("job", ctx.jobId, "status", response.status);
  },
});

const handle = scheduler.every("10m", "fetch-rates");
console.log(handle.id, handle.state);
scheduler.start();
```

The `console.log` prints a random UUID and the word `active`, for example `3f0c1a7e-9b21-4d0e-8a55-2c7f6b1e0d44 active`. Every ten minutes the handler then prints `job fetch-rates status 200`.

> COMMON MISTAKE
>
>
>
> Calling `scheduler.every("10m", "fetch-rates")` before `define()` throws `InvalidJobError`. Define first, schedule second.

## SCHEDULING

There are four ways to schedule a defined job. Each returns a `ScheduleHandle`.

| Call | When it runs | Repeats? |
| --- | --- | --- |
| `after("30s", "job-id")` | Once, 30 seconds from now. | No |
| `at(new Date("2027-01-01"), "job-id")` | Once, at that instant. | No |
| `every("5m", "job-id")` | Every five minutes, starting five minutes from now. | Yes |
| `cron("0 2 * * *", "job-id")` | Every day at 02:00. | Yes |

### Duration strings

`after()` and `every()` take a duration string, not a number. Units are `ms`, `s`, `m`, `h`, `d`, `w`, and you can stick them together. `parseDuration` is exported if you want the milliseconds yourself.

```ts
import { parseDuration } from "@zudojs/scheduler";

console.log(parseDuration("250ms")); // 250
console.log(parseDuration("5s"));    // 5000
console.log(parseDuration("1h30m")); // 5400000
console.log(parseDuration("1w"));    // 604800000
```

Anything else throws `InvalidDurationError`: a bare number (`"5"`), an unknown unit (`"5x"`), a decimal (`"1.5h"`), a negative or zero value, and anything over roughly a century.

### Controlling a schedule

The handle is wired to the live schedule, so these actually change what runs.

```ts
const handle = scheduler.every("1h", "sync");

handle.nextRun();      // Date — the real next fire time, or undefined once gone
handle.state;          // "active" | "paused" | "cancelled" | "completed"

await handle.pause();  // stops firing, keeps the schedule
await handle.resume(); // recomputes the next time from now
await handle.cancel(); // aborts any run in progress, then removes the schedule
```

Resuming deliberately recomputes from the current time. A schedule paused across three of its fire times does not fire three times the moment you resume it.

### A time that has already passed

`at()` with a date in the past is a **misfire**. That is not an error by default: the `misfire` option is `"run-once"`, so the job runs immediately. Pass `{ misfire: "skip" }` to reject the schedule instead, which throws `InvalidScheduleError`.

```ts
scheduler.at(new Date(Date.now() - 60_000), "report");
// runs as soon as start() is called

scheduler.at(new Date(Date.now() - 60_000), "report", { misfire: "skip" });
// throws InvalidScheduleError
```

> NOT IMPLEMENTED YET
>
>
>
> The third misfire value, `"catch-up"`, replays each missed occurrence, rescheduling from the last fire time. `priority` breaks ties between schedules due at the same instant (higher first). A one-shot resumed after its fire time follows its misfire policy: `run-once`/`catch-up` fire it immediately, `skip` retires it. Misfire policies apply to one-shots (`at`, `after`). A schedule added after `start()` fires on time; the timer is re-armed on every add.

## CRON EXPRESSIONS

A **cron expression** is five values separated by spaces that describe a repeating calendar time, such as “02:00 on weekdays”. It comes from Unix and it is the standard way to write a recurring schedule.

The five fields are always in this order:

| # | Field | Allowed values | Notes |
| --- | --- | --- | --- |
| 1 | minute | 0–59 | Minute past the hour. |
| 2 | hour | 0–23 | 24-hour clock. `0` is midnight. |
| 3 | day of month | 1–31 | Day number in the month. |
| 4 | month | 1–12 or `jan`–`dec` | Names are case-insensitive. |
| 5 | day of week | 0–6 or `sun`–`sat` | 0 is Sunday. 7 also means Sunday. |

Each field takes one of these shapes:

- `*` — every value. “Any minute”, “any month”.
- A single number — `5` means exactly 5.
- A range — `1-5` means 1, 2, 3, 4, 5. The start must not be larger than the end.
- A step — `*/15` means every 15th value: 0, 15, 30, 45. `10-30/5` means 10, 15, 20, 25, 30.
- A list — `1,15` means 1 and 15. List items can themselves be ranges or steps.

### One worked example

Take `30 2 * * 1-5` and read it left to right:

| Field | Value | Reads as |
| --- | --- | --- |
| minute | `30` | at minute 30 |
| hour | `2` | of hour 2 (02:xx) |
| day of month | `*` | on any day number |
| month | `*` | in any month |
| day of week | `1-5` | if it is Monday through Friday |

Put together: **02:30 every weekday**. You can check any expression without a scheduler:

```ts
import { parseCron, nextCronDate } from "@zudojs/scheduler";

const parsed = parseCron("30 2 * * 1-5");

// Saturday 20 June 2026, noon UTC. The third argument means "read the
// fields in UTC" rather than in the machine's local zone.
const next = nextCronDate(parsed, new Date("2026-06-20T12:00:00Z"), true);

console.log(next?.toISOString()); // 2026-06-22T02:30:00.000Z — the Monday
```

Five shorthand macros are also accepted anywhere an expression is:

| Macro | Same as | Meaning |
| --- | --- | --- |
| `@hourly` | `0 * * * *` | Top of every hour. |
| `@daily` / `@midnight` | `0 0 * * *` | Midnight every day. |
| `@weekly` | `0 0 * * 0` | Midnight every Sunday. |
| `@monthly` | `0 0 1 * *` | Midnight on the 1st. |
| `@yearly` / `@annually` | `0 0 1 1 *` | Midnight on 1 January. |

> WATCH OUT: THE TWO DAY FIELDS
>
>
>
> When day-of-month and day-of-week are *both* restricted, cron fires if **either** matches, not both. `0 0 1 * mon` means “the 1st of the month, *and* every Monday”. This is odd but it is what every cron does, so expressions copied from elsewhere behave the same here.

A bad expression throws `CronParseError` the moment you write it, not silently at 2 a.m. Wrong field count, a value out of range (`99 0 * * *`), a zero step (`*/0 * * * *`) and an inverted range (`5-1 * * * *`) are all rejected. An expression that can never happen, such as 30 February (`0 0 30 2 *`), parses, but `scheduler.cron()` rejects it with `InvalidScheduleError` because it has no next fire time within the five-year search (`nextCronDate` returns `null`).

## TIME ZONES

A cron expression says “02:30”, but 02:30 *where*? The time zone is what turns those numbers into an actual instant. The same expression fires at different moments in London and in Tokyo.

By default the fields are read in the **machine's local zone**, whatever the operating system is set to. Pass `timezone: "UTC"` to read them in UTC instead. `"Etc/UTC"` is accepted as the same thing.

```ts
// 02:30 on weekdays, in the server's local zone
scheduler.cron("30 2 * * 1-5", "nightly");

// 02:30 UTC on weekdays, wherever the server happens to live
scheduler.cron("30 2 * * 1-5", "nightly", { timezone: "UTC" });

// Throws InvalidScheduleError — no zone database is bundled
scheduler.cron("30 2 * * 1-5", "nightly", { timezone: "America/New_York" });
```

Any other zone name is **rejected** rather than quietly ignored, so a schedule never runs at a time you did not ask for. If you need a specific region, set the process time zone (`TZ=America/New_York`) and use the local-zone form.

> TIP: DAYLIGHT SAVING
>
>
>
> In a local zone that observes daylight saving, the clock jumps. A job at 02:30 can be skipped on the spring-forward day and run twice on the fall-back day. The search steps hour by hour on the wall clock, not by adding 3,600,000 milliseconds, which limits the damage — but `timezone: "UTC"` is the way to avoid the question entirely.

## OVERLAPPING RUNS

You schedule a job every ten seconds. One day it takes twenty-five seconds. The next fire time arrives while the previous run is still going. That is an **overlap**, and you have to decide what should happen.

The `overlap` option on the schedule decides. Set it per schedule, since two schedules of the same job can want different answers.

| Value | What happens | Use when |
| --- | --- | --- |
| `"allow"` (default) | The new run starts alongside the old one. Two copies run at once. | Runs are independent and safe to double up. |
| `"skip"` | The new run is dropped. The old one continues undisturbed. | A slow run has already covered the work. |
| `"replace"` | The old run is aborted through its `ctx.signal`, then the new one starts. | Only the freshest result matters. |

This job takes 120 ms but is scheduled every 10 ms. With `"skip"`, exactly one copy runs at a time.

```ts
import { Scheduler } from "@zudojs/scheduler";

let started = 0;
const scheduler = new Scheduler();

scheduler.define({
  id: "slow",
  name: "Slow job",
  handler: async () => {
    started++;
    await new Promise((resolve) => setTimeout(resolve, 120));
  },
});

scheduler.every("10ms", "slow", { overlap: "skip" });
scheduler.start();

setTimeout(async () => {
  console.log("runs started:", started); // runs started: 1
  await scheduler.stop({ timeoutMs: 500 });
}, 90);
```

Without `overlap: "skip"` that same program prints `runs started: 8` or so.

> NOT IMPLEMENTED YET
>
>
>
> The `OverlapPolicy` type also lists `"queue"`, but nothing implements it: it currently behaves like `"allow"`. Use `"skip"` or `"replace"`.

### The separate global ceiling

`overlap` is per schedule. `maxConcurrency` on the scheduler caps how many job runs may be in flight *in total*, across every schedule. It defaults to 10. Anything over the ceiling stays on the queue and is picked up on a later tick, not dropped.

```ts
const scheduler = new Scheduler({ maxConcurrency: 2 });
```

## FAILURES AND RETRIES

A job handler that throws does not crash the scheduler, and it does not disappear silently either. It is retried according to the job's retry policy, and whatever survives that is handed to the scheduler's `onError` callback.

A **retry policy** says how many attempts to make and how long to wait between them. `strategy` picks the shape of that wait: `"fixed"` always waits `delay`; `"linear"` waits `delay × attempt`; `"exponential"` doubles each time. `maxDelay` caps it, and `jitter: true` randomises it so many failing jobs do not all retry in the same instant.

This job fails twice and succeeds on the third attempt, then fails permanently the next time round.

```ts
import { Scheduler } from "@zudojs/scheduler";

const scheduler = new Scheduler({
  onError: ({ jobId, executionId, error }) => {
    console.error("job failed:", jobId, executionId, (error as Error).message);
  },
});

let calls = 0;

scheduler.define({
  id: "flaky",
  name: "Flaky upstream call",
  options: {
    timeout: 10_000,
    retry: {
      attempts: 3,
      strategy: "exponential",
      delay: 1_000,
      maxDelay: 30_000,
      jitter: true,
    },
  },
  handler: (ctx) => {
    calls++;
    console.log("attempt", ctx.attempt);
    if (calls < 3) throw new Error("upstream is down");
  },
});

scheduler.after("1s", "flaky");
scheduler.start();
```

You should see `attempt 1`, then `attempt 2` about a second later, then `attempt 3`, and no error line — the third attempt succeeded. Had all three failed, `onError` would have printed once.

The error you receive tells you *how* it failed:

| Error | Means | Notes |
| --- | --- | --- |
| `SchedulerJobTimeoutError` | The handler ran past `options.timeout`. | Default timeout is 30,000 ms. The handler's `ctx.signal` is aborted too. |
| `SchedulerJobExecutionError` | The handler threw. | The original error is kept on `.cause`. |
| `SchedulerJobCancelledError` | The run was aborted — by `cancel()`, by `stop()`, or by `overlap: "replace"`. | Retries stop as well. |

> DANGER
>
>
>
> Without `onError`, a permanently failing job fails invisibly — forever, if it is on an interval. Always pass `onError` in production.

## STARTING AND STOPPING

`start()` begins watching the clock. Nothing fires before it. Calling it twice throws `SchedulerAlreadyStartedError`. You can define jobs and create schedules before or after starting.

`stop()` is `async` — always `await` it. By default it aborts every run in flight and waits for them to settle. Pass `{ drain: true }` to let them finish instead, and `timeoutMs` to bound the wait either way. Calling it when already stopped rejects with `SchedulerStoppedError`.

```ts
// Let running jobs finish, but wait no longer than 30 seconds.
process.on("SIGTERM", async () => {
  await scheduler.stop({ drain: true, timeoutMs: 30_000 });
  console.log("scheduler stopped");
  process.exit(0);
});
```

Two read-only properties let you inspect the scheduler, and two methods let you inspect its schedules.

```ts
console.log(scheduler.isRunning);      // true
console.log(scheduler.scheduleCount);  // 3
console.log(scheduler.listSchedules().map((s) => s.jobId));
// [ 'cleanup', 'report', 'heartbeat' ]
console.log(scheduler.getSchedule(handle.id)?.nextRunAt);
```

## SCHEDULER VS. QUEUE

`@zudojs/scheduler` and [`@zudojs/queue`](https://zudojs.oyinlola.site/docs/packages-queue.md) both run functions in the background, and it is easy to reach for the wrong one. The difference is *what starts the work*.

The scheduler is driven by the **clock**. You declare a rule once and it fires on time, over and over, whether or not anything else happened.

The queue is driven by **events**. Something happens — a user signs up — and you push one piece of work onto a list for a worker to pick up as soon as it can.

|  | @zudojs/scheduler | @zudojs/queue |
| --- | --- | --- |
| Triggered by | The clock. | Code calling `add()`. |
| Unit of work | A named job plus a repeating time rule. | One job with its own payload. |
| Survives a restart | No. Schedules live in memory. | With a durable adapter, yes. |
| Several service instances | Each runs the job, so it happens N times. | One worker takes each job. |
| Typical use | Nightly cleanup, hourly sync, heartbeat. | Send this email, resize this image. |

They combine well. Let the scheduler fire on time and have its handler push the real work onto a queue — you get a reliable trigger and durable, distributed execution.

> DANGER: MULTIPLE INSTANCES
>
>
>
> Deploy three copies of a service that schedules a nightly billing job and the billing runs three times. This package has no cross-process lock. `SchedulerStoreError` and `SchedulerLockError` exist in the error list for future persistence work; no store or lock is implemented today.

## API REFERENCE

Everything below is exported from `@zudojs/scheduler`. Most applications only need the `Scheduler` class.

### Scheduler methods

| Name | What it does | Notes |
| --- | --- | --- |
| `new Scheduler(options?)` | Creates a scheduler. | Options: `jobs`, `executor`, `queue`, `clock`, `maxConcurrency`, `onError`. All optional. |
| `define(job)` | Registers a `JobDefinition`. | Throws `InvalidJobError` on a blank id, a missing handler or a non-positive timeout. |
| `after(duration, jobId, options?)` | Runs once after a delay. | Returns a `ScheduleHandle`. |
| `at(date, jobId, options?)` | Runs once at a `Date`. | A past date follows the misfire policy. |
| `every(duration, jobId, options?)` | Runs repeatedly on an interval. | First run is one interval away. |
| `cron(expression, jobId, options?)` | Runs repeatedly on a cron schedule. | Options also accept `timezone`. |
| `start()` | Starts the timer loop. | Throws `SchedulerAlreadyStartedError` if already running. |
| `stop(options?)` | Stops and waits for in-flight runs. | `async`. Options: `drain`, `timeoutMs`. |
| `getSchedule(scheduleId)` | Snapshot of one schedule, or `undefined`. | Read-only copy. |
| `listSchedules()` | Snapshots of every live schedule. | Completed and cancelled ones are gone. |
| `isRunning` / `scheduleCount` | Getters for state and live schedule count. | Read-only. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `parseDuration(text)` | Turns `"1h30m"` into milliseconds. | Throws `InvalidDurationError`. |
| `parseCron(expression)` | Parses a cron expression into a `ParsedCron`. | Throws `CronParseError`. |
| `nextCronDate(parsed, after, utc?)` | Next fire time strictly after `after`, or `null`. | `utc` defaults to `false` (local zone). |
| `retryDelay(policy, attempt)` | Milliseconds to wait before the next attempt. | Returns 0 when `policy` is `undefined`. |
| `createJobDefinition(id, name, handler, options?)` | Builds a frozen `JobDefinition`. | An alternative to the object literal. |
| `createJobContext(jobId, executionId, scheduledAt, startedAt, attempt, data, signal)` | Builds a frozen `JobContext`. | Mostly for tests; the executor builds one for you. |
| `createSchedule(id, jobId, type, nextRunAt, options?)` | Builds a frozen `Schedule`. | For building a queue by hand. |
| `createSystemClock()` | Returns a `SystemClock`. | Same as `new SystemClock()`. |
| `isSchedulerError(value)` | Type guard for `SchedulerError`. | Use in `catch` blocks. |
| `createSchedulerError(message, options?)` | Factory from `@zudojs/errors`. | Re-exported for convenience. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `Scheduler` | The one class most apps use. | See the table above. |
| `JobRegistry` | Holds job definitions: `register`, `get`, `getOrThrow`, `has`, `list`, `unregister`, `clear`. | The scheduler builds one unless you pass your own. |
| `JobExecutor` | Runs one job under a timeout, an abort signal and the retry policy. | `new JobExecutor(clock)`; `execute(job, executionId, scheduledAt, attempt, signal, data?)`. |
| `PriorityQueue` | Min-heap of schedules ordered by `nextRunAt`. | `enqueue` throws `RangeError` on an invalid date. |
| `SystemClock` | Real time: `now()` and `nowMs()`. | Pass any object with those two methods as `clock` to fake time in tests. |
| `DelayTrigger`, `DateTrigger`, `IntervalTrigger`, `CronTrigger` | Compute the next fire time. Each has `next(after)`. | The scheduler picks one for you; use them directly to preview times. |
| `ScheduleHandleImpl` | The concrete `ScheduleHandle`. | You get an instance back from `after`/`at`/`every`/`cron`; rarely constructed by hand. |

### Types

| Name | What it is | Notes |
| --- | --- | --- |
| `JobDefinition` | `{ id, name, handler, options? }`. | What `define()` takes. |
| `JobHandler<T>` | `(context: JobContext<T>) => Promise<void> \| void`. | The return value is ignored. |
| `JobContext<T>` | `jobId`, `executionId`, `scheduledAt`, `startedAt`, `attempt`, `data`, `signal`. | The single argument your handler gets. |
| `JobOptions` | `timeout`, `retry`, `concurrency`, `overlap`. | `concurrency` is accepted but not applied; use the scheduler's `maxConcurrency`. |
| `RetryPolicy` | `attempts`, `strategy`, `delay`, `maxDelay?`, `jitter?`. | `strategy` is `RetryStrategy`: fixed, linear or exponential. |
| `ScheduleOptions` | `timezone`, `misfire`, `priority`. | The scheduler methods additionally accept `overlap` and `data` inline; this exported type does not list them. |
| `Schedule` | `id`, `jobId`, `type`, `expression?`, `nextRunAt`, `lastRunAt?`, `state`, `options?`. | What `getSchedule()` returns. |
| `ScheduleHandle` | `id`, `state`, `pause`, `resume`, `cancel`, `nextRun`. | Returned by every scheduling method. |
| `Trigger` | `{ next(after: Date): Date \| null }`. | Implement it for a custom timing rule. |
| `ParsedCron` | The value sets for each cron field. | Returned by `parseCron`. |
| `SchedulerOptions`, `SchedulerErrorEvent` | Constructor options, and the `{ scheduleId, jobId, executionId, error }` given to `onError`. |  |
| `ScheduleType`, `ScheduleState`, `JobState`, `OverlapPolicy`, `MisfirePolicy` | String unions used above. | Executions are recorded with a `status` and returned by `getExecutions()` (last 100). |
| `SchedulerJobId`, `ScheduleId`, `ExecutionId` | Aliases for `string`. | Documentation only. |
| `JobExecution`, `JobExecutionResult` | Shapes for an execution record and its result. | `JobExecutionResult` is what `JobExecutor.execute` resolves to. Nothing produces `JobExecution`: there is no execution history. |
| `ScheduleHandleBinding`, `SchedulerErrorOptions` | The wiring a handle needs; the options bag for scheduler errors. | Only needed if you build a handle yourself. |

### Errors

| Name | Thrown when | Notes |
| --- | --- | --- |
| `SchedulerError` | Base class for every error here. | All are re-exported from `@zudojs/errors`. |
| `InvalidJobError` | `define()` gets a bad job, or you schedule an unregistered id. | The most common one you will hit. |
| `InvalidScheduleError` | A bad trigger, an unsupported time zone, or `misfire: "skip"` on a past time. | Also for a non-positive or absurd interval. |
| `CronParseError` | The cron expression is malformed. | Thrown at `cron()`, not at fire time. |
| `InvalidDurationError` | The duration string is malformed or out of range. | From `parseDuration`, `after` and `every`. |
| `SchedulerAlreadyStartedError` / `SchedulerStoppedError` | `start()` while running; `stop()` while stopped. | `stop()` rejects rather than throwing synchronously. |
| `SchedulerJobAlreadyExistsError` / `SchedulerJobNotFoundError` | Duplicate `define()`; `JobRegistry.getOrThrow` on an unknown id. |  |
| `SchedulerJobExecutionError` / `SchedulerJobTimeoutError` / `SchedulerJobCancelledError` | A run threw, ran too long, or was aborted. | These reach you through `onError`. |
| `SchedulerNotStartedError`, `ScheduleNotFoundError`, `ScheduleAlreadyExistsError`, `SchedulerStoreError`, `SchedulerLockError` | Declared for completeness. | Exported, but nothing in this package throws them yet. |

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| `DEFAULT_JOB_TIMEOUT` | 30,000 | Used when a job sets no `timeout`. |
| `DEFAULT_MAX_CONCURRENCY` | 10 | Default `maxConcurrency`. |
| `DEFAULT_RETRY_DELAY` | 1,000 | Used when a policy omits `delay`. |
| `DEFAULT_MAX_RETRIES` | 3 | Caps the exponent growth inside `retryDelay`. |
| `DEFAULT_MISFIRE_POLICY` | `"run-once"` | Applied when `misfire` is omitted. |
| `DEFAULT_OVERLAP_POLICY` | `"allow"` | Applied when `overlap` is omitted. |
| `MAX_TIMER_DELAY` | 2,147,483,647 | Longest single `setTimeout` the loop will arm. |
| `MAX_JOBS` / `MAX_SCHEDULES` | 4,096 each | Hard caps; exceeding either throws. |
| `MAX_EXECUTION_HISTORY`, `SCHEDULER_TICK_INTERVAL` | 100, 1,000 | Exported but unused — the loop sleeps until the next fire time rather than ticking on a fixed interval. |

## COMMON MISTAKES

- **Scheduling before defining.** → `InvalidJobError: Job "x" is not registered.` → Call `define()` first; the scheduler checks the registry at scheduling time.
- **Forgetting `start()`.** → Schedules exist, `nextRun()` returns a date, nothing ever runs. → Call `scheduler.start()` once at boot.
- **Not awaiting `stop()`.** → The process exits mid-job, or an unhandled rejection appears on shutdown. → `await scheduler.stop({ drain: true, timeoutMs: 30_000 })`.
- **Leaving out `onError`.** → A job that throws every run fails in total silence. → Pass `onError` to the constructor and log the event.
- **Passing a number where a duration string goes.** → `every(5000, "job")` is a type error, and `every("5", "job")` throws `InvalidDurationError`. → Write the unit: `"5s"`.
- **Ignoring `ctx.signal` in a long handler.** → A timeout or `stop()` reports the job as cancelled while the work keeps running. → Pass the signal to `fetch`, database drivers and anything else that accepts one.
- **Expecting a real IANA time zone.** → `{ timezone: "Europe/Paris" }` throws `InvalidScheduleError`. → Use `"UTC"`, or set the process `TZ` and omit the option.

## RELATED PACKAGES

- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — when work is triggered by an event rather than the clock, or must survive a restart. Often the handler a scheduled job calls.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the home of every `Scheduler*Error` class this package re-exports.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — run `start()` on boot and `stop()` on shutdown as part of the app's lifecycle instead of by hand.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — somewhere structured for your `onError` callback to write.
- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — the usual thing a scheduled job refreshes or expires.

## COMPLETE EXPORT INDEX

Every name `@zudojs/scheduler` exports from its package root at v1.1.1 — **67** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 67 exports**

Classes (22)

`CronParseError` `CronTrigger` `DateTrigger` `DelayTrigger` `IntervalTrigger` `InvalidDurationError` `InvalidJobError` `InvalidScheduleError` `JobExecutor` `JobRegistry` `PriorityQueue` `ScheduleHandleImpl` `Scheduler` `SchedulerAlreadyStartedError` `SchedulerError` `SchedulerJobAlreadyExistsError` `SchedulerJobCancelledError` `SchedulerJobExecutionError` `SchedulerJobNotFoundError` `SchedulerJobTimeoutError` `SchedulerStoppedError` `SystemClock`

Functions (10)

`createJobContext` `createJobDefinition` `createSchedule` `createSchedulerError` `createSystemClock` `isSchedulerError` `nextCronDate` `parseCron` `parseDuration` `retryDelay`

Interfaces (15)

`JobContext` `JobDefinition` `JobExecution` `JobExecutionResult` `JobOptions` `ParsedCron` `RetryPolicy` `Schedule` `ScheduleHandle` `ScheduleHandleBinding` `ScheduleOptions` `SchedulerErrorEvent` `SchedulerErrorOptions` `SchedulerOptions` `Trigger`

Type aliases (10)

`ExecutionId` `JobHandler` `JobState` `MisfirePolicy` `OverlapPolicy` `RetryStrategy` `ScheduleId` `SchedulerJobId` `ScheduleState` `ScheduleType`

Constants (10)

`DEFAULT_JOB_TIMEOUT` `DEFAULT_MAX_CONCURRENCY` `DEFAULT_MAX_RETRIES` `DEFAULT_MISFIRE_POLICY` `DEFAULT_OVERLAP_POLICY` `DEFAULT_RETRY_DELAY` `MAX_EXECUTION_HISTORY` `MAX_JOBS` `MAX_SCHEDULES` `MAX_TIMER_DELAY`
