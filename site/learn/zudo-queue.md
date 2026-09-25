---
title: "Background jobs — ZudoJS Academy"
description: "Move slow, unreliable work out of the request into a job queue: jobs, processors, workers, concurrency, retries with backoff, dead letters with @zudojs/queue."
source: https://zudojs.oyinlola.site/learn/zudo-queue
---

LEVEL 14 · LESSON 4 OF 18

Background work Advanced

# Background jobs

Move slow, unreliable work out of the request into a job queue: jobs, processors, workers, concurrency, retries with backoff, dead letters with @zudojs/queue.

- **45 min** to read and try
- **You need:** The messaging lesson
- **You build:** A reminder-email job for the Task API that retries on failure and never disappears silently

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Move slow or unreliable work off the request with a queue, a job and a processor
- Size concurrency for what the jobs call, and retry failures with exponential backoff and jitter
- Delay, schedule and prioritize jobs, and route permanently failing ones to the dead-letter queue
- Write an idempotent processor that survives being run more than once
- Bound a hanging job with a timeout and shut a worker down gracefully

## Why background jobs

At the end of [the messaging lesson](https://zudojs.oyinlola.site/learn/zudo-messaging), the Task API sent a reminder email *while the user waited*. Three things are wrong with that:

- **It is slow.** If the mail server needs 2 seconds, the request needs 2 seconds.
- **It is fragile.** If the mail server is down for a minute, the request fails, even though the user's task is fine.
- **It can be lost.** If the process crashes halfway, nobody knows the email was never sent.

A **job queue** fixes all three. The request only writes down what needs to be done, a **job**, and answers straight away with 202 Accepted. A separate loop, the **worker**, takes jobs off the queue one by one and runs a **processor**, the function that does the work. If the processor fails, the queue tries again later. If every try fails, the job is parked where a person can look at it, instead of vanishing.

Use a queue for anything slow or unreliable that the user does not need to wait for: emails, image resizing, reports, calls to other companies' APIs, webhooks.

## Install @zudojs/queue

Terminal on your computer

```bash
$ npm install @zudojs/queue

added 1 package, and audited 77 packages in 3s
…
```

The package ships an **in-memory queue**: jobs live in the memory of your process. That is perfect for learning, tests and small apps, and it runs in the browser terminal, so you can press **Run in browser** on every example. The last section explains what changes in production. On your computer, run the examples with `npx tsx src/<file>.ts`.

The timings on this page are kept short, tens of milliseconds, so the examples finish fast. Real retry delays are seconds or minutes.

## Your first queue

first.ts

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

interface Reminder {
  readonly taskId: number;
  readonly email: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<Reminder>(createQueueName("reminders"));

queue.process("send-reminder", async (job) => {
  console.log(`processor: reminder for task ${job.data.taskId} to ${job.data.email}`);
});

const job = await queue.add("send-reminder", { taskId: 1, email: "ada@example.com" });
console.log("added:", job.name, job.state);
console.log("the request can answer now");

await wait(200);
console.log("later:", (await queue.getJob(job.id))?.state);
await queue.close();
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
added: send-reminder waiting
the request can answer now
processor: reminder for task 1 to ada@example.com
later: completed
```

- `createQueueName("reminders")` names the queue. The name is a **branded** string, like the message ids in the messaging lesson, so a plain string is rejected by TypeScript.
- `queue.process(name, processor)` registers the function for jobs with that name. The in-memory queue starts checking for work as soon as a processor exists.
- `queue.add(name, data)` stores a job and returns at once. The job is `waiting`: the request did not wait for the work.
- A moment later the processor ran and the job is `completed`. `queue.close()` shuts the queue down. Always call it when your program stops.
- While a queue has jobs it can run, it keeps Node.js alive, so a script cannot exit before its jobs are done. An idle or closed queue never holds the process open. (`keepAlive: false` turns this off.)

A job moves through these **states**: `waiting` (ready), `scheduled` (not due yet), `active` (running), `completed`, `retrying` (failed, waiting to try again) and `dead_letter` (every try failed).

> WHAT GOES IN A JOB
>
> Put small, plain data in a job: ids, an email address, a date. Not whole objects from the database, which may have changed by the time the job runs, and never secrets such as passwords or API keys: queues are stored, logged and shown in dashboards. The processor should load fresh data by id, and read secrets from its own configuration.

## Concurrency

**Concurrency** is how many jobs run at the same time. The default is 1: one job after another. Jobs that mostly wait, for a mail server or an API, can safely run side by side. This example counts how many processors are running at once:

concurrency.ts

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(concurrency: number): Promise<void> {
  const queue = createInMemoryQueue<{ n: number }>(createQueueName("emails"), { concurrency });
  let running = 0;
  let mostAtOnce = 0;

  queue.process("send", async () => {
    running += 1;
    mostAtOnce = Math.max(mostAtOnce, running);
    await wait(50);
    running -= 1;
  });

  for (let n = 1; n <= 6; n++) await queue.add("send", { n });
  while ((await queue.getStats()).succeeded < 6) await wait(20);
  const stats = await queue.getStats();
  console.log(`concurrency ${concurrency}: ${stats.succeeded} jobs done, at most ${mostAtOnce} at once`);
  await queue.close();
}

await run(1);
await run(3);
```

Output of `npx tsx concurrency.ts` and of the browser terminal

```ts
concurrency 1: 6 jobs done, at most 1 at once
concurrency 3: 6 jobs done, at most 3 at once
```

Instead of guessing how long to wait, the loop asks `getStats()` every 20 ms until all 6 jobs have succeeded.

REASON IT OUT

### Concurrency 3 finished the same 6 jobs as concurrency 1. Why not set it to 1,000 and finish even faster?

Nothing in the queue itself stops you from setting a huge number. What actually limits how many of these jobs can usefully run at once? Think about what a "send reminder" processor does while it runs, and what it's talking to on the other end.

**Show the reasoning**

Every running job holds resources open for as long as it runs: memory in your own process, and often a connection to whatever it calls. The limit is rarely your side; it is the other end's. A mail provider might cap you at 10 simultaneous connections and start rejecting the 11th. A database pool might have 20 connections total, shared with everything else the app does. Set concurrency to 1,000 against a provider that allows 10, and 990 of those jobs fail immediately with connection errors, get retried, and hammer the same limit again — you have turned a queue meant to smooth out load into a source of load. Pick a number the slowest thing your jobs touch can actually handle, not the biggest number your own process could technically run.

## Retries and exponential backoff

Most failures in a job are temporary: a timeout, a server restarting, a rate limit. The answer is to try again. Two options control it:

- `attempts`: how many tries in total. The default is 1, which means no retry.
- `backoff`: how long to wait before each retry.

Retrying at once rarely helps: a server that is down now is probably still down 1 ms later. **Exponential backoff** doubles the wait after each failure, so a struggling service gets more and more room to recover. `calculateRetryDelay` is the function the queue uses, so you can see the waits it would pick:

backoff.ts

```ts
import { calculateRetryDelay, createExponentialBackoff, createFixedBackoff } from "@zudojs/queue";

const exponential = createExponentialBackoff(1000, { maxDelay: 30_000, jitter: "none" });
const fixed = createFixedBackoff(1000, { jitter: "none" });

for (let attempt = 1; attempt <= 7; attempt++) {
  const exp = calculateRetryDelay(attempt, exponential);
  const fix = calculateRetryDelay(attempt, fixed);
  console.log(`retry ${attempt}: exponential ${exp} ms, fixed ${fix} ms`);
}
```

Output of `npx tsx backoff.ts` and of the browser terminal

```ts
retry 1: exponential 1000 ms, fixed 1000 ms
retry 2: exponential 2000 ms, fixed 1000 ms
retry 3: exponential 4000 ms, fixed 1000 ms
retry 4: exponential 8000 ms, fixed 1000 ms
retry 5: exponential 16000 ms, fixed 1000 ms
retry 6: exponential 30000 ms, fixed 1000 ms
retry 7: exponential 30000 ms, fixed 1000 ms
```

The waits double from 1 second and stop growing at `maxDelay`, 30 seconds. Now imagine the mail server was down for a minute and 5,000 jobs failed at the same moment. With these exact numbers, all 5,000 retry at the same moment too, and knock the server over again. **Jitter** adds randomness to each wait, so the retries spread out. The default is `"full"`: a random wait between 0 and the computed one. Leave it on in production. It is off here only so the numbers are the same every time.

Here is a processor that fails twice and then works. The second argument of the processor, the **job context**, has `attemptNumber`: 1 on the first try, 2 on the second, and so on. (`job.attempt` also exists, but it counts the tries that came *before* this one, so it starts at 0.)

retry.ts

```ts
import { createInMemoryQueue, createQueueName, createExponentialBackoff } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ taskId: number }>(createQueueName("reminders"));

queue.process("send-reminder", async (job, context) => {
  const attempt = context.attemptNumber;
  if (attempt < 3) {
    console.log(`try ${attempt}: mail server timed out`);
    throw new Error("mail server timed out");
  }
  console.log(`try ${attempt}: sent`);
});

await queue.add("send-reminder", { taskId: 1 }, {
  attempts: 5,
  backoff: createExponentialBackoff(20, { jitter: "none" }),
});

await wait(600);
const stats = await queue.getStats();
console.log("succeeded:", stats.succeeded, "retried:", stats.retried);
await queue.close();
```

Output of `npx tsx retry.ts` and of the browser terminal

```ts
try 1: mail server timed out
try 2: mail server timed out
try 3: sent
succeeded: 1 retried: 2
```

Two failures, two retries, then success. The job was allowed 5 attempts and used 3. Nobody had to notice the outage.

> JOBS CAN RUN MORE THAN ONCE
>
> A retry runs the whole processor again. If the processor sent the email and *then* failed while writing "sent" to the database, the retry sends a second email. Queues promise **at least once**, not exactly once. Make processors **idempotent**, safe to run twice: check whether the work was already done, as the Task API example below does.

## Delayed jobs and priorities

Some jobs should not run yet: "remind me in one hour", "send the invoice on the 1st". `delay` waits a number of milliseconds, and `scheduledAt` waits until a date. `priority` decides which waiting job goes first: higher numbers first, 50 by default:

delayed.ts

```ts
import { createInMemoryQueue, createQueueName, JobPriorityLevels } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ label: string }>(createQueueName("reminders"));

queue.process("remind", async (job) => {
  console.log("ran:", job.data.label);
});

await queue.add("remind", { label: "normal" });
await queue.add("remind", { label: "urgent" }, { priority: JobPriorityLevels.HIGH });
const atTime = await queue.add("remind", { label: "at a date, 100 ms from now" }, {
  scheduledAt: new Date(Date.now() + 100),
});
const later = await queue.add("remind", { label: "in 250 ms" }, { delay: 250 });

console.log("states:", atTime.state, later.state);
await wait(500);
await queue.close();
```

Output of `npx tsx delayed.ts` and of the browser terminal

```ts
states: scheduled scheduled
ran: urgent
ran: normal
ran: at a date, 100 ms from now
ran: in 250 ms
```

The two delayed jobs start as `scheduled` and only become `waiting` when their time comes. Of the two jobs that were ready at once, the urgent one ran first, even though it was added after "normal". Among jobs with the same priority, the one added first runs first. `JobPriorityLevels` gives you named numbers: `LOW` (10), `NORMAL` (50), `HIGH` (100) and `CRITICAL` (200).

What about jobs that *repeat*, every night or every hour? A queue runs each job once. Repeating work is the job of a **scheduler**, which adds a job to the queue at the right times. That is [the next lesson](https://zudojs.oyinlola.site/learn/zudo-scheduler).

## The dead-letter queue

Some jobs will never succeed: the email address does not exist, the data is broken. After the last attempt, the queue moves the job to the **dead-letter queue**, a holding area for jobs that could not be done. The name comes from the post office, where undeliverable letters go to a "dead letter office". Nothing is silently thrown away:

dead-letter.ts

```ts
import { createInMemoryQueue, createQueueName, createFixedBackoff } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ email: string }>(createQueueName("reminders"));

queue.process("send-reminder", async (job) => {
  if (job.data.email.endsWith("@example.invalid")) {
    throw new Error(`mailbox ${job.data.email} does not exist`);
  }
});

const good = await queue.add("send-reminder", { email: "ada@example.com" }, { attempts: 3 });
const bad = await queue.add("send-reminder", { email: "nobody@example.invalid" }, {
  attempts: 3,
  backoff: createFixedBackoff(10),
});

await wait(500);
console.log("good:", (await queue.getJob(good.id))?.state);
console.log("bad: ", (await queue.getJob(bad.id))?.state);

for (const dead of await queue.getDeadLetterJobs()) {
  console.log(`dead letter: ${dead.job.name} for ${dead.job.data.email}`);
  console.log(`  after ${dead.attempts} attempts: ${dead.reason}`);
}
console.log("dead-lettered:", (await queue.getStats()).deadLettered);
await queue.close();
```

Output of `npx tsx dead-letter.ts` and of the browser terminal

```ts
good: completed
bad:  dead_letter
dead letter: send-reminder for nobody@example.invalid
  after 3 attempts: mailbox nobody@example.invalid does not exist
dead-lettered: 1
```

Each entry keeps the job, the error and the number of attempts. What you do with dead letters is a decision for your team:

- **Alert** when the count grows. A dead-letter queue nobody looks at is just a slower way to lose data. Every queue has an `events` emitter: `queue.events?.on("job:failed", ({ job, error }) => …)` runs on every failed attempt, and `getStats().deadLettered` gives the count. The [observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability) shows how to count and alert.
- **Fix and replay.** If a bug caused the failures, fix it, then add the jobs again with `queue.add(dead.job.name, dead.job.data)`.
- **Stop early for permanent errors.** Retrying "mailbox does not exist" three times wastes time. A processor can check the error and give up at once, for example by marking the reminder as failed in the database and returning normally.

## Timeouts

A job that hangs forever blocks a concurrency slot forever. Every job has a `timeout`, 30 seconds by default. When it runs out, the queue aborts `context.signal`, the same kind of `AbortSignal` you used in the messaging lesson, and counts the attempt as failed. Like there, the processor must watch the signal and stop itself:

timeout.ts

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ pages: number }>(createQueueName("reports"));

queue.process("build-report", async (job, context) => {
  for (let page = 1; page <= job.data.pages; page++) {
    context.signal.throwIfAborted();
    await wait(200);
    console.log(`page ${page} done`);
  }
});

const job = await queue.add("build-report", { pages: 10 }, { timeout: 500 });
await wait(1200);
console.log("state:", (await queue.getJob(job.id))?.state);
await queue.close();
```

Output of `npx tsx timeout.ts` and of the browser terminal

```ts
page 1 done
page 2 done
page 3 done
state: dead_letter
```

After 500 ms the signal was aborted, in the middle of page 3. The processor finished the page it was on, saw the signal before page 4, and stopped. With one attempt allowed, the job went to the dead-letter queue. A processor that ignores the signal keeps running in the background, and the queue waits up to 5 seconds for it before giving up on it.

## Workers and graceful shutdown

So far the queue ran its own jobs. A separate **worker** gives you control: its own concurrency, and `start()` and `stop()`. When you create one, the queue stops running jobs itself and leaves that to the worker.

Stopping matters more than it seems. When you deploy a new version, the old process is told to stop, often with a `SIGTERM` signal, as you saw in [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime). If it simply exits, the jobs it was running die halfway. A **graceful shutdown** stops taking new jobs, lets the running ones finish, and only then exits:

worker.ts

```ts
import { createInMemoryQueue, createQueueName, createWorker } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ n: number }>(createQueueName("reminders"), { autoProcess: false });

queue.process("send-reminder", async (job) => {
  await wait(400);
  console.log(`  job ${job.data.n} finished`);
});

for (let n = 1; n <= 5; n++) await queue.add("send-reminder", { n });

const worker = createWorker("worker-1", queue, { concurrency: 2, pollInterval: 10 });
await worker.start();
console.log("worker:", worker.state);

await wait(200);
console.log("SIGTERM: stopping");
await worker.stop();

console.log("worker:", worker.state, worker.getStats());
const stats = await queue.getStats();
console.log("still waiting for the next start:", stats.waiting);
await queue.close();
```

Output of `npx tsx worker.ts` and of the browser terminal

```ts
worker: running
SIGTERM: stopping
  job 1 finished
  job 2 finished
worker: stopped {
  processed: 2,
  succeeded: 2,
  failed: 0,
  concurrency: 2,
  state: 'stopped'
}
still waiting for the next start: 3
```

Follow what happened:

- With `concurrency: 2`, the worker started jobs 1 and 2.
- 200 ms later, while both were still running, the stop request came. `stop()` did not cut them off: it waited for both to finish, then resolved.
- Jobs 3, 4 and 5 were never started. They are still `waiting`, ready for the next worker. (With the in-memory queue they die with the process. With a stored queue they would survive.)

`autoProcess: false` keeps the queue from running jobs before the worker exists. `stop()` waits at most `drainTimeout` (30 seconds by default), and then aborts the jobs that are still running through their signal. Your platform will kill the process eventually, so keep that timeout shorter than its grace period.

## Put it together: reminder jobs in the Task API

The reminder from the messaging lesson becomes a job. The route only enqueues it. The processor loads fresh data by id, skips reminders that were already sent (idempotency), and fails loudly on errors so the queue can retry:

reminders.ts

```ts
import { createInMemoryQueue, createQueueName, createExponentialBackoff } from "@zudojs/queue";

export interface ReminderJob {
  readonly taskId: number;
}

interface TaskRow { readonly id: number; readonly title: string; readonly email: string; reminded: boolean }

export const tasks = new Map<number, TaskRow>([
  [1, { id: 1, title: "Buy milk", email: "ada@example.com", reminded: false }],
]);

let mailServerUp = false;
export const mailer = {
  async send(to: string, text: string): Promise<void> {
    if (!mailServerUp) {
      mailServerUp = true;
      throw new Error("mail server unavailable");
    }
    console.log(`mail to ${to}: ${text}`);
  },
};

export const reminders = createInMemoryQueue<ReminderJob>(createQueueName("reminders"), {
  concurrency: 5,
  defaultJobOptions: { attempts: 5, backoff: createExponentialBackoff(20, { maxDelay: 1000 }) },
});

reminders.process("send-reminder", async (job) => {
  const task = tasks.get(job.data.taskId);
  if (!task || task.reminded) {
    console.log(`task ${job.data.taskId}: nothing to do`);
    return;
  }
  await mailer.send(task.email, `Don't forget "${task.title}"`);
  task.reminded = true;
});
```

main.ts

```ts
import { reminders } from "./reminders.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postReminder(taskId: number) {
  await reminders.add("send-reminder", { taskId }, { deduplicationKey: `reminder.task-${taskId}` });
  return { status: 202, body: { queued: true } };
}

console.log(await postReminder(1));
try {
  await postReminder(1);
} catch (error) {
  if (error instanceof Error) console.log("second click:", error.name);
}

await wait(500);
const stats = await reminders.getStats();
console.log("succeeded:", stats.succeeded, "retried:", stats.retried, "dead:", stats.deadLettered);

await reminders.add("send-reminder", { taskId: 1 });
await wait(200);
await reminders.close();
```

Output of `npx tsx main.ts` and of the browser terminal

```json
{ status: 202, body: { queued: true } }
second click: JobDuplicateError
mail to ada@example.com: Don't forget "Buy milk"
succeeded: 1 retried: 1 dead: 0
task 1: nothing to do
```

- The route answered 202 straight away. The work happened after.
- A double click tried to add the same reminder twice. The `deduplicationKey` refused the second job while the first one exists. In the real route, catch `JobDuplicateError`, imported from `@zudojs/errors` (the package this lesson's examples check with `error.name`; `@zudojs/queue` does not re-export it), and answer 202 anyway: the reminder *is* queued.
- The fake mail server failed once. The queue retried, and the second try sent the email. The user never saw the outage.
- A late extra job for the same task found `reminded: true` and did nothing: the processor is idempotent.

`defaultJobOptions` gives every job on the queue the same retry policy, so no route can forget it.

## In production

The in-memory queue keeps jobs in the process's memory. Restart the process and every waiting job is gone, and two copies of the Task API have two separate queues. For production you want a queue backed by a store that survives restarts and is shared by all your servers, such as Redis or PostgreSQL. `@zudojs/queue` defines the `Queue` interface you have been using, so such an adapter can replace `createInMemoryQueue` without changing your processors. Only the in-memory implementation is published today, so check what your platform provides, or use a well-known queue library behind the same interface.

Whatever store you use, the rules from this lesson stay the same: small job data, no secrets in jobs, idempotent processors, retries with backoff and jitter, dead letters that somebody watches, and a graceful stop.

## Practice

TRY IT YOURSELF

### Give up on permanent errors

Change the dead-letter example so that a "does not exist" error does not waste retries: the processor records the bad address in a `failedAddresses` list and returns normally, while other errors are still thrown for a retry.

**Show a solution**

permanent.ts

```ts
import { createInMemoryQueue, createQueueName, createFixedBackoff } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queue = createInMemoryQueue<{ email: string }>(createQueueName("reminders"));
const failedAddresses: string[] = [];
let tries = 0;

queue.process("send-reminder", async (job) => {
  tries += 1;
  if (job.data.email.endsWith("@example.invalid")) {
    failedAddresses.push(job.data.email);
    return;
  }
});

await queue.add("send-reminder", { email: "nobody@example.invalid" }, {
  attempts: 3,
  backoff: createFixedBackoff(10),
});
await wait(300);
console.log("tries:", tries, "failed addresses:", failedAddresses);
console.log("dead-lettered:", (await queue.getStats()).deadLettered);
await queue.close();
```

Output of `npx tsx permanent.ts` and of the browser terminal

```ts
tries: 1 failed addresses: [ 'nobody@example.invalid' ]
dead-lettered: 0
```

One try instead of three. In the Task API, write the failure to the database so the user can see "reminder could not be delivered" and fix their address.

TRY IT YOURSELF

### Queue middleware

Queue middleware wraps every job, like the other middleware you have met. It receives `ctx` with `ctx.job` and `ctx.next()`. Write one that prints `start` and `end` with the job name, and pass it in the `middleware` option of the queue.

**Show a solution**

middleware.ts

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import type { QueueMiddleware } from "@zudojs/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const log: QueueMiddleware = async (ctx) => {
  console.log("start", ctx.job.name);
  try {
    return await ctx.next();
  } finally {
    console.log("end", ctx.job.name);
  }
};

const queue = createInMemoryQueue<{ taskId: number }>(createQueueName("reminders"), { middleware: [log] });
queue.process("send-reminder", async (job) => console.log("  sending for task", job.data.taskId));

await queue.add("send-reminder", { taskId: 1 });
await wait(200);
await queue.close();
```

Output of `npx tsx middleware.ts` and of the browser terminal

```ts
start send-reminder
  sending for task 1
end send-reminder
```

TRY IT YOURSELF

### Which tool?

For each, choose a direct call, an event, or a job: (a) checking a password at login; (b) generating a 200-page PDF export; (c) clearing the cache after a task changes; (d) calling a partner's webhook that is often slow.

**Show a solution**

(a) A direct call: the user needs the answer now, and it is fast. (b) A job: slow, and the user can get a link when it is ready. (c) An event: fast, in-process, and several parts may care. (d) A job, with retries and backoff: slow and unreliable, and a failure must not be lost.

## Recap

- A queue moves slow or unreliable work out of the request. `add` stores a job, a processor does the work later.
- Jobs hold small, plain data: ids, not objects, and never secrets.
- `concurrency` sets how many jobs run at once. Size it for what the jobs call.
- `attempts` and `backoff` retry failures. Exponential backoff with jitter gives a failing service room to recover.
- Jobs run at least once, so processors must be idempotent.
- `delay` and `scheduledAt` postpone a job. Repeating work belongs to a scheduler.
- Jobs that fail every attempt go to the dead-letter queue. Watch it.
- Processors honour `context.signal` for timeouts. A worker's `stop()` lets running jobs finish before the process exits.

A queue runs each job once, when something asks it to. Next, [Scheduled tasks](https://zudojs.oyinlola.site/learn/zudo-scheduler) covers work that must run on its own, on the clock: every night, every hour, with nobody sending a job.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
