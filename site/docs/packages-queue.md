---
title: "@zudojs/queue — Background Job Infrastructure"
description: "Complete documentation for @zudojs/queue — background job processing with retry, backoff, dead letter, workers, and middleware."
source: https://zudojs.oyinlola.site/docs/packages-queue
---

v1.3.0

# @zudojs/queue

Background job and asynchronous task infrastructure. Provides an in-memory queue with processors, workers, retry policies, dead letter handling, middleware, serialization, and event emission.

QUEUE JOBS WORKERS BACKGROUND RETRY

## OVERVIEW

Some work should not happen while a user waits. Sending an email, resizing an image or calling a slow third-party API can take seconds, and if it fails you want to try again later. A *job queue* is a list of such tasks that your program works through in the background, one at a time or a few at once.

`@zudojs/queue` gives you that list. You *add* a job (a name plus some data), you register a *processor* (the function that does the work for that name), and the queue runs the processor for each job. If the processor throws, the queue can retry with a delay and, when every attempt fails, park the job in a *dead-letter store* so it is not silently lost.

Everything in this package runs in memory inside one Node.js process. Jobs disappear when the process exits. That is ideal for development, tests and small apps; a durable backend would need a custom `Queue` implementation.

> **In plain words:** a queue is a to-do list, a job is one item on it, and a processor is the function that ticks the item off.

When you need it

- Work that can finish after the request returns (emails, exports, webhooks)
- Work that fails sometimes and should be retried automatically
- Limiting how many slow tasks run at the same time
- Running a task once, later (`delay`)

When you don't

- The caller needs the result right now: just `await` the function
- The task repeats on a timetable ("every night at 2am"): use [@zudojs/scheduler](https://zudojs.oyinlola.site/docs/packages-scheduler.md)
- Jobs must survive a crash or restart: this package is in-memory only

## INSTALLATION

Install the package. The three packages it depends on are pulled in automatically.

```bash
$ npm install @zudojs/queue
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Dependencies:** `@zudojs/errors` (error classes), `@zudojs/constants` (ID and timestamp types) and `@zudojs/serialization` (JSON payload handling). Import error classes from `@zudojs/errors`; this package does not re-export them.

## QUICK START

This example creates a queue, registers a processor for jobs named `"send-email"`, adds one job, and waits for it to finish.

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

interface EmailData {
  to: string;
  subject: string;
}

const queue = createInMemoryQueue<EmailData>(createQueueName("emails"));

// 1. Say what to do for jobs called "send-email".
queue.process("send-email", async (job) => {
  console.log(`Sending "${job.data.subject}" to ${job.data.to}`);
});

// 2. Put a job on the queue.
const job = await queue.add("send-email", {
  to: "ada@example.com",
  subject: "Welcome",
});
console.log(job.state); // "waiting"

// 3. Give the queue a moment to run it.
await new Promise((resolve) => setTimeout(resolve, 200));

const finished = await queue.getJob(job.id);
console.log(finished?.state); // "completed"

await queue.close();
```

What you should see: the "Sending ..." line, then `waiting`, then `completed`. The queue starts polling for work the moment you call `process()`, so you never have to start it by hand.

> **Watch out:** the first argument to `createInMemoryQueue` is a `QueueName`, not a plain string. Wrap the name in `createQueueName()` or TypeScript will reject it.

## JOBS AND PROCESSORS

A **job** is one unit of work. It has a `name` (which processor should run it), `data` (the input), and a `state` that the queue moves through as work happens. You never build a job by hand; `queue.add()` builds it and returns it.

A **processor** is an `async` function registered with `queue.process(name, fn)`. The queue calls it with two arguments: the job, and a `JobContext`. The context carries an `AbortSignal` that fires if the job times out or the queue shuts down, plus an `updateProgress()` method.

### Job states

The `JobState` enum lists every state. Its values are lowercase strings, so `job.state === "completed"` works.

| State | Meaning |
| --- | --- |
| `waiting` | Added and ready to run |
| `scheduled` | Added with a `delay` or `scheduledAt`; not due yet |
| `active` | A processor is running it right now |
| `completed` | The processor returned normally |
| `failed` | The processor threw (briefly, before retry or dead-letter) |
| `retrying` | Failed, waiting out the backoff delay before the next attempt |
| `dead_letter` | Every attempt failed; the job is in the dead-letter store |

### Reporting progress and honouring cancellation

This processor reports progress with `createJobProgress()` and stops early if the signal is aborted.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  createJobProgress,
  createJobResult,
} from "@zudojs/queue";

const queue = createInMemoryQueue<{ pages: number }>(createQueueName("reports"));

queue.process("build-report", async (job, ctx) => {
  const started = Date.now();

  for (let page = 1; page <= job.data.pages; page++) {
    if (ctx.signal.aborted) return;
    await ctx.updateProgress(createJobProgress((page / job.data.pages) * 100));
  }

  return createJobResult("report.pdf", Date.now() - started);
});

await queue.add("build-report", { pages: 4 }, { timeout: 5000 });
await new Promise((resolve) => setTimeout(resolve, 200));

console.log((await queue.getStats()).succeeded); // 1
await queue.close();
```

A processor returns either nothing or a `JobResult`, built with `createJobResult(data, durationMs)` or `createJobErrorResult(message, durationMs)`. Only a result with `success: false`, or a thrown error, counts as a failure. Each job gets a 30-second timeout unless you pass `timeout`.

> **Common mistake:** adding a job whose name has no processor. The job sits in `waiting` forever and nothing warns you. Register the processor first, or check `queue.getProcessor(name)`.

## JOB OPTIONS

The third argument to `queue.add()` is a `JobOptions` object. Every field is optional. You can also set defaults for the whole queue with `QueueOptions.defaultJobOptions`.

| Option | What it does | Default |
| --- | --- | --- |
| `attempts` | How many times to try before giving up | `1` (no retry) |
| `backoff` | How long to wait between attempts (see Retries) | exponential, 1s to 30s |
| `delay` | Milliseconds to wait before the job may run | `0` |
| `scheduledAt` | A `Date` before which the job may not run | now |
| `priority` | Higher numbers run first; ties run oldest-first | `50` |
| `timeout` | Milliseconds before a running job is aborted and failed. A timeout aborts `context.signal`; the job's slot and its retry wait up to `timeoutGraceMs` (default 5000) for the processor to stop, so honour the signal. | `30000` |
| `deduplicationKey` | Reject a second job with the same key while the first exists | none |
| `metadata` | Any extra data you want stored on the job. The key `zudo:context` is reserved by the queue and stripped from whatever you pass (see below) | none |

> **Reserved key:** `metadata["zudo:context"]` (exported as `CONTEXT_METADATA_KEY`) belongs to the queue's context carriers. Since v1.3.0 the queue drops whatever the caller put there before storing the job, whether or not a carrier captured anything. Before v1.3.0, an `add()` made with no ambient context kept the caller's record verbatim and the queue replayed it around the middleware and the processor — so an enqueuer could choose the tenant, correlation id or trace the job ran under. Context that a carrier genuinely captured is unaffected; put your own data under any other key.

This example uses priority, delay and deduplication together. `JobPriorityLevels` is a set of named numbers you can use instead of guessing.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  JobPriorityLevels,
} from "@zudojs/queue";

const queue = createInMemoryQueue<{ orderId: string }>(createQueueName("orders"));

await queue.add("charge", { orderId: "o-1" }, { priority: JobPriorityLevels.LOW });
await queue.add("charge", { orderId: "o-2" }, { priority: JobPriorityLevels.HIGH });

const next = await queue.getNextJob();
console.log(next?.data.orderId); // "o-2"  (HIGH = 100 beats LOW = 10)

const later = await queue.add("charge", { orderId: "o-3" }, { delay: 60_000 });
console.log(later.state); // "scheduled"

await queue.add("charge", { orderId: "o-4" }, { deduplicationKey: "order:o-4" });
try {
  await queue.add("charge", { orderId: "o-4" }, { deduplicationKey: "order:o-4" });
} catch (error) {
  console.log((error as Error).message); // Duplicate job detected with key "order:o-4".
}

await queue.close();
```

`getNextJob()` only peeks; it does not change the job. The duplicate `add()` throws a `JobDuplicateError` from `@zudojs/errors`.

## RETRIES AND BACKOFF

A **retry** means running the same job again after it fails. **Backoff** is the pause before each retry. Pausing matters: if a service is down, hitting it again instantly just fails again, and hundreds of jobs doing that at once make things worse.

Set `attempts` to more than 1 and the queue retries. Add a `backoff` to control the pause. Two shapes exist: *fixed* (same pause every time) and *exponential* (the pause doubles each time, up to `maxDelay`). A `jitter` setting adds randomness so failed jobs do not all retry in the same instant.

This processor fails twice and succeeds on the third attempt, with a 50 ms fixed pause between tries.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  createFixedBackoff,
} from "@zudojs/queue";

const queue = createInMemoryQueue(createQueueName("flaky"));

let attempts = 0;
queue.process("call-api", async () => {
  attempts++;
  if (attempts < 3) throw new Error("Temporary failure");
});

await queue.add("call-api", {}, {
  attempts: 3,
  backoff: createFixedBackoff(50),
});

await new Promise((resolve) => setTimeout(resolve, 500));

const stats = await queue.getStats();
console.log(attempts, stats.retried, stats.succeeded); // 3 2 1
await queue.close();
```

You can also compute delays yourself. `calculateRetryDelay(attempt, backoff)` is the function the queue uses internally.

```ts
import { createExponentialBackoff, calculateRetryDelay } from "@zudojs/queue";

const backoff = createExponentialBackoff(1000, { maxDelay: 5000, multiplier: 2 });

console.log(calculateRetryDelay(1, backoff)); // 1000
console.log(calculateRetryDelay(2, backoff)); // 2000
console.log(calculateRetryDelay(3, backoff)); // 4000
console.log(calculateRetryDelay(4, backoff)); // 5000 (capped by maxDelay)
```

> **Tip:** if you set `attempts` but no `backoff`, the queue uses exponential backoff starting at 1 second, capped at 30 seconds, with full jitter. Retries never happen with zero delay by accident.

## DEAD LETTER

When a job has used all its attempts, the queue does not delete it. It moves the job to a **dead-letter store**: a holding area for jobs that could not be done. You can inspect them, log them or re-add them by hand. The term comes from postal services, where undeliverable mail goes to a "dead letter office".

Every queue has an in-memory dead-letter store by default. Read it with `getDeadLetterJobs()`.

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

const queue = createInMemoryQueue(createQueueName("broken"));

queue.process("always-fails", async () => {
  throw new Error("Persistent failure");
});

const job = await queue.add("always-fails", {}, { attempts: 1 });
await new Promise((resolve) => setTimeout(resolve, 300));

const dead = await queue.getDeadLetterJobs();
console.log(dead.length);      // 1
console.log(dead[0].reason);   // "Persistent failure"
console.log(dead[0].attempts); // 1

console.log((await queue.getJob(job.id))?.state); // "dead_letter"

await queue.close();
```

Each entry is a `DeadLetterJob`: a copy of the `job` as it was when it ran out of attempts (so its `state` still reads `"failed"`), the `error`, the number of `attempts`, and a `reason` string. To keep dead jobs somewhere else, pass your own `DeadLetterStore` as `QueueOptions.deadLetterStore`; `createInMemoryDeadLetterStore()` shows the shape to copy.

### Retention is bounded

Since v1.3.0 the default in-memory store keeps the most recent **1000** dead-lettered jobs (`DEFAULT_DEAD_LETTER_JOBS`) and evicts the oldest past that. Before v1.3.0 it was unbounded, so a queue that dead-lettered steadily grew until the process ran out of memory. Build the store yourself to choose a different cap.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  createInMemoryDeadLetterStore,
} from "@zudojs/queue";

// Keep only the 50 most recent failures.
const store = createInMemoryDeadLetterStore({ maxEntries: 50 });

// Or opt back into the pre-1.3.0 unbounded behaviour.
const unbounded = createInMemoryDeadLetterStore({
  maxEntries: Number.POSITIVE_INFINITY,
});

const queue = createInMemoryQueue(createQueueName("broken"), {
  deadLetterStore: store,
});

await queue.close(); // `store` is yours: close() leaves it alone
```

> **Who clears it:** `close()` clears the dead-letter store the queue created for itself, so a closed queue holds onto nothing. A store you passed in as `deadLetterStore` is left alone, as before — you own its contents and its lifetime.

> **Watch out:** `getStats().failed` counts jobs currently in `failed` *or* `dead_letter` state. A job that will be retried shows up there for a moment too. Use `deadLettered` for the lifetime total.

## WORKERS

A **worker** is a loop that repeatedly asks a queue "anything to do?", claims one job, and runs it. The in-memory queue already contains such a loop, which is why the Quick Start needed no worker. Creating a `Worker` switches that loop off as a consumer (`queue.setAutoProcess(false)`), so the worker is the only thing running jobs and `worker.stop()` really stops consumption. A separate `Worker` is useful when you want its own concurrency limit, its own middleware, start/stop control, or per-worker statistics.

A worker never runs a processor itself. It calls `queue.claimNextJob()` (which marks the job `active` so nobody else takes it) and then `queue.runJob()`, so retries, dead-lettering and middleware all still apply.

Start a worker, let it process a job, then stop it cleanly.

```ts
import { createInMemoryQueue, createQueueName, createWorker } from "@zudojs/queue";

const queue = createInMemoryQueue(createQueueName("images"));
queue.process("resize", async () => {});

const job = await queue.add("resize", {});

const worker = createWorker("worker-1", queue, {
  concurrency: 2,
  pollInterval: 5,
});

await worker.start();
console.log(worker.state); // "running"

await new Promise((resolve) => setTimeout(resolve, 200));
await worker.stop(); // waits for in-flight jobs, up to drainTimeout (30s)

console.log((await queue.getJob(job.id))?.state); // "completed"
console.log(worker.getStats());
// { processed: 1, succeeded: 1, failed: 0, concurrency: 2, state: "stopped" }

await queue.close();
```

### Worker options

| Option | What it does | Default |
| --- | --- | --- |
| `concurrency` | How many jobs this worker runs at the same time | `1` |
| `pollInterval` | Milliseconds to wait before asking again when the queue is empty | `100` |
| `timeoutMs` | Timeout for jobs that carry none of their own | queue default (30 s) |
| `middleware` | Extra middleware run after the queue's own | none |
| `drainTimeout` | How long `stop()` waits for running jobs before forcing | `30000` |
| `onError` | Called for poll failures and drain timeouts | `logger.error`, else `process.emitWarning` |
| `logger` | Receives errors when no `onError` is given | none |

> **Common mistake:** calling `start()` twice. A worker can only start from `created` or `stopped`; anything else throws `WorkerLifecycleError`. Check `worker.isRunning()` first.

## MIDDLEWARE

**Middleware** is a function that wraps every processor call. It receives a context with the `job` and a `next()` function; calling `next()` runs the rest of the chain and, finally, the processor. Use it for things every job needs, such as logging or timing, without repeating code in each processor.

Pass middleware in `QueueOptions.middleware`. This example adds the built-in logging middleware and one custom timer.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  createLoggingMiddleware,
} from "@zudojs/queue";
import type { QueueMiddleware } from "@zudojs/queue";

const timing: QueueMiddleware = async (ctx) => {
  const started = Date.now();
  const result = await ctx.next();
  console.log(`${ctx.job.name} took ${Date.now() - started}ms`);
  return result;
};

const queue = createInMemoryQueue(createQueueName("emails"), {
  middleware: [createLoggingMiddleware({ info: console.log }), timing],
});

queue.process("send-email", async () => {});
await queue.add("send-email", {});
await new Promise((resolve) => setTimeout(resolve, 200));
await queue.close();
```

What you should see: "Job processing started" with the job details, then "send-email took 0ms", then "Job processing completed". Middleware runs in array order, outermost first.

> **Watch out:** call `next()` exactly once. Calling it twice throws, because it would run the processor twice. Forgetting it entirely means the processor never runs and the job is marked completed.

## EVENTS

The queue can tell you when things happen: a job was created, started, completed, failed, or will retry. By default it tells nobody. To listen, create an **event emitter** (an object you can subscribe to) and hand it to the queue as `QueueOptions.eventEmitter`.

Subscribe with `on(event, handler)`. It returns a function that unsubscribes.

```ts
import {
  createInMemoryQueue,
  createQueueName,
  createInMemoryQueueEventEmitter,
  createJobResult,
} from "@zudojs/queue";

const emitter = createInMemoryQueueEventEmitter();

const unsubscribe = emitter.on("job:completed", ({ job, result }) => {
  console.log(`${job.name} finished with`, result);
});
emitter.on("job:failed", ({ job, error }) => {
  console.log(`${job.name} failed: ${error.message}`);
});

const queue = createInMemoryQueue(createQueueName("emails"), { eventEmitter: emitter });
queue.process("send-email", async () => createJobResult("sent", 0));

await queue.add("send-email", {});
await new Promise((resolve) => setTimeout(resolve, 200));
// send-email finished with sent

unsubscribe();
await queue.close();
```

| Event | Payload | When |
| --- | --- | --- |
| `job:created` | `{ job }` | `add()` stored the job |
| `job:started` | `{ job }` | A processor is about to run |
| `job:progress` | `{ job, progress }` | The processor called `updateProgress()` |
| `job:completed` | `{ job, result }` | The processor returned; `result` is a `JobResult`'s `data`, else `undefined` |
| `job:failed` | `{ job, error }` | The processor threw (fires on every failed attempt) |
| `job:retrying` | `{ job, attempt }` | A retry has been scheduled |

> **Tip:** a handler that throws does not break the job. The error is logged to the console (or passed to the `onHandlerError` option) and processing continues.

## PAUSING, STATS AND SHUTDOWN

`pause()` stops the queue from starting new jobs; `resume()` starts them again. By default a paused queue also rejects `add()`; set `pauseRejectsAdd: false` in `QueueOptions` to keep accepting jobs while paused.

`close()` waits for running jobs (up to `closeTimeout`, 30 s), cancels pending timers and forgets every job. Always call it when your program shuts down. After closing, `add()` throws `QueueDisposedError`.

Use `createQueueManager()` when you have several queues and want to close them all at once.

```ts
import { createQueueManager, createQueueName } from "@zudojs/queue";

const manager = createQueueManager();

const emails = manager.getQueue(createQueueName("emails"), { concurrency: 5 });
const reports = manager.getQueue(createQueueName("reports"));

console.log(manager.getQueueNames()); // [ "emails", "reports" ]
console.log(manager.hasQueue(createQueueName("emails"))); // true

await emails.pause();
console.log(emails.isPaused(), reports.isPaused()); // true false

await manager.closeAll();
console.log(emails.isDisposed()); // true
```

> **Watch out:** `getQueue()` only applies `options` when it creates the queue. Passing options for a queue that already exists throws a `QueueError`.

## API REFERENCE

Everything below is exported from `@zudojs/queue` unless a note says otherwise.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createInMemoryQueue(name, options?)` | Creates a queue that stores jobs in memory | `name` is a `QueueName`; returns `Queue` |
| `createQueue(name, options?)` | Same as above | Deprecated alias; prefer `createInMemoryQueue` |
| `createQueueName(string)` | Brands a string as a `QueueName` | Also `createJobName`, `createJobId` and the `isQueueName`, `isJobName`, `isJobId` guards |
| `createWorker(id, queue, options?)` | Creates a worker that polls the queue | Call `start()` to begin |
| `createQueueManager()` | Creates and tracks several queues by name | `getQueue`, `getExistingQueue`, `hasQueue`, `getQueueNames`, `closeAll` |
| `createQueueRegistry()` | Stores queues you created elsewhere | `register`, `get`, `has`, `getAll`, `unregister`, `clear`, `closeAll` |
| `createFixedBackoff(delay, options?)` | Backoff with the same delay each retry | `options.jitter`: `"none"`, `"full"` or `"equal"` |
| `createExponentialBackoff(delay, options?)` | Backoff that multiplies each retry | `maxDelay`, `multiplier` (default 2), `jitter` |
| `createBackoffOptions(type, delay, options?)` | Builds a `BackoffOptions` from a `BackoffType` | Used by the two helpers above |
| `calculateRetryDelay(attempt, backoff?)` | Milliseconds to wait before the given attempt | Returns 0 without a backoff |
| `shouldRetry(attempt, maxAttempts)` | `attempt < maxAttempts` |  |
| `createInMemoryQueueEventEmitter(options?)` | Emitter you can subscribe to with `on()` | `options.onHandlerError`; class `InMemoryQueueEventEmitter` also exported |
| `createNoopQueueEventEmitter()` | Emitter that drops every event | The queue's default |
| `createLoggingMiddleware(logger?)` | Logs start, completion and failure of each job | `logger.info(message, data)` |
| `createTimeoutMiddleware(ms, onTimeout?)` | Fails a job that runs longer than `ms` | The queue already applies one per job |
| `createMiddlewareChain(middleware[])` | Combines several middleware into one |  |
| `createInMemoryDeadLetterStore()` | Dead-letter store backed by a `Map` | The queue's default |
| `moveToDeadLetter(store, job, error, options?)` | Adds a job to a dead-letter store | The queue calls this for you |
| `createJobProgress(percent, options?)` | Builds a `JobProgress` for `ctx.updateProgress()` | Clamps to 0..100 |
| `createJobResult(data, durationMs)` | Builds a successful `JobResult` | Also `createJobErrorResult(error, durationMs)` |
| `createProcessorRegistry()` | Standalone name-to-processor map | Not used by `Queue`; the queue keeps its own |
| `createJsonSerializer(options?)` | JSON serializer with `space` / `preserveTypes` | Constants `JsonSerializer` (default) and `PassthroughSerializer` |

### Queue methods

| Name | What it does | Notes |
| --- | --- | --- |
| `add(name, data, options?)` | Stores a job and returns it | Throws when paused (by default), closed, duplicate, or payload not JSON-serializable |
| `process(name, processor)` | Registers the processor for a job name and starts polling | One processor per name; a later call replaces it |
| `getJob(id)` | Current copy of a job, or `null` | Jobs are immutable; re-fetch to see new state |
| `getNextJob()` | Peeks at the next runnable job | Does not claim it |
| `claimNextJob()` / `releaseJob(id)` / `runJob(job, options?)` | Building blocks for a custom worker | Use `createWorker` unless you need these |
| `getStats()` | Counts per state plus lifetime totals | `processed`, `succeeded`, `errored`, `retried`, `deadLettered` |
| `getDeadLetterJobs()` | All `DeadLetterJob` entries |  |
| `pause()` / `resume()` / `isPaused()` | Stop and restart processing |  |
| `close()` / `isDisposed()` | Drain and shut down | Idempotent |

### Queue options

| Name | What it does | Default |
| --- | --- | --- |
| `concurrency` | Jobs the queue's own loop runs at once | `1` |
| `pollInterval` | Milliseconds between checks for work | `50` |
| `defaultJobOptions` | `JobOptions` applied to every `add()` | none |
| `middleware` | Middleware run around every processor | `[]` |
| `eventEmitter` | Where lifecycle events go | no-op |
| `deadLetterStore` | Where exhausted jobs go | in-memory |
| `serializer` / `serializePayloads` | Payloads are copied through JSON on `add()`; set `false` to store by reference | `JsonSerializer` / `true` |
| `pauseRejectsAdd` | Whether `add()` throws while paused | `true` |
| `retainSettledJobs` | Finished jobs kept before the oldest are dropped | `1000` |
| `closeTimeout` | How long `close()` waits for running jobs | `30000` |
| `stalledAfter` / `maxStalledCount` | Reclaim a job left `active` by a dead consumer; dead-letter after N stalls | `0` (off) / `3` |
| `autoProcess` | Whether the queue's own loop claims and runs jobs; creating a `Worker` turns it off | `true` |
| `timeoutGraceMs` | After a timeout, how long the slot and the retry wait for the processor to settle | `5000` |
| `contextCarriers` | Context (tenant, correlation id, trace ids) carried from `add()` into the processor; see `captureContext` / `runWithContext` and the README section "Carrying context across the queue" | none |

### Types and constants

| Name | What it is | Notes |
| --- | --- | --- |
| `Queue`, `QueueOptions`, `QueueStats` | The queue interface and its option/stat shapes | Also `QueueManager`, `QueueRegistry`, `QueueInfo` |
| `Job`, `JobOptions`, `BackoffOptions` | A job and the options accepted by `add()` |  |
| `Processor`, `JobContext`, `JobResult`, `JobProgress` | The processor function type and what it receives/returns |  |
| `Worker`, `WorkerOptions`, `WorkerStats` | Worker interface, options and stats |  |
| `QueueMiddleware`, `QueueMiddlewareContext` | Middleware function and its `ctx` |  |
| `QueueEventEmitter`, `QueueEventMap` | Emitter interface and the event-name-to-payload map |  |
| `DeadLetterJob`, `DeadLetterStore` | Dead-letter entry and store interface |  |
| `Serializer` | `serialize(data): string` / `deserialize(string)` |  |
| `JobState`, `WorkerState`, `BackoffType` | Enums of lowercase string values | `BackoffType.FIXED`, `BackoffType.EXPONENTIAL` |
| `JobPriorityLevels` | `LOW 10`, `NORMAL 50`, `HIGH 100`, `CRITICAL 200` | Frozen object |
| `DEFAULT_JOB_OPTIONS` | `{ attempts: 1, timeout: 30000 }` | Also `mergeJobOptions(options?)` |

### Errors

These are thrown by the queue but live in `@zudojs/errors`. Import them from there.

| Name | When | Notes |
| --- | --- | --- |
| `QueueError` | Base class; also `add()` on a paused queue | All others extend it |
| `QueueDisposedError` | `add()`, `process()` or `resume()` after `close()` |  |
| `JobDuplicateError` | `deduplicationKey` already in use |  |
| `JobSerializationError` | Payload cannot be JSON-serialized | Cyclic objects, for example |
| `JobTimeoutError` | A job ran past its timeout | Counts as a failed attempt |
| `JobMaxAttemptsError` | Recorded on the job when it is dead-lettered | Appears as `DeadLetterJob.error` |
| `JobStalledError` | A job was reclaimed after `stalledAfter` | Needs `stalledAfter > 0` |
| `WorkerLifecycleError` | `worker.start()` from the wrong state, or a drain timeout |  |

## COMMON MISTAKES

- **Passing a plain string as the queue name.** TypeScript reports a type error on `createInMemoryQueue("emails")`. Wrap it: `createQueueName("emails")`.
- **Importing errors from `@zudojs/queue`.** The import is `undefined` at runtime and `instanceof` checks silently fail. Import `JobTimeoutError` and friends from `@zudojs/errors`.
- **Reading `job.state` from the object `add()` returned.** Jobs are immutable snapshots, so it stays `"waiting"` forever. Call `queue.getJob(job.id)` to see the current state.
- **Expecting `attempts: 3` to retry instantly.** Without a `backoff` the default is exponential starting at 1 second, so a test that waits 200 ms sees only one attempt. Pass `createFixedBackoff(10)` in tests.
- **Adding a payload that is not plain JSON.** Class instances lose their methods and cyclic objects throw `JobSerializationError`. Put IDs and plain data in the job, and load the rest inside the processor.
- **Forgetting `close()`.** Jobs you never awaited are abandoned and pending retries are lost when the process exits. Close every queue (or `manager.closeAll()`) during shutdown.

## RELATED PACKAGES

- [@zudojs/scheduler](https://zudojs.oyinlola.site/docs/packages-scheduler.md) — runs a job *on a timetable* (cron, every N minutes). A queue runs a job *because something happened*. A scheduler handler often just adds a job to a queue.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `QueueError` family you catch and inspect.
- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — application-wide event bus; implement `QueueEventEmitter` on top of it to forward queue events.
- [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) — the JSON serializer behind `JsonSerializer`.
- [@zudojs/messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md) — message brokers and pub/sub between services, rather than background work inside one.

## COMPLETE EXPORT INDEX

Every name `@zudojs/queue` exports from its package root at v1.3.0 — **87** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 87 exports**

Classes (2)

`InMemoryQueue` `InMemoryQueueEventEmitter`

Functions (41)

`assertProcessor` `calculateRetryDelay` `captureContext` `createBackoffOptions` `createExponentialBackoff` `createFixedBackoff` `createInMemoryDeadLetterStore` `createInMemoryQueue` `createInMemoryQueueEventEmitter` `createJob` `createJobContext` `createJobErrorResult` `createJobId` `createJobName` `createJobProgress` `createJobResult` `createJsonSerializer` `createLoggingMiddleware` `createMiddlewareChain` `createNoopQueueEventEmitter` `createProcessorRegistry` `createQueue` `createQueueManager` `createQueueName` `createQueueRegistry` `createTimeoutMiddleware` `createWorker` `incrementJobAttempt` `isJob` `isJobContext` `isJobId` `isJobName` `isProcessor` `isQueue` `isQueueName` `isWorker` `mergeJobOptions` `moveToDeadLetter` `runWithContext` `shouldRetry` `updateJobState`

Interfaces (26)

`BackoffOptions` `DeadLetterJob` `DeadLetterStore` `InMemoryDeadLetterStoreOptions` `Job` `JobContext` `JobInput` `JobOptions` `JobProgress` `JobResult` `ProcessorInfo` `ProcessorRegistry` `Queue` `QueueContextCarrier` `QueueEventEmitter` `QueueInfo` `QueueLogger` `QueueManager` `QueueMiddlewareContext` `QueueOptions` `QueueRegistry` `QueueStats` `Serializer` `Worker` `WorkerOptions` `WorkerStats`

Type aliases (9)

`BackoffStrategy` `JobId` `JobName` `JobPriority` `Processor` `QueueEventMap` `QueueMiddleware` `QueueName` `WorkerLifecycleState`

Constants (6)

`CONTEXT_METADATA_KEY` `DEFAULT_DEAD_LETTER_JOBS` `DEFAULT_JOB_OPTIONS` `JobPriorityLevels` `JsonSerializer` `PassthroughSerializer`

Enums (3)

`BackoffType` `JobState` `WorkerState`
