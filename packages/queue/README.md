# @zudojs/queue

Background job and asynchronous task infrastructure with in-memory and adapter-based queue implementations.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-queue](https://zudojs.oyinlola.site/docs/packages-queue) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-queue.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/queue
```

## Quick Start

Runs as written — queue names are branded, so build one with
`createQueueName`:

```typescript
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

interface Email {
  to: string;
  subject: string;
}

const queue = createInMemoryQueue<Email>(createQueueName("emails"), {
  concurrency: 5,
  // Give jobs somewhere to log; without this `context.log()` goes nowhere.
  logger: console,
});

// A processor may return a value, a JobResult, or nothing.
queue.process("send-email", async (job, context) => {
  context.log("sending", { to: job.data.to });
  return { delivered: job.data.to };
});

await queue.add(
  "send-email",
  { to: "user@example.com", subject: "Welcome" },
  // Backoff accepts either BackoffType.FIXED or the plain string.
  { attempts: 3, backoff: { type: "exponential", delay: 500, jitter: "full" } },
);

// The queue polls in the background; give it a tick before reading counts.
await new Promise((resolve) => setTimeout(resolve, 100));

// Jobs that exhaust their attempts land here rather than vanishing.
console.log((await queue.getDeadLetterJobs()).length);
console.log(await queue.getStats());

// Draining shutdown: in-flight jobs finish before the queue tears down.
await queue.close();
```

## Dead-letter store

Each queue keeps the most recent 1000 dead-lettered jobs in a store of its own,
cleared by `close()`. To choose the cap, or to keep the jobs after the queue
closes, pass a store as `deadLetterStore`. No type annotation is needed, for
an untyped store or one typed for the queue's payload.

```typescript
import {
  createInMemoryDeadLetterStore,
  createInMemoryQueue,
  createQueueName,
} from "@zudojs/queue";

// Keep only the 50 most recent failures.
const store = createInMemoryDeadLetterStore({ maxEntries: 50 });
const broken = createInMemoryQueue(createQueueName("broken"), {
  deadLetterStore: store,
});

// A store typed for the payload, so its entries read as DeadLetterJob<Email>.
const failedEmails = createInMemoryDeadLetterStore<Email>();
const emails = createInMemoryQueue<Email>(createQueueName("emails"), {
  deadLetterStore: failedEmails,
});
```

`close()` leaves a store you passed in alone; its contents are yours.

## Features

- In-memory queue for development and testing
- Pluggable queue adapters (Redis, Bull, etc.)
- Job retry with exponential backoff
- Dead letter queue for failed jobs
- Scheduled and delayed jobs
- Middleware pipeline for job processing
- Concurrency control
- Draining shutdown with a bounded `closeTimeout`, then cooperative abort
- Stalled-job reclaim (`stalledAfter`, `maxStalledCount`) for consumers that die
  mid-job
- Bounded retention of settled jobs and of dead-lettered jobs, so a long-lived
  queue does not grow without limit

## Polling and process lifetime

The queue's own consumer polls every `pollInterval` milliseconds when you set
one; unset, it starts at 50 ms and backs off to 2000 ms while idle. It never
waits out that interval when work arrives: `add()`, a delayed job coming due, a
retry's backoff elapsing, `resume()` and a finished job all wake it at once. A
`Worker` is woken the same way through `queue.onJobReady`, so its
`pollInterval` only bounds how often an idle worker re-checks.

Pending work keeps the Node.js process alive. While the queue has waiting,
delayed, retrying or running jobs that one of its processors can run, a script
whose only work is the queue does not exit before the jobs run. A started
`Worker` keeps the process alive until `stop()` or `forceStop()`. An idle queue,
a paused one, work that no processor handles, and a closed queue never hold the
process open. Pass `keepAlive: false` (to the queue or the worker) for the old
behaviour, where every timer was unreferenced.

## Payloads

Payloads round-trip through the serializer on `add()`, so the stored job is a
copy. The default `JsonSerializer` preserves `Date`, `BigInt`, `Map`, `Set`,
`Uint8Array` and `Error`, so a field typed `Date` arrives as a `Date`:

```typescript
const reminders = createInMemoryQueue<{ at: Date }>(createQueueName("reminders"));
reminders.process("remind", async (job) => job.data.at.getTime()); // a real Date
```

`createJsonSerializer({ preserveTypes: false })` gives plain JSON, where a
`Date` becomes its ISO string (type it as `string`). `PassthroughSerializer`
(or `serializePayloads: false`) stores payloads by reference, class instances
included, with no copy and no serialization.

## Ordering

Higher `priority` runs first. Within a priority, jobs run in the order they
became runnable: when they were added, or for a delayed job when its delay
elapsed, so a delayed job never jumps ahead of jobs that were already waiting
when it came due. A retried job keeps its original place in line.

## Attempts

`job.attempt` counts the attempts already made, so it is `0` while the first
attempt runs. `context.attemptNumber` is the 1-based number of the attempt in
progress (`job.attempt + 1`), the same convention as `ctx.attempt` in
`@zudojs/scheduler`:

```typescript
queue.process("sync", async (job, context) => {
  context.log(`attempt ${context.attemptNumber} of ${job.maxAttempts}`);
});
```

## Events

`queue.events` works without configuration: a queue created without an
`eventEmitter` gets an in-memory one.

```typescript
queue.events?.on("job:completed", ({ job, result }) => {
  console.log(job.id, result);
});
```

## Workers, timeouts and context

**One consumer at a time.** `queue.process()` registers a processor and, by
default, the queue's own poller runs jobs. Creating a `Worker` for the queue
turns that poller off as a consumer (`queue.setAutoProcess(false)`), so the
worker's `middleware`, `timeoutMs` and `concurrency` apply to every job, and
`worker.stop()` really stops consumption. Pass `autoProcess: false` to keep the
queue from consuming before any worker exists.

**Timeouts are cooperative.** A timeout aborts `context.signal`; honour it. The
job's concurrency slot and its retry wait up to `timeoutGraceMs` (5000 ms by
default) for the processor to settle, so a retry never runs beside the attempt
it replaces. A processor still running after the grace period is abandoned.

**Carrying context across the queue.** AsyncLocalStorage does not follow a job
into the poller or worker that runs it. A `QueueContextCarrier` captures a value
at `add()` into job metadata and restores it around the middleware and the
processor:

```typescript
import { AsyncLocalStorage } from "node:async_hooks";
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import type { QueueContextCarrier } from "@zudojs/queue";

const tenants = new AsyncLocalStorage<{ tenantId: string }>();

const tenantCarrier: QueueContextCarrier<string> = {
  key: "tenantId",
  capture: () => tenants.getStore()?.tenantId,
  restore: (tenantId, run) => tenants.run({ tenantId }, run),
};

const jobs = createInMemoryQueue<{ id: number }>(createQueueName("reports"), {
  contextCarriers: [tenantCarrier],
});
jobs.process("build", async () => {
  console.log("building for", tenants.getStore()?.tenantId); // "acme"
});

await tenants.run({ tenantId: "acme" }, () => jobs.add("build", { id: 1 }));
await new Promise((resolve) => setTimeout(resolve, 100));
await jobs.close();
```

Keep captured values small and serializable (ids, not live objects). With
`@zudojs/tenancy`, capture the tenant id and restore it with the tenant context
storage's `run`.

The `zudo:context` metadata key is reserved: it is written only by the queue's
own carriers and is stripped from any `metadata` passed to `add()`, so an
enqueuer cannot choose the context its job runs under.

Errors with no caller to receive them (a worker's failing poll, a throwing event
listener) go to `logger.error` when a logger is configured, and otherwise to
`process.emitWarning`, never to `console`.

## Use Cases

- Background email sending
- Image and video processing
- Report generation
- Webhook delivery
- Any asynchronous workload
