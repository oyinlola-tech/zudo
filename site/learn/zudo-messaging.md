---
title: "Messaging"
description: "Ask another part of the Task API to do something and get an answer back, without importing it. Messages, handlers, middleware, correlation and causation ids, timeouts and cancellation with @zudojs/messaging."
source: https://zudojs.oyinlola.site/learn/zudo-messaging
---

LESSON 65 OF 84

Events, messages and background work Advanced

# Messaging

Ask another part of the Task API to do something and get an answer back, without importing it. Messages, handlers, middleware, correlation and causation ids, timeouts and cancellation with @zudojs/messaging.

- **35 min** to read and try
- **You need:** The events lesson
- **You build:** A reminder request that travels from the tasks module to a notifications module and back, traceable end to end

  [Test yourself](#test)

## Events tell, messages ask

In [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events), the task service announced `task.completed` and did not care who reacted. Sometimes you need the opposite. The tasks part of the Task API wants the notifications part to *send a reminder email*, and it wants to know whether that worked, so it can tell the user.

You could import the notifications code and call it directly. That is fine while the app is small. But as the app grows into separate modules (you will do that in [the modular monolith lesson](https://zudojs.oyinlola.site/learn/zudo-modular-monolith)), every module importing every other module turns into a tangle.

A **message** is a small named object with data that asks for something: "send a reminder for task 1". You hand it to a **message bus**. The bus finds the **handler** registered for that message type, runs it, and gives you back what the handler returned. Sender and handler only share the type name.

|  | Event (`@zudojs/events`) | Message (`@zudojs/messaging`) |
| --- | --- | --- |
| Means | "This happened." | "Please do this, and tell me how it went." |
| Name | Past tense: `task.completed` | An instruction: `reminder.send` |
| Handlers | Any number, results ignored | Usually one, and its return value comes back |
| If a handler fails | The others still run | The dispatch stops and reports the failure |

Both are in-process: they live in the memory of one running program, like the event bus.

## Install @zudojs/messaging

In your `task-api` folder:

Terminal on your computer

```bash
$ npm install @zudojs/messaging

added 1 package, and audited 75 packages in 3s
…
```

Only one package was added, because the packages it builds on, `@zudojs/errors`, `@zudojs/constants` and `@zudojs/middleware`, are already in your project. Every example on this page runs in the browser terminal, and on your computer with `npx tsx src/<file>.ts`.

## Your first message

first.ts

```ts
import { createMessageBus } from "@zudojs/messaging";
import type { Message } from "@zudojs/messaging";

interface SendReminder {
  readonly taskId: number;
  readonly email: string;
}

const bus = createMessageBus();

bus.on("reminder.send", async (message: Message<SendReminder>) => {
  console.log(`sending reminder for task ${message.payload.taskId} to ${message.payload.email}`);
  return { delivered: true };
}, { id: "send-reminder" });

const result = await bus.send({
  type: "reminder.send",
  payload: { taskId: 1, email: "ada@example.com" },
});

console.log("success:", result.success);
console.log("value:", result.value);
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
sending reminder for task 1 to ada@example.com
success: true
value: { delivered: true }
```

- `bus.on(type, handler, { id })` registers a handler. Give it an `id`, so errors can name it and you can remove it later with `bus.off(id)`.
- The type on the parameter, `Message<SendReminder>`, tells TypeScript the shape of `message.payload`.
- `bus.send({ type, payload })` builds the message and dispatches it. The **result** says whether it worked (`success`) and carries the handler's return value (`value`).

## What a message is

Like an event, a message is a frozen object with an `id`, a `type`, a `payload` and a `timestamp`. `createMessage` builds one yourself:

message.ts

```ts
import { createMessage, toCorrelationId } from "@zudojs/messaging";

const message = createMessage({
  type: "reminder.send",
  payload: { taskId: 1, email: "ada@example.com" },
  source: "tasks",
  correlationId: toCorrelationId("req-7f3a"),
});

console.log(message.type, message.source);
console.log(message.id.startsWith("msg:"), message.timestamp instanceof Date);
console.log(message.correlationId);
console.log(Object.isFrozen(message));
```

Output of `npx tsx message.ts` and of the browser terminal

```ts
reminder.send tasks
true true
req-7f3a
true
```

`source` says which part of the app sent the message. The `correlationId` is explained below. Notice `toCorrelationId("req-7f3a")`: the ids in this package are **branded** strings. At runtime they are plain strings, but TypeScript will not accept any old string where a correlation id belongs, so you cannot pass a user id there by mistake. You brand a string once, with `toCorrelationId`, `toMessageId` or `toCausationId`, and they reject empty strings.

## Results and failures

A failing handler does *not* make `send` throw. It returns a result with `success: false`, and the reason in `error`. That forces you to look at the outcome instead of forgetting a `try`:

results.ts

```ts
import { createMessageBus, MessageHandlerError } from "@zudojs/messaging";

const bus = createMessageBus();

bus.on("reminder.send", async () => {
  throw new Error("mail server is down");
}, { id: "send-reminder" });

const failed = await bus.send({ type: "reminder.send", payload: { taskId: 1 } });
console.log("success:", failed.success);
console.log("wrapped:", failed.error instanceof MessageHandlerError);
console.log("message:", failed.error?.message);

const nobody = await bus.send({ type: "reminder.snd", payload: { taskId: 1 } });
console.log("typo:", nobody.success, nobody.value);
```

Output of `npx tsx results.ts` and of the browser terminal

```ts
success: false
wrapped: true
message: Handler "send-reminder" failed: mail server is down
typo: true []
```

Look at the last line: a message that no handler listens for, here because of a typo in the type, still counts as a success, with an empty list as its value. The bus cannot tell "nobody needed to answer" from "you misspelled the address".

When a message must have exactly one handler, as a request that expects an answer should, create the bus with `allowMultipleHandlers: false`, and check `bus.hasHandlers(type)` at start-up:

one-handler.ts

```ts
import { createMessageBus } from "@zudojs/messaging";

const bus = createMessageBus({ allowMultipleHandlers: false });

bus.on("reminder.send", async () => ({ delivered: true }), { id: "send-reminder" });

try {
  bus.on("reminder.send", async () => ({ delivered: false }), { id: "old-reminder" });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}

for (const type of ["reminder.send", "reminder.cancel"]) {
  console.log(type, "has a handler:", bus.hasHandlers(type));
}
```

Output of `npx tsx one-handler.ts` and of the browser terminal

```ts
MessageError - Message type "reminder.send" already has handler "send-reminder" and the registry does not allow multiple handlers.
reminder.send has a handler: true
reminder.cancel has a handler: false
```

A second handler for the same type is now a mistake that fails at once, when the app starts, rather than a surprise in production. With several handlers allowed (the default), they run one after another, lowest `priority` number first, and `value` is an array of their results. The first one that fails stops the rest.

## Message middleware

Message middleware works like the event middleware you just saw: a function around every dispatch, with a `next()` that runs the rest. Whatever `next()` returns becomes the result's value. Here one middleware logs every message, and another checks the payload with a schema from [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation) before any handler can see it:

middleware.ts

```ts
import { createMessageBus, MessageValidationError } from "@zudojs/messaging";
import { schema } from "@zudojs/schema";

const ReminderSchema = schema.object({
  taskId: schema.number().int().positive(),
  email: schema.string().email(),
});

const bus = createMessageBus();

bus.use(async (ctx, next) => {
  console.log(`-> ${ctx.message.type}`);
  try {
    return await next();
  } finally {
    console.log(`<- ${ctx.message.type}`);
  }
}, { id: "logging", priority: 10 });

bus.use(async (ctx, next) => {
  if (ctx.message.type === "reminder.send" && !ReminderSchema.safeParse(ctx.message.payload).success) {
    throw new MessageValidationError("Invalid reminder.send payload");
  }
  return next();
}, { id: "validation", priority: 20 });

bus.on("reminder.send", async () => ({ delivered: true }), { id: "send-reminder" });

const ok = await bus.send({ type: "reminder.send", payload: { taskId: 1, email: "ada@example.com" } });
console.log(ok.success, ok.value);
const bad = await bus.send({ type: "reminder.send", payload: { taskId: -1, email: "not-an-email" } });
console.log(bad.success, bad.error?.name, "-", bad.error?.message);
```

Output of `npx tsx middleware.ts` and of the browser terminal

```ts
-> reminder.send
<- reminder.send
true { delivered: true }
-> reminder.send
<- reminder.send
false MessageValidationError - Invalid reminder.send payload
```

- Middleware runs in *ascending* priority order here: 10 before 20, and the default is 100. That is the opposite of the event bus, so always look it up.
- The logging middleware uses `try`/`finally`, so its closing line prints even when an inner layer throws.
- When a middleware throws, the result is `success: false` and `error` is exactly what it threw. The handler never ran with bad data.

Validating in the handler itself is also fine. Validating in middleware means no handler can forget. A message payload often came from outside (an HTTP body, a queue), so treat it like any other outside input.

## Correlation and causation ids

One click in the app can start a chain: an HTTP request, which sends `reminder.send`, whose handler sends `email.deliver`. When something in that chain fails at 3 a.m., you need to find every log line that belongs to that one click. Two ids make that possible:

- The **correlation id** is shared by everything that belongs to one bigger operation, usually one HTTP request. Every message in the chain carries the same one.
- The **causation id** is the id of the one message that directly caused this one. It lets you rebuild the chain step by step.

`createDerivedMessage(parent, input)` builds a follow-up message that keeps the parent's correlation id and records the parent as its cause. Every handler can read both ids from its second argument, the **context**:

correlation.ts

```ts
import { createDerivedMessage, createMessageBus, toCorrelationId } from "@zudojs/messaging";

const bus = createMessageBus();
const ids = new Map<string, string>();

bus.on("reminder.send", async (message, context) => {
  console.log(`[${context.correlationId}] reminder.send, caused by: ${ids.get(context.causationId)}`);
  ids.set(message.id, "reminder.send");
  const email = createDerivedMessage(message, { type: "email.deliver", payload: { to: "ada@example.com" } });
  const delivered = await bus.dispatch(email);
  return delivered.value;
}, { id: "send-reminder" });

bus.on("email.deliver", async (message, context) => {
  console.log(`[${context.correlationId}] email.deliver, caused by: ${ids.get(context.causationId)}`);
  return "queued";
}, { id: "deliver-email" });

const result = await bus.send({
  type: "reminder.send",
  payload: { taskId: 1 },
  correlationId: toCorrelationId("req-7f3a"),
});
console.log("result:", result.value);
```

Output of `npx tsx correlation.ts` and of the browser terminal

```json
[req-7f3a] reminder.send, caused by: undefined
[req-7f3a] email.deliver, caused by: reminder.send
result: queued
```

Both handlers logged the same correlation id, `req-7f3a`. The first message had no parent: its causation id defaults to its own id, which was not in the map yet, so it printed `undefined`. The second one names `reminder.send` as its cause. `bus.dispatch(message)` sends a message you already built.

You can also pass the id as the second argument of `send`: `bus.send(input, { context: { correlationId } })`. The bus copies it onto the message it builds (unless the input already has its own), so `createDerivedMessage` keeps the chain intact either way. The Task API code at the end of this page uses that form.

In the Task API, use the HTTP request id as the correlation id. The observability lesson puts the same id on every log line and trace, so one search finds the whole story.

## Timeouts

The mail server hangs. Without a limit, the request that sent `reminder.send` waits forever, and so does the user. Give the dispatch a `timeout` in milliseconds:

timeout.ts

```ts
import { createMessageBus, MessageTimeoutError } from "@zudojs/messaging";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bus = createMessageBus();

bus.on("reminder.send", async (message, context) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (context.signal.aborted) {
      console.log(`handler: gave up before attempt ${attempt}`);
      return "cancelled";
    }
    console.log(`handler: attempt ${attempt} to reach the mail server`);
    await wait(30);
  }
  return "sent";
}, { id: "send-reminder" });

const result = await bus.send({ type: "reminder.send", payload: { taskId: 1 } }, { timeout: 45 });
console.log("success:", result.success, "timeout:", result.error instanceof MessageTimeoutError);
console.log(result.error?.message);
```

Output of `npx tsx timeout.ts` and of the browser terminal

```ts
handler: attempt 1 to reach the mail server
handler: attempt 2 to reach the mail server
success: false timeout: true
Message processing exceeded the timeout of 45ms.
handler: gave up before attempt 3
```

Read the order of the lines carefully:

- After 45 ms, `send` returned with `success: false` and a `MessageTimeoutError`. The caller was not kept waiting.
- The handler was *not* stopped by force. JavaScript cannot kill a running function. It kept going until its next check of `context.signal.aborted`, then stopped itself.

That `context.signal` is an **AbortSignal**, the standard object that JavaScript uses to say "stop, nobody needs this any more". It has an `aborted` flag, and many built-in functions accept it: pass it to `fetch(url, { signal })` and the request itself is cancelled. A handler that ignores the signal keeps running and wasting resources after its caller has gone. `createMessageBus({ defaultTimeout: 5000 })` sets a timeout for every dispatch.

## Cancellation with AbortController

Sometimes the caller decides to stop, for example because the user closed the page. An **AbortController** is the object that owns a signal: you pass `controller.signal` to the work, and call `controller.abort()` to cancel it. The bus links that signal to the handler's `context.signal`:

cancel.ts

```ts
import { createMessageBus, MessageDispatchAbortedError } from "@zudojs/messaging";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bus = createMessageBus();

bus.on("report.build", async (message, context) => {
  for (let page = 1; page <= 5; page++) {
    if (context.signal.aborted) {
      console.log(`handler: stopped before page ${page}`);
      return "cancelled";
    }
    await wait(50);
    console.log(`built page ${page}`);
  }
  return "report ready";
}, { id: "build-report" });

const controller = new AbortController();
setTimeout(() => controller.abort(new Error("the user closed the page")), 75);
const result = await bus.send({ type: "report.build", payload: null }, { signal: controller.signal });
console.log("success:", result.success);
console.log(result.error?.message, result.error instanceof MessageDispatchAbortedError);

try {
  await bus.send({ type: "report.build", payload: null }, { signal: controller.signal });
} catch (error) {
  console.log("already aborted:", error instanceof MessageDispatchAbortedError);
}
```

Output of `npx tsx cancel.ts` and of the browser terminal

```ts
built page 1
success: false
Message dispatch was aborted. true
already aborted: true
built page 2
handler: stopped before page 3
```

Each page takes 50 ms. The controller aborted after 75 ms, while page 2 was being built. Follow the lines:

- `send` returned at once, at 75 ms, with `success: false` and a `MessageDispatchAbortedError`. The caller does not wait for the handler. The reason you gave to `abort()` stays on `controller.signal.reason` if you want to log it.
- The second `send` used a signal that was already aborted, so it never started: that is one of the few cases where `send` throws instead of returning a result.
- The handler, still running in the background, finished page 2, saw the aborted signal and stopped before page 3.

The dispatch is reported as aborted even though the handler returned normally with `"cancelled"`, so the caller can never mistake cancelled work for finished work (since `@zudojs/messaging` 1.2.0). A handler that ignores the signal does no harm to the result, but it wastes work: it would build all five pages for nobody. A shorter way to stop is `context.signal.throwIfAborted()`, which throws if the signal was aborted and does nothing otherwise.

## Put it together: reminders in the Task API

The notifications part of the app owns the mailer and registers the handler. The tasks part only knows the message type and the payload shape. They could live in different folders, or later in different modules, without importing each other:

notifications.ts

```ts
import type { Message, MessageBus } from "@zudojs/messaging";

export interface SendReminder {
  readonly taskId: number;
  readonly title: string;
  readonly email: string;
}

export function registerNotificationHandlers(bus: MessageBus): void {
  bus.on("reminder.send", async (message: Message<SendReminder>, context) => {
    context.signal.throwIfAborted();
    const { title, email } = message.payload;
    console.log(`[${context.correlationId}] mail to ${email}: don't forget "${title}"`);
    return { delivered: true, at: "2026-10-01T09:00:00Z" };
  }, { id: "send-reminder" });
}
```

main.ts

```ts
import { createMessageBus, toCorrelationId } from "@zudojs/messaging";
import { registerNotificationHandlers } from "./notifications.js";

const bus = createMessageBus({ allowMultipleHandlers: false, defaultTimeout: 2000 });
registerNotificationHandlers(bus);

async function remind(requestId: string, taskId: number, title: string, email: string) {
  const result = await bus.send(
    { type: "reminder.send", source: "tasks", payload: { taskId, title, email } },
    { context: { correlationId: toCorrelationId(requestId) } },
  );
  if (!result.success) {
    return { status: 502, body: { error: "Could not send the reminder" } };
  }
  return { status: 202, body: result.value };
}

console.log(await remind("req-7f3a", 1, "Buy milk", "ada@example.com"));
bus.dispose();
```

Output of `npx tsx main.ts` and of the browser terminal

```json
[req-7f3a] mail to ada@example.com: don't forget "Buy milk"
{ status: 202, body: { delivered: true, at: '2026-10-01T09:00:00Z' } }
```

The route answers 202 (Accepted) with the handler's result. If the handler fails or times out, the client gets a 502 with a short, safe message. The real reason goes to your logs, never to the client. `bus.dispose()` releases the bus when the app shuts down. After that, every `send` throws.

Notice that the reminder here is sent while the user waits. If the mail server is slow, the request is slow, and if the server crashes, the reminder is lost. In [the background jobs lesson](https://zudojs.oyinlola.site/learn/zudo-queue) you move this work onto a queue, so it survives crashes and retries on its own.

## Practice

TRY IT YOURSELF

### Time every message

Write a middleware that stores the start time in `ctx.state` before `next()`, and after it prints the message type and whether the dispatch threw. Test it with one handler that works and one that throws.

**Show a solution**

timing.ts

```ts
import { createMessageBus } from "@zudojs/messaging";

const bus = createMessageBus();

bus.use(async (ctx, next) => {
  ctx.state.set("startedAt", Date.now());
  try {
    const value = await next();
    console.log(`${ctx.message.type}: ok`);
    return value;
  } catch (error) {
    console.log(`${ctx.message.type}: failed`);
    throw error;
  }
});

bus.on("task.count", async () => 3, { id: "count" });
bus.on("task.explode", async () => {
  throw new Error("boom");
}, { id: "explode" });

console.log((await bus.send({ type: "task.count", payload: null })).value);
console.log((await bus.send({ type: "task.explode", payload: null })).success);
```

Output of `npx tsx timing.ts` and of the browser terminal

```ts
task.count: ok
3
task.explode: failed
false
```

A handler's error reaches the middleware as a thrown error, so a middleware sees failures too. Re-throw it, so the result still reports the failure.

TRY IT YOURSELF

### Messages or events?

Which fits each case: (a) "user.registered", which starts a welcome email, an analytics entry and a Slack notice; (b) "tax.calculate", which needs the tax amount back for an invoice?

**Show a solution**

(a) An event: something happened, several independent reactions, and nobody needs an answer. (b) A message: it asks for a result and needs exactly one handler, so use a bus with `allowMultipleHandlers: false`. The next lesson, CQRS, builds on this split between "do something" and "tell me something".

TRY IT YOURSELF

### Respect the signal

This handler ignores its signal: `async () => { await wait(300); return "done"; }`. Rewrite it so a dispatch with `timeout: 45` stops it soon after the timeout, by waiting in steps of 30 ms.

**Show a solution**

respect.ts

```ts
import { createMessageBus } from "@zudojs/messaging";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bus = createMessageBus();
let steps = 0;

bus.on("slow.job", async (message, context) => {
  for (let i = 0; i < 10; i++) {
    context.signal.throwIfAborted();
    await wait(30);
    steps += 1;
  }
  return "done";
}, { id: "slow-job" });

const result = await bus.send({ type: "slow.job", payload: null }, { timeout: 45 });
await wait(100);
console.log("success:", result.success, "steps done:", steps);
```

Output of `npx tsx respect.ts` and of the browser terminal

```ts
success: false steps done: 2
```

The handler did 2 steps (about 60 ms), then saw the aborted signal and stopped, instead of running all 10.

## Recap

- An event says "this happened". A message asks "please do this" and brings the answer back.
- `bus.on(type, handler, { id })` registers, `bus.send({ type, payload })` dispatches and returns `{ success, value, error }`. A failing handler does not throw.
- A message nobody handles is still a success. Use `allowMultipleHandlers: false` and `hasHandlers` for requests that need exactly one answer.
- Middleware wraps every dispatch. It runs in ascending priority order. Validate payloads there.
- The correlation id ties one operation together, and the causation id points to the direct parent. `createDerivedMessage` keeps both right.
- `timeout` and an `AbortController` cancel through `context.signal`. The send returns at once with a failure, but handlers must check the signal and stop themselves, because nothing stops them by force.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
