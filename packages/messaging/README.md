# @zudojs/messaging

In-process message bus infrastructure with handlers, middleware, and publish/subscribe patterns.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-messaging](https://zudojs.oyinlola.site/docs/packages-messaging) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-messaging.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/messaging
```

## Quick Start

```typescript
import { createMessageBus } from "@zudojs/messaging";

const bus = createMessageBus();

bus.on("user.created", (message) => {
  console.log("New user:", message.payload);
});

await bus.send({
  type: "user.created",
  payload: { id: "123" },
});

bus.dispose();
```

Use `send` to build and dispatch a message from plain input, or
`dispatch` when you already hold a `Message`. Both run the middleware
pipeline before reaching handlers. A disposed bus rejects further use
with `MessageBusDisposedError`.

## Message identifiers

`MessageId`, `MessageCorrelationId` and `MessageCausationId` are branded
types, so a plain string from a transport frame or a database row is not
one. `createMessageId()` mints a new identifier; `toMessageId`,
`toCorrelationId` and `toCausationId` brand an existing string, rejecting
blank values:

```typescript
import { createMessage, toMessageId, toCorrelationId } from "@zudojs/messaging";

const message = createMessage({
  id: toMessageId(frame.id),
  type: frame.type,
  payload: frame.payload,
  correlationId: toCorrelationId(frame.correlationId),
});
```

## Middleware

`use` returns the id `removeMiddleware` takes, so middleware can be taken off
again. Middleware runs in ascending `priority` order (default 100), with
registration order breaking ties:

```typescript
const id = bus.use(logging, { id: "logging", priority: 10 });
bus.use(validation, { priority: 20 });

bus.removeMiddleware(id); // true
```

`enabled: false` registers middleware without running it.

## Handlers

By default a message type may have many handlers and all of them run. Pass
`allowMultipleHandlers: false` for a command/query bus, where a second handler
for the same type is a wiring mistake and is rejected at registration:

```typescript
const bus = createMessageBus({ allowMultipleHandlers: false });
```

`DispatchResult.handlerResults` records every handler that ran, including the
one that failed, with its real duration.

Handlers receive the dispatch context as their second argument: the
`headers`, `state` and correlation/causation overrides passed through
`DispatchOptions.context`, plus anything a middleware stored in
`context.state`.

`send()` also puts a `correlationId` or `causationId` given in
`options.context` on the message it builds (unless the input carries its
own), so `createDerivedMessage(message, …)` in a handler stays in the same
chain:

```typescript
bus.on("order.placed", (message) => {
  const next = createDerivedMessage(message, { type: "invoice.requested", payload: {} });
  next.correlationId; // "req-42"
});

await bus.send(
  { type: "order.placed", payload: order },
  { context: { correlationId: toCorrelationId("req-42") } },
);
```

## Cancellation

A dispatch whose `AbortSignal` fires fails with `MessageDispatchAbortedError`
(`success: false`), whenever the abort lands: between handlers, or during the
last or only one — even if that handler ignores the signal and returns
normally. Like a timeout, it settles promptly rather than waiting for a handler
that ignores its signal. `handlerResults` still lists every handler that
finished. Before 1.2.0 an abort during the last handler was reported as
`success: true`.

Cancellation uses only `AbortSignal` and `setTimeout`, so it works in
browsers and other non-Node runtimes. 1.2.0 scheduled the abort with Node's
`setImmediate`, and aborting a dispatch in a browser threw
`ReferenceError: setImmediate is not defined`; later releases do not.

## Timeouts

`timeout` is honoured by the dispatcher itself, so it applies whether you hold
a bus or a dispatcher. On expiry the dispatch context's `AbortSignal` is
aborted — a handler watching it can wind down — and the result carries a
`MessageTimeoutError`:

```typescript
const result = await bus.dispatch(message, { timeout: 5_000 });
if (!result.success && result.error instanceof MessageTimeoutError) {
  // …
}
```

`createMessageBus({ defaultTimeout })` sets the default for every dispatch.

## Features

- Message bus with handler registration and dispatch
- Middleware pipeline with priorities, removal and per-execution telemetry
- Named message handlers with priorities
- Optional single-handler enforcement per message type
- Per-dispatch timeouts that abort the handler through `AbortSignal`
- Correlation and causation tracking
- Branded message identifiers

## Use Cases

- Decoupling application components
- Event-driven workflows
- Plugin communication
- Background task queuing
