---
title: "@zudojs/messaging — Messaging Documentation"
description: "Complete documentation for @zudojs/messaging — the in-process message bus infrastructure for Zudojs."
source: https://zudojs.oyinlola.site/docs/packages-messaging
---

v1.0.2

# @zudojs/messaging

An in-process message bus: one part of your program sends a named message, other parts handle it and send an answer back, all without the two sides knowing about each other.

MESSAGING PUB/SUB MIDDLEWARE DISPATCH

## OVERVIEW

When one part of an app needs another part to do something, the simplest option is a direct function call. That works until the two parts live in different modules, or until three other parts also want to react. Then every caller has to import every listener, and the code becomes a tangle.

A *message bus* breaks that tangle. Senders hand a *message* (a small named object with data) to the bus. The bus looks up the *handlers* that registered for that message's type, runs them, and hands their return values back to the sender. Sender and handlers only share the message type string, such as `"order.placed"`.

`@zudojs/messaging` is that bus, kept inside a single Node.js process. It has no network, no queue and no persistence. It is the generic layer; [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) and [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) use the same vocabulary for more specific jobs (see [Messaging vs Events](#messaging-vs-events)).

Reach for it when

- Modules in one process need to talk without importing each other.
- You want a request/response shape: the handler's return value matters.
- You want to add logging or timing around every message in one place.
- You are building a higher-level bus of your own and need the plumbing.

Skip it when

- A plain function call would do. Two modules that already import each other do not need a bus.
- You are announcing "something happened" to many listeners. Use [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md).
- Work must survive a restart or run on another machine. Use [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md).

## INSTALLATION

Install the package. It pulls in `@zudojs/errors` and `@zudojs/constants` on its own; you do not need to add them.

```bash
$ npm install @zudojs/messaging
```

> **Source of truth:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

Requires Node.js 24 or newer and an ES-module project (`"type": "module"` in package.json).

## QUICK START

This creates a bus, registers one handler for the type `"user.created"`, sends a message of that type, and prints what came back.

```ts
import { createMessageBus } from "@zudojs/messaging";

const bus = createMessageBus();

// 1. Register a handler. It runs whenever a "user.created" message arrives.
bus.on("user.created", async (message) => {
  console.log("New user:", message.payload);
  return "welcome email queued";
}, { id: "send-welcome-email" });

// 2. Send a message. send() builds the Message object for you.
const result = await bus.send({
  type: "user.created",
  payload: { id: "u-1", email: "ada@example.com" },
});

console.log(result.success); // true
console.log(result.value);   // "welcome email queued"

// 3. Release the bus when you are done with it.
bus.dispose();
```

What you should see, in order: `New user: { id: 'u-1', email: 'ada@example.com' }`, then `true`, then `welcome email queued`.

> **Tip:** Always pass an `id` when you call `on()`. Without one the bus makes an id from the type and the current millisecond, so two handlers registered in the same millisecond collide and the second throws `DuplicateMessageHandlerError`.

## MESSAGES

A *message* is a frozen object with four required fields: a unique `id`, a `type` string, a `payload` (any data you like) and a `timestamp`. The type is the address: handlers register for a type, and the bus routes by it. Dotted names like `"order.placed"` are the convention.

Optional fields describe where the message came from: `source` (which subsystem made it), `correlationId` and `causationId` (explained under [Context](#context)) and free-form `metadata`.

This builds a message by hand and prints the fields the factory filled in for you.

```ts
import { createMessage, describeMessage, toCorrelationId } from "@zudojs/messaging";

const message = createMessage({
  type: "order.placed",
  payload: { orderId: "ord-001", total: 4999 },
  source: "checkout",
  correlationId: toCorrelationId("req-abc"),
});

console.log(message.id);                 // "msg:6f1c…" — a fresh random id
console.log(message.timestamp);          // the Date it was created
console.log(describeMessage(message)); // "order.placed (msg:6f1c…)"
console.log(Object.isFrozen(message));  // true — messages cannot be edited after creation
```

### Branded ids

`MessageId`, `MessageCorrelationId` and `MessageCausationId` are *branded* strings: at runtime they are ordinary strings, but TypeScript refuses to accept a plain `string` where one is expected. This stops you from passing a user id where a message id belongs.

`createMessageId()` mints a new id. When the id already exists as a string (from a database row, a log line, a network frame), wrap it with `toMessageId`, `toCorrelationId` or `toCausationId`. All three throw a `TypeError` on an empty or blank string, and `createMessage` throws the same on an empty `type`.

> **Watch out:** `correlationId: "req-abc"` as a bare string is a compile error. Write `correlationId: toCorrelationId("req-abc")`.

## HANDLERS

A *handler* is a function that receives a message and a `MessageContext`, does some work, and returns a value (or a promise of one). Registering a handler is the "subscribe" half of publish/subscribe: you tell the bus "call me for this type".

Several handlers may register for the same type. The bus runs them one after another, lowest `priority` number first (default 100). With one handler, `result.value` is that handler's return value. With several, it is an array of their return values in run order.

This registers two handlers for one type, sends a message, then removes one handler. The payload type annotation on the parameter is what gives you `message.payload.orderId` without a cast.

```ts
import { createMessageBus, type Message } from "@zudojs/messaging";

type OrderPlaced = { orderId: string; total: number };

const bus = createMessageBus();

bus.on("order.placed", async (message: Message<OrderPlaced>) => {
  return `reserved stock for ${message.payload.orderId}`;
}, { id: "reserve-stock", priority: 10 });

bus.on("order.placed", async (message: Message<OrderPlaced>) => {
  return `charged ${message.payload.total}`;
}, { id: "charge-card", priority: 20 });

const result = await bus.send({
  type: "order.placed",
  payload: { orderId: "ord-001", total: 4999 },
});

console.log(result.value);
// ["reserved stock for ord-001", "charged 4999"]
console.log(result.handlerResults.map((r) => r.handlerId));
// ["reserve-stock", "charge-card"]

console.log(bus.off("charge-card"));           // true — it was found and removed
console.log(bus.hasHandlers("order.placed")); // true — reserve-stock is still registered
console.log(bus.handlerCount);                 // 1
```

### Named handler objects

`on()` wraps your function in a `NamedMessageHandler` behind the scenes. Build one yourself with `addHandler()` when a single handler should answer several types, or when you want to ship it disabled. This fragment assumes the `bus` from the example above.

```ts
bus.addHandler({
  id: "audit-log",
  name: "Audit log",
  messageTypes: ["order.placed", "order.cancelled"],
  priority: 1,
  enabled: true,
  handler: async (message) => {
    console.log("audit:", message.type);
  },
});
```

> **Watch out:** Handler ids must be unique across the whole bus. Registering the same id twice throws `DuplicateMessageHandlerError` immediately, unless you created the bus with `allowDuplicateHandlers: true`.

## SENDING AND RESULTS

*Dispatching* is the "publish" half: the bus takes a message, runs middleware, runs the matching handlers, and returns a `DispatchResult`. Two methods do it. `send(input)` builds the message from plain input first. `dispatch(message)` takes a message you already created, for example one from `createDerivedMessage`.

A failing handler does **not** make `dispatch` throw. Instead the result comes back with `success: false` and the problem in `result.error`, wrapped in a `MessageHandlerError` that names the handler. Dispatching to a type with no handlers also succeeds; `value` is an empty array.

This shows both outcomes side by side.

```ts
import { createMessageBus, createMessage, MessageHandlerError } from "@zudojs/messaging";

const bus = createMessageBus();

bus.on("payment.charge", async () => {
  throw new Error("card declined");
}, { id: "charge" });

const failed = await bus.dispatch(createMessage({ type: "payment.charge", payload: {} }));

console.log(failed.success);                               // false
console.log(failed.error instanceof MessageHandlerError);  // true
console.log(failed.error?.message);
// 'Handler "charge" failed: card declined'

const nobody = await bus.send({ type: "nobody.listens", payload: {} });

console.log(nobody.success, nobody.value); // true []
console.log(nobody.duration >= 0);          // true — every result carries its duration in ms
```

### What does throw

Only two things reject the promise instead of returning a result: using a bus after `dispose()` throws `MessageBusDisposedError`, and passing a `signal` that is already aborted throws `MessageDispatchAbortedError`. (`send()` with an empty `type` also rejects, with the `TypeError` from `createMessage`.) Wrap those calls in `try`/`catch` if they can happen in your code.

### Timeouts and cancellation

Pass `{ timeout: 5000 }` to one dispatch, or `defaultTimeout` to `createMessageBus`, and the bus starts a timer that aborts an `AbortSignal`. You can also pass your own `signal`. Handlers that have not started yet are skipped and the result fails with a bare `MessageDispatchAbortedError` as `result.error` (not wrapped in a `MessageHandlerError`).

> **Watch out:** A handler that is already running is not interrupted. Long handlers should check `context.signal.aborted` between steps and stop themselves. A timed-out dispatch comes back with `result.error instanceof MessageTimeoutError`.

## MIDDLEWARE

*Middleware* is a function that runs around every dispatch. It receives a context and a `next` function; calling `next()` continues to the following middleware and finally to the handlers. Whatever `next()` resolves to becomes `result.value`, so you can log, time, or even replace the answer in one place.

Register bus-wide middleware with `bus.use()` or the `middleware` option of `createMessageBus`. Middleware for one dispatch only goes in `DispatchOptions.middleware` and runs after the bus-wide ones. Order is registration order.

This logs when each message starts and how long it took.

```ts
import { createMessageBus } from "@zudojs/messaging";

const bus = createMessageBus();

bus.use(async (ctx, next) => {
  const started = performance.now();
  console.log(`→ ${ctx.message.type} [${ctx.context.correlationId}]`);
  try {
    return await next();
  } finally {
    console.log(`← ${ctx.message.type} in ${(performance.now() - started).toFixed(1)}ms`);
  }
});

bus.on("ping", async () => "pong", { id: "ping" });

const result = await bus.send({ type: "ping", payload: null });
console.log(result.value); // "pong"
```

What you should see: `→ ping [msg:…]`, then `← ping in 0.2ms`, then `pong`. The correlation id defaults to the message id because none was set.

The middleware context (`MessageMiddlewareContext`) exposes `message`, the dispatch `context`, the abort `signal`, an `executionId`, and a shared `state` Map you can use to pass values between middleware. A middleware can also be an object with a `handle` method.

> **Watch out:** If middleware throws, the dispatch result is `success: false` and `result.error` is exactly what you threw (not wrapped). Calling `next()` twice throws `MiddlewareNextCalledMultipleTimesError` (from `@zudojs/errors`, a `MiddlewareError`); the pipeline is `compose` from `@zudojs/middleware`. The `priority` option on `use()` is accepted but not applied yet; order is registration order.

## CONTEXT, CORRELATION AND CAUSATION

Every handler receives a `MessageContext` as its second argument. It holds the `message`, a `correlationId`, a `causationId`, an abort `signal`, a `state` Map and `startedAt`.

A *correlation id* is a label shared by every message that belongs to one bigger operation, such as one HTTP request. A *causation id* is the id of the single message that directly caused this one. Together they let you trace "why did this happen?" through a chain of messages. If you set neither, both default to the message's own id.

`createDerivedMessage` builds a follow-up message that inherits the parent's correlation id and records the parent as its cause.

```ts
import { createMessage, createDerivedMessage, toCorrelationId } from "@zudojs/messaging";

const placed = createMessage({
  type: "order.placed",
  payload: { orderId: "ord-001" },
  correlationId: toCorrelationId("req-abc"),
});

const paid = createDerivedMessage(placed, {
  type: "order.paid",
  payload: { orderId: "ord-001" },
});

console.log(paid.correlationId);              // "req-abc" — inherited
console.log(paid.causationId === placed.id);  // true — placed caused paid
```

Inside a handler, read the ids from the context. This handler dispatches a follow-up on the same bus, keeping the chain intact.

```ts
import { createMessageBus, createDerivedMessage } from "@zudojs/messaging";

const bus = createMessageBus();

bus.on("order.placed", async (message, context) => {
  console.log("correlation:", context.correlationId);
  await bus.dispatch(createDerivedMessage(message, { type: "order.paid", payload: message.payload }));
}, { id: "take-payment" });

bus.on("order.paid", async (message, context) => {
  console.log("caused by:", context.causationId);
}, { id: "ship-order" });

await bus.send({ type: "order.placed", payload: { orderId: "ord-001" } });
// correlation: msg:…  (the order.placed id, since none was set)
// caused by:   msg:…  (the same id — order.placed caused order.paid)
```

> **In plain words:** Handlers receive the same context as middleware: `DispatchOptions.context` headers, state and id overrides, plus anything middleware put into `context.state`.

## MESSAGING VS EVENTS

Both packages route named objects to registered functions inside one process, and neither depends on the other. The difference is intent. A *message* here is a request that expects an answer: the sender awaits `result.value`. An *event* in [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) is a fact that already happened; the publisher does not want a return value, only that listeners are told.

| Question | @zudojs/messaging | @zudojs/events |
| --- | --- | --- |
| Unit | `Message` with a `type` | `Event` with a `type` |
| Sending | `bus.send()` / `bus.dispatch()` | `bus.publish()` / `bus.emit()` |
| Return value | Handler results come back in `result.value` | Handlers return nothing useful; you get an emit result |
| Listening | `on()`, `addHandler()` | `on()`, `once()`, `onAny()` |
| When one listener fails | Dispatch stops; `success: false` | Configurable: stop, or continue and report |
| Lifecycle | `dispose()` only | `start()` / `stop()`, event registration |

Rule of thumb: "please do X and tell me the outcome" is a message; "X happened" is an event. [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) goes one step further and splits messages into commands (change something) and queries (read something).

## LOWER-LEVEL PIECES

`createMessageBus` is enough for almost everything. The parts it is built from are exported too, for people writing their own bus on top of this package:

- `HandlerRegistryStore` keeps the handlers. `register()`, `unregister()`, `resolve(type)` (sorted by priority, disabled handlers left out), `get()`, `has()`, `getHandlerIds()`, `getRegisteredTypes()`, `size`, `clear()`.
- `createDispatcher(registry?)` returns a `Dispatcher` (class `DefaultDispatcher`) that runs middleware and handlers for one message. The bus adds timeouts, `on()`/`off()` and the disposed flag on top.
- `runMessagePipeline(middleware, handler, message, options?)` runs a middleware chain around any async function and returns `{ result, executions, duration }`.
- `createMessageContext(message, options?)` and `resolveMessageHandler(handlerLike)` are the small helpers the dispatcher uses internally.

This wires a registry and dispatcher by hand, which is exactly what `createMessageBus` does for you.

```ts
import { HandlerRegistryStore, createDispatcher, createMessage } from "@zudojs/messaging";

const registry = new HandlerRegistryStore();
registry.register({
  id: "greet",
  name: "Greeter",
  messageTypes: ["greet"],
  handler: async (message) => `hello ${message.payload}`,
});

const dispatcher = createDispatcher(registry);
const result = await dispatcher.dispatch(createMessage({ type: "greet", payload: "Ada" }));

console.log(result.value);                    // "hello Ada"
console.log(registry.getRegisteredTypes()); // ["greet"]
```

> **Not implemented yet:** `Dispatcher.removeMiddleware()` always returns `false`, and the registry options `allowMultipleHandlers` and `requireTypeRegistration` are stored but not enforced.

## API REFERENCE

Everything below is exported from `@zudojs/messaging`.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createMessageBus(options?)` | Creates an in-memory `MessageBus`. | Options: `allowDuplicateHandlers`, `allowMultipleHandlers`, `middleware`, `defaultTimeout`. |
| `createMessage(input)` | Builds a frozen `Message`; fills `id` and `timestamp`. | Throws `TypeError` on empty `type`. |
| `createDerivedMessage(parent, input)` | Builds a follow-up message that inherits correlation and records causation. | Explicit ids in `input` win. |
| `createMessageId()` | Mints a new random `MessageId`. | Format `msg:<uuid>`. |
| `toMessageId(s)`, `toCorrelationId(s)`, `toCausationId(s)` | Brand an existing string as an id. | Throw `TypeError` on blank input. |
| `isMessage(value)` | Type guard: does this look like a `Message`? | Checks `id`, `type`, `timestamp`, `payload`. |
| `getMessageType(m)`, `getMessagePayload(m)`, `describeMessage(m)` | Small accessors. | `describeMessage` returns `"type (id)"`. |
| `createMessageContext(message, options?)` | Builds a `MessageContext`. | Ids fall back to the message id. |
| `createDispatcher(registry?)` | Creates a `Dispatcher`. | Makes its own registry if none given. |
| `runMessagePipeline(middleware, handler, message, options?)` | Runs a middleware chain around a function. | Returns `{ result, executions, duration }`. |
| `resolveMessageHandler(h)` | Turns a function or `{ handle }` object into a function. |  |
| `isMessageError(e)`, `toMessageError(e)`, `createMessageError()`, `createMessageHandlerError()` | Error helpers re-exported from `@zudojs/errors`. | See that package's page. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `InMemoryMessageBus` | The bus `createMessageBus` returns. | Methods: `send`, `dispatch`, `on`, `addHandler`, `off`, `use`, `hasHandlers`, `dispose`; getters `handlerCount`, `disposed`. |
| `HandlerRegistryStore` | In-memory store of named handlers. | See [Lower-level pieces](#lower-level). |
| `DefaultDispatcher` | Runs middleware and handlers for one message. | Also has `getRegistry()` and `dispose()`. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `Message<TPayload>`, `MessageInput<TPayload>` | A message, and the input `createMessage` accepts. | Input may omit `id` and `timestamp`. |
| `MessageId`, `MessageCorrelationId`, `MessageCausationId` | Branded id strings. | Build with the `to…` helpers. |
| `MessageHandler`, `NamedMessageHandler`, `MessageHandlerLike` | Handler function; handler with id, name, types, priority; either form. | `HandlerResult` and `MessageHandlerFactory` are also exported. |
| `MessageContext`, `MessageContextOptions` | What handlers receive as their second argument. |  |
| `MessageMiddleware`, `MessageMiddlewareLike`, `MessageMiddlewareContext`, `MessageMiddlewareNext` | Middleware function shape and its context. | Pipeline result types: `MessageMiddlewarePipelineResult`, `MessageMiddlewareExecution`. |
| `MessageBus`, `MessageBusOptions` | The bus interface and its options. |  |
| `Dispatcher`, `DispatchOptions`, `DispatchResult`, `HandlerExecutionResult` | Dispatch interface, per-call options, and the result shape. | `DispatchOptions`: `context`, `middleware`, `timeout`, `signal`. |
| `HandlerRegistryOptions`, `RegisteredHandler`, `HandlerQueryOptions` | Registry configuration and lookup types. |  |

### Errors

All error classes live in `@zudojs/errors` and are re-exported here. Only the first four are raised by this package; the rest are exported so your own code and other packages can share one hierarchy.

| Name | What it does | Notes |
| --- | --- | --- |
| `MessageHandlerError` | A handler threw. | Appears in `result.error`; has `handlerId`, `cause`. |
| `DuplicateMessageHandlerError` | Handler id already registered. | Thrown by `on()` / `addHandler()`. |
| `MessageBusDisposedError` | Bus used after `dispose()`. | Rejects the dispatch promise. |
| `MessageDispatchAbortedError` | Signal aborted before or between handlers. | Rejects if aborted up front; otherwise returned as `result.error`. |
| `MessageError`, `MessageDispatchError`, `InvalidMessageError`, `MessageTypeNotFoundError`, `MessageHandlerNotFoundError`, `MessageTimeoutError`, `MessageMiddlewareError`, `MessageValidationError` | Shared hierarchy for messaging errors. | Not thrown by this package itself. |

## COMMON MISTAKES

- **Registering handlers without an `id`** → two registrations in the same millisecond get the same generated id and the second throws `DuplicateMessageHandlerError`. → Always pass an `id` in the options of `on()`.
- **Checking for a thrown error instead of `result.success`** → a failing handler never throws from `send()`, so your `catch` block stays silent and the failure is missed. → Read `result.success` and `result.error` after every dispatch.
- **Passing a plain string as `correlationId`** → TypeScript rejects it because the type is branded. → Wrap it: `toCorrelationId("req-abc")`.
- **Expecting a timeout to stop a running handler** → the timer only aborts a signal; the handler keeps going; the dispatch result carries a `MessageTimeoutError`. → Check `context.signal.aborted` inside long handlers.
- **Expecting `result.value` to always be a single value** → with two or more handlers it is an array in priority order, and with none it is `[]`. → Check `result.handlerResults.length` when the handler count can vary.
- **Using a bus after `dispose()`** → every `send`/`dispatch` rejects with `MessageBusDisposedError` and all handlers are gone. → Dispose once, at shutdown, and check `bus.disposed` if unsure.

## RELATED PACKAGES

- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — announce facts to many listeners with start/stop lifecycle and configurable error handling.
- [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) — commands and queries with their own buses, when you want the read/write split made explicit.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — background jobs with retries and dead-letter handling, when work must outlive the current request.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the error classes this package re-exports, with codes and serialisation.
- [@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md) — a test message bus and fixtures for asserting what was sent.

## COMPLETE EXPORT INDEX

Every name `@zudojs/messaging` exports from its package root at v1.0.2 — **69** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 69 exports**

Classes (15)

`DefaultDispatcher` `DuplicateMessageHandlerError` `HandlerRegistryStore` `InMemoryMessageBus` `InvalidMessageError` `MessageBusDisposedError` `MessageDispatchAbortedError` `MessageDispatchError` `MessageError` `MessageHandlerError` `MessageHandlerNotFoundError` `MessageMiddlewareError` `MessageTimeoutError` `MessageTypeNotFoundError` `MessageValidationError`

Functions (19)

`createDerivedMessage` `createDispatcher` `createMessage` `createMessageBus` `createMessageContext` `createMessageError` `createMessageHandlerError` `createMessageId` `describeMessage` `getMessagePayload` `getMessageType` `isMessage` `isMessageError` `resolveMessageHandler` `runMessagePipeline` `toCausationId` `toCorrelationId` `toMessageError` `toMessageId`

Interfaces (22)

`Dispatcher` `DispatchOptions` `DispatchResult` `HandlerExecutionResult` `HandlerQueryOptions` `HandlerRegistryOptions` `HandlerResult` `Message` `MessageBus` `MessageBusOptions` `MessageContext` `MessageContextOptions` `MessageInput` `MessageMiddlewareContext` `MessageMiddlewareExecution` `MessageMiddlewareObject` `MessageMiddlewareOptions` `MessageMiddlewarePipelineOptions` `MessageMiddlewarePipelineResult` `NamedMessageHandler` `RegisteredHandler` `RegisteredMessageMiddleware`

Type aliases (13)

`MessageCausationId` `MessageCorrelationId` `MessageHandler` `MessageHandlerFactory` `MessageHandlerLike` `MessageId` `MessageMiddleware` `MessageMiddlewareLike` `MessageMiddlewareNext` `MessagePayload` `MessageSource` `MessageTimestamp` `MessageType`
