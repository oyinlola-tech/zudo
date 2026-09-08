# @zudojs/messaging

In-process message bus infrastructure with handlers, middleware, and publish/subscribe patterns.

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

## Features

- Message bus with handler registration and dispatch
- Middleware pipeline for messages
- Named message handlers with priorities
- Correlation and causation tracking
- Branded message identifiers

## Use Cases

- Decoupling application components
- Event-driven workflows
- Plugin communication
- Background task queuing
