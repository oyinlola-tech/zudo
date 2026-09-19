---
title: "@zudojs/events — Event Bus Documentation"
description: "Complete documentation for @zudojs/events — the event bus, emitter, middleware, and registry for Zudojs."
source: https://zudojs.oyinlola.site/docs/packages-events
---

v1.1.0

# @zudojs/events

An event bus for Zudojs: publish a message once, and every handler that asked for it gets called, with optional middleware in between.

EVENT BUS MIDDLEWARE PUB/SUB

## OVERVIEW

When something happens in your program, other parts of it often need to react. A user signs up, so you send a welcome email, write an audit log line, and update a counter. Without help, the sign-up code has to know about all three, and every new reaction means editing it again.

`@zudojs/events` separates the two sides. The sign-up code *publishes* an **event**, a small object that says "user.created happened, here are the details". Any number of **handlers** (plain functions) can ask to be called when that kind of event appears. The publisher never learns who is listening.

The object that connects the two is the **event bus**. Think of it as a notice board: one person pins a notice, and everyone who cares about that topic reads it.

WHEN YOU NEED IT

- Several parts of the app must react to the same thing.
- You want to add reactions later without editing the code that triggers them.
- You need logging, timing or validation applied to every event in one place.

WHEN YOU DON'T

- One function calls one other function. A direct call is simpler.
- You need a reply value. Events are one-way; use [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) operations instead.
- The message must reach another process or server. This bus is in-memory; see [@zudojs/messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md).

## INSTALLATION

Install the package. It pulls in `@zudojs/errors` and `@zudojs/constants` on its own.

```bash
$ npm install @zudojs/events
```

> **Note**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

The package is ES modules only and needs Node 24 or newer. Every example below is a complete file you can save and run.

## QUICK START

This creates a bus, attaches one handler, publishes one event, and prints what happened.

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();

// 1. A handler: a function the bus calls when a matching event is published.
bus.on("user.created", (event) => {
  console.log("Got event:", event.type, event.payload);
});

// 2. Publish. The bus builds the event object and calls every matching handler.
const result = await bus.publishEvent({
  type: "user.created",
  payload: { name: "Alice" },
});

console.log("handled:", result.handled, "handlers:", result.handlerCount);
```

What you should see:

```ts
Got event: user.created { name: 'Alice' }
handled: true handlers: 1
```

`publishEvent()` returns a promise, so you `await` it. It resolves after every handler has finished, and the result tells you how many ran and whether any succeeded.

## EVENTS

An **event** is a frozen object that records one thing that happened. It always has a `type` (a name like `"user.created"`), a `payload` (the details, any value you like), an `id`, and a `timestamp`. Frozen means nobody can change it after it is created, so every handler sees the same data.

You build one with `createEvent()`. Only `type` and `payload` are required; the id and timestamp are filled in for you.

```ts
import { createEvent } from "@zudojs/events";

const event = createEvent({
  type: "Order.Placed",
  payload: { orderId: "o-1", total: 42 },
});

console.log(event.type);                  // order.placed
console.log(event.id.startsWith("event:")); // true
console.log(event.timestamp instanceof Date); // true
console.log(Object.isFrozen(event));       // true
```

### Event type names

The type is normalized before use: trimmed, lower-cased, and slashes or colons turned into dots. That is why `"Order.Placed"` printed as `order.placed`. Names may contain lowercase letters, digits, underscores, dashes and dots. Anything else makes `createEvent()` throw `InvalidEventError`.

Use the dots to build namespaces. `user.created`, `user.deleted` and `user.profile.updated` all live under `user`, and handlers can subscribe to the whole namespace with a **pattern**. Three pattern forms exist:

| Pattern | Matches |
| --- | --- |
| user.created | Exactly that type. |
| user.* | user, user.created, user.profile.updated, anything under the namespace. |
| * | Every event. |

A wildcard anywhere else (`user.*.created`) is rejected. The functions `matchesEventType(type, pattern)` and `normalizeEventType(type)` are exported if you want to test names yourself.

### Typed events with defineEvent()

Writing `{ type: "user.created", payload }` objects by hand in many places invites typos. `defineEvent()` gives you a reusable **definition**: an object that knows the type name and the payload shape, with a `create()` method that builds events of that kind.

```ts
import { defineEvent } from "@zudojs/events";

interface UserCreatedPayload {
  readonly id: string;
  readonly email: string;
}

const UserCreated = defineEvent<"user.created", UserCreatedPayload>("user.created");

const event = UserCreated.create({ id: "u-1", email: "alice@example.com" });

console.log(UserCreated.type);  // user.created
console.log(event.payload.email); // alice@example.com  (TypeScript knows the shape)
```

The first type argument is the event name, the second is the payload type. Pass the definition to `bus.register()` if you want the bus to know about it (see [Event registry](#event-registry)).

> **Watch out**
>
> Only the event object itself is frozen by `createEvent()`. The payload is frozen later, by the bus, just before handlers run. If you keep a reference to the payload object and mutate it elsewhere, do that before publishing or clone it first.

## HANDLERS

A **handler** is the function that reacts to an event. The bus calls it with two arguments: the event, and a `context` object with extras such as an `AbortSignal` and any metadata the publisher attached. A handler may be synchronous or return a promise; the bus waits for it either way.

You attach a handler with `bus.on(pattern, handler, options)`. It returns a **subscription**, a small object whose `unsubscribe()` method detaches the handler again.

```ts
import { createEventBus, type Event } from "@zudojs/events";

interface OrderPayload {
  readonly orderId: string;
}

const bus = createEventBus();

// Higher priority runs first. Default priority is 0.
bus.on<Event<OrderPayload>>("order.placed", (event) => {
  console.log("reserve stock for", event.payload.orderId);
}, { id: "reserve-stock", priority: 100 });

// A namespace pattern. Runs for order.placed, order.paid, order.anything.
const audit = bus.on("order.*", (event, context) => {
  console.log("audit:", event.type, "aborted?", context.signal.aborted);
});

// Runs once, then removes itself.
bus.once("order.placed", () => console.log("first order ever!"));

await bus.publishEvent({ type: "order.placed", payload: { orderId: "o-1" } });
await bus.publishEvent({ type: "order.placed", payload: { orderId: "o-2" } });

audit.unsubscribe();
console.log("handlers left:", bus.handlerCount);
```

What you should see:

```ts
reserve stock for o-1
audit: order.placed aborted? false
first order ever!
reserve stock for o-2
audit: order.placed aborted? false
handlers left: 1
```

The type argument `Event<OrderPayload>` tells TypeScript what `event.payload` looks like. Without it the payload is `unknown` and you must narrow it yourself.

### Handler options

| Option | What it does | Default |
| --- | --- | --- |
| id | Name for the handler. Must be unique on the bus; a duplicate throws DuplicateEventHandlerError. | generated |
| priority | Higher numbers run first. Equal priorities keep registration order. | 0 |
| once | Remove the handler before its first run, so it never runs twice. bus.once() sets this for you. | false |
| timeoutMs | If the handler takes longer than this, its run fails with EventTimeoutError. | no timeout |
| enabled | A disabled handler stays registered but is skipped. | true |
| description | Free text, useful when listing handlers. | none |

`bus.onAny(handler)` is shorthand for `bus.on("*", handler)`. `bus.off(subscription)` is the same as `subscription.unsubscribe()` and returns `true` if the subscription was still active. To detach several handlers together, put their subscriptions in a `createEventSubscriptionGroup()` and call `unsubscribe()` on the group.

> **Common mistake**
>
> Changing `event.payload` inside a handler. Handlers receive a deeply frozen copy of the event, so an assignment like `event.payload.total = 0` throws `TypeError: Cannot assign to read only property` in ES modules, and Map/Set/Date values (including `event.timestamp`) throw on mutation. The publisher's own objects are never frozen. Copy the data you need instead.

## EVENT BUS

The **event bus** (`EventBus`) is the object your application talks to. It holds the handlers, runs middleware, dispatches events, and has a lifecycle so you can pause or shut it down cleanly. You create one with `createEventBus(options)`.

### Three ways to publish

- `bus.publishEvent({ type, payload })` builds the event from plain input, then publishes it.
- `bus.publish(event)` publishes an event you already built with `createEvent()` or a definition's `create()`.
- `bus.emit(eventOrInput)` accepts either and picks the right one.

### Reading the result

By default the bus keeps going when a handler throws, and reports the failure in the result instead. This example has one good handler and one that fails.

```ts
import { createEventBus, EventHandlerError } from "@zudojs/events";

const bus = createEventBus();

bus.on("job.done", () => "ok", { id: "good" });
bus.on("job.done", () => {
  throw new Error("disk full");
}, { id: "bad" });

const result = await bus.publishEvent({ type: "job.done", payload: null });

console.log(result.handled, result.succeeded, result.failed); // true 1 1

const failure = result.errors[0];
if (failure instanceof EventHandlerError) {
  console.log(failure.handlerId, "->", (failure.cause as Error).message);
  // bad -> disk full
}
```

| Result field | Meaning |
| --- | --- |
| event | The event that was dispatched. |
| handled | true when at least one handler finished without throwing. |
| handlerCount · succeeded · failed | How many handlers ran, and how they ended. |
| results | Return values of the handlers, in run order. |
| errors | One EventHandlerError per failed handler. handlerId says which; cause is what it threw. |
| shortCircuited | true when a middleware stopped the event before any handler ran. |

### Error mode and error hook

The collect-and-continue behaviour is `EventErrorMode.CONTINUE`. If you would rather have the publish call reject on the first failing handler, use `EventErrorMode.THROW`, either for the whole bus or for one publish call.

```ts
import { createEventBus, EventErrorMode } from "@zudojs/events";

const bus = createEventBus({
  emitter: { errorMode: EventErrorMode.THROW },
  // Called for every failure collected in CONTINUE mode, even when nobody reads the result.
  onError: (error, context) => console.error("event problem:", context.source, error),
});

bus.on("job.done", () => {
  throw new Error("disk full");
});

try {
  await bus.publishEvent({ type: "job.done", payload: null });
} catch (error) {
  console.log("publish rejected:", (error as Error).message);
}
// publish rejected: Event handler "handler:7f3c" failed while processing "job.done".

// Per call: { errorMode: EventErrorMode.CONTINUE } overrides the bus setting.
const result = await bus.publishEvent(
  { type: "job.done", payload: null },
  { errorMode: EventErrorMode.CONTINUE },
);
console.log(result.failed); // 1
```

### Lifecycle

A bus moves through four states: `CREATED`, `ACTIVE`, `STOPPED`, `DISPOSED`. You rarely have to manage this. A new bus starts itself the first time you call `on()` or publish. `createStartedEventBus()` gives you one that is already active.

```ts
import { createEventBus, EventBusState, EventBusStoppedError } from "@zudojs/events";

const bus = createEventBus();
console.log(bus.getState());        // created

bus.on("ping", () => console.log("pong"));
console.log(bus.getState());        // active   (auto-started)

bus.stop();                         // handlers are kept, publishing is refused
try {
  await bus.publishEvent({ type: "ping", payload: null });
} catch (error) {
  console.log(error instanceof EventBusStoppedError); // true
}

bus.start();
await bus.publishEvent({ type: "ping", payload: null }); // pong

bus.dispose();                      // final: every call now throws EventBusDisposedError
console.log(bus.getState() === EventBusState.DISPOSED); // true
```

`bus.subscribe(listener)` lets you watch the bus itself: the listener receives `{ type: "started" | "stopped" | "published", event?, timestamp }`.

> **Tip**
>
> Call `bus.stop()` then `bus.dispose()` when your process shuts down. Stop refuses new work; dispose cancels every subscription so nothing leaks.

## EVENT REGISTRY

The **registry** (`EventRegistry`) is the bus's storage. It keeps two lists: the handlers you attached, and any event *definitions* you registered. Registering a definition is optional. It becomes useful with `requireRegistration: true`, which makes the bus refuse any event type it has not been told about, catching typos at publish time.

```ts
import { createEventBus, defineEvent, EventTypeNotFoundError } from "@zudojs/events";

const UserCreated = defineEvent<"user.created", { id: string }>("user.created");

const bus = createEventBus({ requireRegistration: true });
bus.register(UserCreated);

console.log(bus.hasEvent("user.created"), bus.eventCount); // true 1

const ok = await bus.publish(UserCreated.create({ id: "u-1" }));
console.log(ok.event.type);                                // user.created

try {
  await bus.publishEvent({ type: "user.craeted", payload: {} }); // typo
} catch (error) {
  console.log(error instanceof EventTypeNotFoundError);          // true
}
```

Registering the same type twice throws `DuplicateEventDefinitionError` unless you pass `registry: { allowDuplicateDefinitions: true }`. `bus.unregister(type)` removes a definition; add `{ removeHandlers: true }` to drop the handlers subscribed to exactly that type as well.

> **Common mistake**
>
> Turning on `requireRegistration` and forgetting to call `bus.register()`. Every publish then rejects with `EventTypeNotFoundError`, including the ones from other packages that publish through your bus.

## EVENT EMITTER

The **emitter** (`EventEmitter`) is the engine inside the bus. It does one job: given an event, find the matching handlers and run them. The bus adds middleware, the registry, lifecycle states and the `onError` hook on top. If you need none of those, an emitter alone is lighter.

The emitter also decides *how* handlers run. `EventEmitterMode.SEQUENTIAL` (the default) runs them one after another in priority order. `EventEmitterMode.PARALLEL` starts them all at once and waits for the slowest. The same option is accepted by the bus under `emitter: { mode }` and per publish call.

```ts
import { createEventEmitter, createEvent, EventEmitterMode } from "@zudojs/events";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const emitter = createEventEmitter({ mode: EventEmitterMode.PARALLEL });

emitter.on("report.ready", async () => { await sleep(300); console.log("slow done"); });
emitter.on("report.ready", async () => { await sleep(100); console.log("fast done"); });

const started = Date.now();
const result = await emitter.emit(createEvent({ type: "report.ready", payload: null }));

console.log("took about", Date.now() - started, "ms");
console.log(result.results.map((r) => r.ok));
```

What you should see (the two handlers overlap, so the total is about 300 ms, not 400):

```ts
fast done
slow done
took about 30x ms
[ true, true ]
```

`emitter.emit()` requires a real event object; use `emitter.emitEvent({ type, payload })` for plain input. The result is an `EventEmitResult`: like the bus result, but `results` holds one `{ handlerId, ok, result, duration, error? }` record per handler instead of bare return values.

> **Watch out**
>
> The two defaults differ. A bare emitter uses `EventErrorMode.THROW`, so a failing handler rejects `emit()`. A bus uses `CONTINUE`. Pass `errorMode` explicitly if the difference matters to you.

## MIDDLEWARE

**Middleware** is a function that wraps the dispatch of every published event. It receives a `context` (holding the event) and a `next` function. Whatever it does before calling `next()` happens before the handlers; whatever it does after happens after them. It is the place for logging, timing, validation, and anything else that should apply to all events without repeating it in each handler.

Middleware only exists on the bus, not on a bare emitter. You can add it in three places: bus options, `bus.use()`, or the options of one publish call.

```ts
import { createEventBus, timingEventMiddleware, validateEventMiddleware } from "@zudojs/events";

const bus = createEventBus({
  middleware: [
    // Built-in helpers return ready-made middleware.
    validateEventMiddleware((event) => event.payload !== null, { priority: 100 }),
    timingEventMiddleware((ms, context) => console.log("timing:", context.event.type, ms.toFixed(1), "ms")),
  ],
});

// A hand-written middleware. use() returns a function that removes it again.
const removeLogging = bus.use(async (context, next) => {
  console.log("-> before", context.event.type);
  const result = await next();   // runs the remaining middleware, then the handlers
  console.log("<- after", context.event.type);
  return result;
});

bus.on("file.saved", () => console.log("   handler ran"));

await bus.publishEvent({ type: "file.saved", payload: { path: "/tmp/a" } });

removeLogging();
await bus.publishEvent({ type: "file.saved", payload: { path: "/tmp/b" } });
```

What you should see:

```ts
-> before file.saved
   handler ran
<- after file.saved
timing: file.saved 0.4 ms
   handler ran
timing: file.saved 0.2 ms
```

Middleware runs in descending `priority` order, so the validator (100) wraps everything else. The timing middleware reports after its inner work finishes, which is why its line comes last.

### Built-in helpers

| Function | What it does |
| --- | --- |
| beforeEvent(fn) | Run fn(context) before the handlers, then continue. |
| afterEvent(fn) | Run the handlers, then fn(context, result). |
| aroundEvent(fn) | Same as writing the middleware by hand; fn(context, next). |
| validateEventMiddleware(check) | If check(event) returns false, reject the publish with EventMiddlewareError. |
| timingEventMiddleware(fn) | Call fn(durationMs, context) when dispatch finishes, even if it failed. |
| stateEventMiddleware(key, factory) | Store factory(context) in context.state, a Map shared by the whole pipeline. |
| createEventMiddleware(fn, options) | Wrap any middleware with an id, priority and enabled flag. |

> **In plain words**
>
> If a middleware returns without calling `next()`, nothing further runs and the publish result has `shortCircuited: true` and `handled: false`. If a middleware throws, the publish rejects with `EventMiddlewareError`. Handler failures are never relabelled as middleware errors.

> **Common mistake**
>
> Forgetting to `return` the value of `next()`. The middleware still runs the handlers, but the bus can no longer see their result and reports the publish as short-circuited.

## API REFERENCE

Everything below is importable from `"@zudojs/events"`. Only the exports you call or configure are listed.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createEventBus(options?) | Creates a bus in CREATED state. | Starts itself on first use. |
| createStartedEventBus(options?) | Creates a bus and calls start(). |  |
| createEventEmitter(options?) | Creates a standalone emitter. | Default errorMode is THROW. |
| createEventRegistry(options?) | Creates a standalone registry. | Rarely needed; the bus owns one. |
| createEvent(input) | Builds a frozen event from { type, payload, ... }. | Throws InvalidEventError on a bad type, id or timestamp. |
| defineEvent<T, P>(type) | Returns a typed definition with create(payload, options?). | Pass to bus.register(). |
| createDerivedEvent(source, input) | Builds a follow-up event that keeps the source's correlationId and sets causationId. | For "this happened because of that" chains. |
| normalizeEventType(type) | Trims, lower-cases and validates a type name. | tryNormalizeEventType returns undefined instead of throwing. |
| matchesEventType(type, pattern) | Tests a type against an exact name, ns.* or *. | Expects normalized input. |
| createEventSubscriptionGroup() | Collects subscriptions to cancel together. | group.add(sub), group.unsubscribe(). |
| beforeEvent · afterEvent · aroundEvent · validateEventMiddleware · timingEventMiddleware · stateEventMiddleware · createEventMiddleware | Middleware builders. | See [Middleware](#middleware). |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| EventBus | Methods: on, once, onAny, off, use, publish, publishEvent, emit, register, unregister, hasEvent, start, stop, dispose, getState, subscribe; properties handlerCount, eventCount. | Prefer the factory functions over new EventBus(). |
| EventEmitter | Methods: on, once, onAny, off, emit, emitEvent, removeAllListeners, dispose; property listenerCount. | No middleware, no lifecycle. |
| EventRegistry | Methods: register, get, has, registerHandler, getHandlers, getHandlersForEvent, clear, dispose. | Reach it with bus.getRegistry(). |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| Event<TPayload> | id, type, payload, timestamp, plus optional source, correlationId, causationId, metadata. | All fields read-only. |
| EventInput<TPayload> | What createEvent / publishEvent accept. Only type and payload are required. | timestamp may be a Date or a number. |
| EventTypePattern | A type name, ns.*, or *. | First argument of on(). |
| EventHandler<TEvent> | (event, context) => unknown \| Promise<unknown>. | An object with a handle() method also works. |
| EventHandlerContext | event, type, eventId, correlationId?, causationId?, signal, metadata. | Second argument of every handler. |
| EventHandlerOptions | id, priority, once, timeoutMs, enabled, description. | Third argument of on(). |
| EventSubscription | id, active, state, unsubscribe(). | Returned by on(). |
| EventBusOptions | emitter: { mode, errorMode, freezeEvents, maxListeners }, registry: { allowDuplicateDefinitions, onDuplicateHandlerId }, requireRegistration, middleware, onWarning, onError. | maxListeners defaults to 100 per pattern; more emits a leak warning (process warning or `onWarning`). |
| PublishOptions | mode, errorMode, signal, metadata, middleware. | Second argument of publish / publishEvent / emit. |
| EventPublishResult | See [Reading the result](#event-bus). |  |
| EventMiddleware | (context, next) => Promise<unknown>. | context.event, context.signal, context.metadata, context.state. |

### Enums and constants

| Name | What it does | Notes |
| --- | --- | --- |
| EventEmitterMode | SEQUENTIAL (default) or PARALLEL. |  |
| EventErrorMode | THROW or CONTINUE. | Bus default CONTINUE; emitter default THROW. |
| EventBusState | CREATED, ACTIVE, STOPPED, DISPOSED. | Returned by bus.getState(). |

### Errors

All extend `EventError` from `@zudojs/errors` and carry `eventType` and `eventId` where known.

| Name | When you see it | Notes |
| --- | --- | --- |
| InvalidEventError | Bad type name, id or timestamp; or a non-event passed to publish(). |  |
| EventHandlerError | A handler threw. | handlerId, cause. |
| EventTimeoutError | A handler exceeded its timeoutMs. | Arrives wrapped in an EventHandlerError. |
| EventMiddlewareError | A middleware threw, or validation failed. | middlewareId. |
| EventDispatchAbortedError | The signal you passed was aborted. | results and errors gathered so far. |
| EventTypeNotFoundError | Publishing an unregistered type with requireRegistration: true. |  |
| DuplicateEventHandlerError · DuplicateEventDefinitionError | Reusing a handler id or registering a type twice. |  |
| EventBusStoppedError · EventBusDisposedError · EventEmitterDisposedError | Using a bus or emitter after stop() / dispose(). |  |

## COMMON MISTAKES

- Not awaiting `publish()`

  Handlers run asynchronously, so the line after `bus.publishEvent(...)` executes before they do, and a rejection becomes an unhandled promise. Always `await` the call, or pass an `onError` option and add `.catch()` if you truly want fire-and-forget.
- Assuming a failed handler throws

  On a bus the default is `CONTINUE`: the publish resolves normally and the failure sits in `result.errors`. Check `result.handled` or `result.failed`, or switch to `EventErrorMode.THROW`.
- Subscribing with a pattern that does not match

  `bus.on("user", ...)` matches only the type `user`, not `user.created`. The result shows `handlerCount: 0` and nothing runs. Use `"user.*"` for the namespace.
- Creating a new bus in every module

  Two buses do not share handlers, so an event published on one never reaches handlers on the other. Create the bus once and pass it around, or register it in your [container](https://zudojs.oyinlola.site/docs/packages-container.md).
- Adding handlers in a loop without removing them

  Each `on()` call adds another handler. After 100 on the same pattern the bus emits a leak warning through `process.emitWarning` (type `ZudojsEventsWarning`), or passes it to `onWarning` if you set one. Keep the subscription and call `unsubscribe()` when the owner goes away.

## RELATED PACKAGES

- [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) — commands, queries and domain events built on top of this bus.
- [@zudojs/messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md) — when the event must leave the process and travel over a broker.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — start and stop the bus alongside the rest of your app.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `EventError` family and its error codes.

## COMPLETE EXPORT INDEX

Every name `@zudojs/events` exports from its package root at v1.1.0 — **207** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 207 exports**

Classes (28)

`DuplicateEventDefinitionError` `DuplicateEventHandlerError` `EventBus` `EventBusDisposedError` `EventBusStoppedError` `EventDefinitionNotFoundError` `EventDeserializationError` `EventDispatchAbortedError` `EventEmitter` `EventEmitterDisposedError` `EventError` `EventHandlerError` `EventHandlerNotFoundError` `EventListenerLimitExceededError` `EventMiddlewareError` `EventPublishError` `EventRegistry` `EventRegistryDisposedError` `EventSerializationError` `EventSubscriptionClosedError` `EventSubscriptionGroup` `EventSubscriptionHandle` `EventTimeoutError` `EventTypeNotFoundError` `FrozenEventDate` `FrozenEventMap` `FrozenEventSet` `InvalidEventError`

Functions (108)

`abortableEventMiddleware` `afterEvent` `aroundEvent` `assertEventType` `beforeEvent` `cloneEventPayload` `createAbortError` `createDerivedEvent` `createEvent` `createEventBus` `createEventEmitter` `createEventError` `createEventHandler` `createEventHandlerContext` `createEventHandlerError` `createEventHandlerId` `createEventId` `createEventMiddleware` `createEventMiddlewareContext` `createEventMiddlewareId` `createEventPayload` `createEventRegistry` `createEventSubscription` `createEventSubscriptionGroup` `createEventSubscriptionId` `createEventType` `createEventTypePattern` `createFrozenEventSnapshot` `createJsonEventPayload` `createObjectEventPayload` `createStartedEventBus` `deepFreeze` `defineEvent` `defineEventType` `defineEventTypes` `definePayloadFactory` `describeEvent` `describeEventPayload` `disableEventHandler` `disableEventMiddleware` `emitParallel` `emitSequential` `enableEventHandler` `enableEventMiddleware` `eventMatchesType` `executeEventHandler` `executeEventMiddleware` `executeEventMiddlewarePipeline` `executeRegisteredEventHandler` `filterEventsByType` `fireAndForgetHandler` `getAllDefinitions` `getAllHandlers` `getEventAction` `getEventNamespace` `getEventPayload` `getEventType` `getEventTypeSegments` `getHandlersForEvent` `getHandlersForType` `getMatchingEventHandlers` `handlerMatchesEvent` `isAbortError` `isChildEventType` `isEvent` `isEventEmitResult` `isEventError` `isEventHandler` `isEventMiddleware` `isEventSubscription` `isFunctionEventHandler` `isFunctionEventMiddleware` `isJsonEventPayload` `isObjectEventHandler` `isObjectEventMiddleware` `isObjectEventPayload` `isPrimitiveEventPayload` `isRegisteredEventMiddleware` `isSameEventNamespace` `isValidEventType` `isValidEventTypePattern` `matchesEventType` `mergeEventPayloads` `normalizeEventType` `normalizeEventTypePattern` `normalizeRegistryEventType` `onceEventHandler` `prioritizedEventHandler` `registryClear` `registryDispose` `registryNotify` `registryRegister` `registryRegisterHandler` `registryUnregister` `registryUnregisterHandler` `setEventHandlerPriority` `sortEventHandlers` `sortEventMiddleware` `stateEventMiddleware` `staticPayload` `stripUndefinedValues` `timingEventMiddleware` `toEventError` `tryNormalizeEventType` `typedEventHandler` `validateEventMiddleware` `validateEventPayload` `withEventMetadata`

Interfaces (36)

`DispatchHooks` `EmitOptions` `EmitterListener` `Event` `EventBusErrorContext` `EventBusEvent` `EventBusOptions` `EventDefinition` `EventDispatchAbortedErrorOptions` `EventEmitResult` `EventEmitterOptions` `EventHandlerContext` `EventHandlerEntry` `EventHandlerExecutionResult` `EventHandlerObject` `EventHandlerOptions` `EventHandlerStore` `EventInput` `EventMiddlewareContext` `EventMiddlewareExecution` `EventMiddlewareObject` `EventMiddlewareOptions` `EventMiddlewarePipelineOptions` `EventMiddlewarePipelineResult` `EventPayloadOptions` `EventPublishResult` `EventRegistryChange` `EventRegistryErrorContext` `EventRegistryOptions` `EventRegistryWarning` `EventSubscription` `EventSubscriptionOptions` `PublishOptions` `RegisteredEventDefinition` `RegisteredEventHandler` `RegisteredEventMiddleware`

Type aliases (29)

`DuplicateHandlerIdPolicy` `EventBusListener` `EventBusMiddlewareItem` `EventCausationId` `EventCorrelationId` `EventHandler` `EventHandlerLike` `EventHandlerResult` `EventId` `EventMiddleware` `EventMiddlewareLike` `EventMiddlewareNext` `EventPayload` `EventPayloadFactory` `EventPayloadMap` `EventRegistryListener` `EventSource` `EventSubscriptionId` `EventTimestamp` `EventType` `EventTypeList` `EventTypeOf` `EventTypePattern` `EventUnion` `JsonEventPayload` `ObjectEventPayload` `PayloadMap` `PayloadOf` `PrimitiveEventPayload`

Constants (1)

`DEFAULT_MAX_HANDLERS_PER_PATTERN`

Enums (5)

`EventBusState` `EventEmitterMode` `EventErrorMode` `EventRegistryChangeType` `EventSubscriptionState`
