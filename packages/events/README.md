# @zudojs/events

Event-driven architecture with event bus, emitter, middleware, and registry for decoupled communication.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-events](https://zudojs.oyinlola.site/docs/packages-events) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-events.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/events
```

## Quick Start

```typescript
import { createEventBus, defineEvent } from "@zudojs/events";

interface UserCreated {
  readonly id: string;
  readonly name: string;
}

const bus = createEventBus();

const UserCreatedEvent = defineEvent<"user.created", UserCreated>("user.created");

bus.on("user.created", (event) => {
  console.log("New user:", (event.payload as UserCreated).id);
});

// Publish from an event definition …
await bus.publish(UserCreatedEvent.create({ id: "123", name: "Alice" }));

// … or from plain event input.
await bus.publishEvent({
  type: "user.created",
  payload: { id: "124", name: "Bob" },
});
```

`bus.emit()` accepts either a full `Event` or an `EventInput` and behaves like
`publish` / `publishEvent` respectively.

## Features

- Event bus with a middleware pipeline (`use()`, constructor and per-publish middleware)
- Sequential or parallel handler dispatch with `THROW` / `CONTINUE` error modes
- Handler priorities, one-time handlers, per-handler timeouts
- Wildcard subscriptions (`"user.*"`, `"*"`)
- Event registry for typed definitions; handlers registered on the registry are dispatched by the bus
- Deep-frozen events (`freezeEvents`, on by default) so handlers cannot alter what other handlers see: handlers receive a frozen *copy* (`createFrozenEventSnapshot`), so the publisher's own objects are never frozen, and Map, Set and Date values (including `event.timestamp`) become read-only variants that throw on mutation. Class instances are passed by reference.
- A handler unsubscribed by an earlier handler in the same dispatch, or left over after the bus is disposed mid-dispatch, does not run
- Listener-leak warnings (`maxListeners`, reported through `onWarning` or, by default, `process.emitWarning` with type `ZudojsEventsWarning`) and an `onError` hook for fire-and-forget publishes
- Typed error classes from `@zudojs/errors` (`EventHandlerError`, `EventMiddlewareError`, `EventDispatchAbortedError`, …)

## Lifecycle

```
CREATED ──(first use / start)──▶ ACTIVE ◀──(start)── STOPPED
                                   │                     ▲
                                   └──────(stop)─────────┘
                                   ▼
                               DISPOSED
```

- A `CREATED` bus starts itself on the first `publish` / `on`.
- `stop()` moves the bus to `STOPPED`; publishing or subscribing then throws
  `EventBusStoppedError` until `start()` is called. Handlers and definitions are kept.
- `dispose()` is final; every operation throws `EventBusDisposedError`.
- Both errors are defined in `@zudojs/errors` (as `EventError` subclasses) and
  re-exported from `@zudojs/events`, so `instanceof` works whichever package you
  import them from.

## Publish results

```typescript
const result = await bus.publish(event);

result.handled;        // true when at least one handler succeeded
result.handlerCount;   // handlers invoked
result.succeeded;      // handlers that completed
result.failed;         // handlers that threw
result.errors;         // EventHandlerError[] (cause = the raw thrown value)
result.shortCircuited; // true when a middleware did not call next()
```

In the default `CONTINUE` error mode handler failures are collected in
`result.errors` (and forwarded to the `onError` option). In `THROW` mode the first
`EventHandlerError` rejects the publish. Errors thrown by a middleware itself are
wrapped as `EventMiddlewareError`; handler errors and aborts pass through unwrapped.

## Middleware

`bus.use()` accepts everything the `middleware` constructor option does: a
middleware function or `{ handle }` object, or a registered middleware from
`createEventMiddleware()` or a builder helper (`validateEventMiddleware`,
`beforeEvent`, `aroundEvent`, `timingEventMiddleware`, …). It returns a function
that removes the middleware again.

```typescript
const remove = bus.use(validateEventMiddleware((event) => event.payload != null));
```

## Timeouts and aborts

A handler registered with `timeoutMs` fails with `EventTimeoutError` when it
does not settle in time, and the `context.signal` it received is aborted with
that error as its `reason`, so a handler that listens to the signal can stop
its work. Timing out one handler does not abort the dispatch or other handlers.

Pass `signal` to `publish()` to abort a sequential dispatch. The publish rejects
with `EventDispatchAbortedError` (carrying the partial `results` and `errors`)
when the signal is aborted before a handler starts **or while any handler is
running — including the last or only one**, even if that handler then returns
normally. In `PARALLEL` mode every handler has already started, so only a
signal that is aborted before dispatch begins rejects; handlers can still
observe `context.signal`.

## Registry

`bus.register(defineEvent("order.placed"))` records a definition; with
`requireRegistration: true` the bus rejects unregistered types with
`EventTypeNotFoundError`. `bus.unregister(type)` removes only the definition; pass
`{ removeHandlers: true }` to also drop handlers subscribed to exactly that type.

Event types are normalised (trimmed, lower-cased) everywhere, so `"User.Created"`
and `"user.created"` refer to the same event.

## Use Cases

- Decoupling application components
- Audit logging and change tracking
- Real-time notifications
- CQRS event publishing (see `@zudojs/cqrs`)
