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
- Bounded retention of settled jobs, so a long-lived queue does not grow without
  limit

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

Errors with no caller to receive them (a worker's failing poll, a throwing event
listener) go to `logger.error` when a logger is configured, and otherwise to
`process.emitWarning`, never to `console`.

## Use Cases

- Background email sending
- Image and video processing
- Report generation
- Webhook delivery
- Any asynchronous workload
