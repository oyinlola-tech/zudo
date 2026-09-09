# @zudojs/queue

Background job and asynchronous task infrastructure with in-memory and adapter-based queue implementations.

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

## Use Cases

- Background email sending
- Image and video processing
- Report generation
- Webhook delivery
- Any asynchronous workload
