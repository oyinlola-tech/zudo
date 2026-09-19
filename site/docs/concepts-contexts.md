---
title: "Contexts"
description: "Execution context propagation using AsyncLocalStorage for request-scoped data across async call chains in Zudo applications."
source: https://zudojs.oyinlola.site/docs/concepts-contexts
---

v1.0.0

# Execution Contexts

AsyncLocalStorage-based context propagation across async boundaries.

CONTEXT ASYNCLOCALSTORAGE PROPAGATION

## Overview

An *execution context* is a small read-only record of what is happening right now: one HTTP request, one background job, one message being consumed.

The point is to stop threading the same argument through every function. Without a context, a request id has to be passed from the route handler, into the service, into the repository, into the logger. With one, any of those can simply read it.

Zudo keeps the current context in a ContextStorage, built on Node's AsyncLocalStorage. Anything called inside run() can read it, even after an await.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release. Contexts live in @zudojs/core.

## What Is in a Context

createExecutionContext() builds one. Every field is optional except the two it fills in for you, and the whole object is frozen — you never change a context, you make a new one.

| Field | What it holds |
| --- | --- |
| `executionId` | A unique id for this execution; generated when you omit it |
| `startedAt` | When it began; defaults to now |
| `correlationId`, `traceId`, `spanId` | Ids that tie related work together across services |
| `principalId`, `authenticationScheme` | Who is doing this, and how they proved it |
| `service`, `module`, `operation` | Which service, module and operation is running |
| `transport` | Where it came from: `"http"`, `"rpc"`, `"messaging"`, `"cli"`, … |
| `metadata` | A frozen bag of anything else small and JSON-ish |

getExecutionDuration(context) tells you how long it has been running, in milliseconds.

## Making It Readable Anywhere

getDefaultContextStorage() returns the one storage the whole framework shares. Wrap work in run() and every function it calls can read the context with get() or require().

This is a complete program. saveOrder takes no arguments, yet it knows which operation it belongs to — even after awaiting.

```ts
import { createExecutionContext, getDefaultContextStorage } from "@zudojs/core";

const storage = getDefaultContextStorage();

async function saveOrder(): Promise<void> {
  await Promise.resolve();
  const context = storage.require();
  console.log(context.operation, context.principalId);
}

await storage.run(
  createExecutionContext({ operation: "checkout", principalId: "user-42" }),
  saveOrder,
);

console.log(storage.get());       // undefined
console.log(storage.has());       // false
```

**What you should see.** checkout user-42, then undefined and false — outside run() there is no context at all.

| Method | What it does |
| --- | --- |
| `run(context, fn)` | Runs `fn` with that context current, and returns its result |
| `get()` | The current context, or `undefined` |
| `require()` | The current context, or throws `ExecutionContextNotFoundError` |
| `has()` | Whether a context is currently active |
| `runDerived(overrides, fn)` | Runs `fn` in a copy of the current context with fields changed |
| `runWithoutContext(fn)` | Runs `fn` with no context, for genuinely unrelated work |

A running application already does this for you. The runtime executes every module hook inside a context whose module is that module's id, the default logger stamps the executionId onto each line, and "scoped" container providers resolve once per context.

## Narrowing a Context

Contexts are frozen, so you refine one by making a new one. deriveExecutionContext copies a context with your overrides applied and merges metadata rather than replacing it.

```ts
import {
  createExecutionContext, deriveExecutionContext, withExecutionMetadata,
} from "@zudojs/core";

const request = createExecutionContext({
  operation: "checkout",
  transport: "http",
  metadata: { route: "/orders" },
});

const step = deriveExecutionContext(request, { operation: "charge-card" });
console.log(step.operation, step.transport);          // "charge-card" "http"

const tagged = withExecutionMetadata(step, { attempt: 2 });
console.log(tagged.metadata);                          // { route: "/orders", attempt: 2 }
console.log(request.operation);                       // "checkout" (unchanged)
```

**What you should see.** charge-card http, then the merged metadata, then the original context still saying checkout.

Inside a run() you can do both steps at once with storage.runDerived({ operation: "charge-card" }, fn).

## Carrying Your Own Values

The context's fields are fixed. For your own per-request data — the signed-in user, a tenant, a feature flag set — use ContextValues with typed keys.

A *context key* is a named key that also carries the type of its value, so reading it back is type-safe. ContextValues is immutable: set() returns a new collection.

```ts
import {
  createContextKey, createContextValues,
  createExecutionContext, createContextStorage,
} from "@zudojs/core";

interface User { id: string; email: string; }

const UserKey = createContextKey<User>("current-user");

const storage = createContextStorage();
const values = createContextValues().set(UserKey, {
  id: "user-42",
  email: "ada@example.com",
});

await storage.runWithValues(createExecutionContext(), values, async () => {
  await Promise.resolve();
  console.log(storage.getValues()?.get(UserKey)?.email);   // "ada@example.com"
});

console.log(storage.getValues());                          // undefined
```

**What you should see.** ada@example.com, then undefined.

values.require(key) throws when the value is missing, which is usually better than a silent undefined for something like the current user. createContextStorage() makes an isolated storage — handy in tests so parallel cases cannot see each other's values.

## Crossing Into Background Work

Context follows await, but it does not follow work you hand to a queue, a timer or another process. A *snapshot* bridges that gap: capture the context and its values now, restore them later.

```ts
import {
  createContextStorage, createExecutionContext,
  createContextKey, createContextValues,
} from "@zudojs/core";

const JobKey = createContextKey<number>("job-size");

const storage = createContextStorage();
const values = createContextValues().set(JobKey, 42);

const snapshot = storage.runWithValues(
  createExecutionContext({ operation: "import" }),
  values,
  () => storage.capture(),
);

setTimeout(() => {
  storage.runSnapshot(snapshot, () => {
    console.log(storage.require().operation);          // "import"
    console.log(storage.getValues()?.get(JobKey));   // 42
  });
}, 0);
```

**What you should see.** import, then 42 — printed after the timer fires, long after the original run finished.

capture() outside a running context throws ExecutionContextNotFoundError, so take the snapshot while the work is still in scope.

## Common Mistakes

- **Trying to write to the context.** An ExecutionContext is frozen; there is no set method. Derive a new one, or put the value in ContextValues.
- **Calling require() at module top level.** No context is active there, so it throws ExecutionContextNotFoundError. Read it inside the request or hook.
- **Expecting context inside setTimeout or a queued job.** It is gone. Use capture() and runSnapshot().
- **Mutating the object returned by set()'s caller.** ContextValues.set returns a new collection and leaves the old one alone. Keep the returned value.
- **Storing large objects in metadata.** It is frozen deeply and copied into every derived context. Keep it to small, JSON-ish data.

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for ContextStorage, ContextValues and snapshots.
- [Dependency Injection](https://zudojs.oyinlola.site/docs/concepts-dependency-injection.md) — how "scoped" providers use the current context as their scope.
- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — explicit scopes when you want a boundary that is not an execution context.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — hooks already run inside a context created by the runtime.
