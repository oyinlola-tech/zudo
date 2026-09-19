---
title: "Adapters"
description: "Platform-agnostic boundary layer between Zudo and external systems. Adapter pattern, registration, capabilities, transport abstractions, and custom adapter creation."
source: https://zudojs.oyinlola.site/docs/architecture-adapters
---

v1.0.0

# Adapters

The boundary between Zudo and the outside world — mostly contracts you implement, plus one registry that manages them.

CONTRACTS REGISTRY CAPABILITIES

## Overview

An **adapter** is an object that knows how to talk to one thing outside your program — a network socket, a message broker, a file store. Your code talks to the adapter; the adapter talks to the outside.

`@zudojs/adapters` does not connect to anything itself. It defines the shape every adapter must have, and gives you a registry that starts, stops and looks them up.

> READ THIS BEFORE GOING FURTHER
>
>
>
> `@zudojs/adapters` is mostly TypeScript interfaces. It ships **no** Express adapter, Redis adapter, Kafka adapter, S3 adapter or Postgres adapter. The [What Actually Exists](#status) section lists exactly what is code and what is a contract.

Install:

```bash
$ npm install @zudojs/adapters
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## What Actually Exists

Every file under `packages/adapters/src` ending in `.type.ts` is types only — it disappears when TypeScript compiles. Here is the split.

| Export | Kind | Status |
| --- | --- | --- |
| `AdapterRegistry` | Class | Real code you can run |
| `createHealthyHealth`, `createDegradedHealth`, `createUnhealthyHealth` | Functions | Real code you can run |
| `createMockAdapter`, `createMockAdapterRegistry`, `createMockHealth` | Functions | Real code, for tests |
| `AdapterError` and the ten related error classes | Classes | Real, re-exported from `@zudojs/errors` |
| `Adapter`, `AdapterCapabilities`, `AdapterMetadata`, `LifecycleAdapter` | Interfaces | Contract only — you write the implementation |
| `HTTPAdapter`, `MessageAdapter`, `StorageAdapter`, `QueueAdapter` | Interfaces | Contract only — no implementation ships |
| `RuntimeAdapter`, `WebSocketAdapter`, `CLIAdapter`, `SchedulerAdapter` | Interfaces | Contract only — no implementation ships |

> NOT IMPLEMENTED YET
>
>
>
> The eight transport interfaces above have zero implementations anywhere in the framework. If you need HTTP over Express, messaging over Kafka, or storage on S3, you write that adapter yourself against the interface.

One working server adapter does ship, but it lives elsewhere: `createNodeHttpAdapter` in [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md). It runs a real Node HTTP server.

It does *not* implement the `HTTPAdapter` interface from this package. `@zudojs/http` does not depend on `@zudojs/adapters` at all; it has its own `HttpAdapter` contract and its own `BaseHttpAdapter` class. The [bridging example](#bridging) below shows how to put the two together when you want both.

`@zudojs/http` also ships helpers for the Web-standard `Request` and `Response` objects — `createFetchRequestContext`, `FetchHttpResponseWriter` and friends. Those translate between formats; they are not a server, so nothing in the framework listens on an edge or serverless platform today.

## The Adapter Contract

Every adapter is an object with a `name`, a `capabilities` object, and up to four optional lifecycle methods.

```ts
interface Adapter {
  readonly name: string;
  readonly version?: string;
  readonly capabilities: AdapterCapabilities;
  readonly metadata?: AdapterMetadata;

  initialize?(): Promise<void> | void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
```

The four methods split into two pairs. `initialize` prepares resources without doing work and `start` begins listening or consuming; `stop` ceases work but keeps resources and `dispose` releases them for good.

`LifecycleAdapter` extends `Adapter` with two more optional methods: `configure(options)` and `health()`. Implement it when you want the registry's consumers to be able to ask how you are doing.

## Capabilities

A **capability** is a boolean flag saying "I can do this". Not every platform can do everything — a serverless function cannot hold a long-running WebSocket — so an adapter declares what it supports and calling code checks before relying on it.

`AdapterCapabilities` has exactly twelve fields, all optional booleans:

```ts
http              // handles HTTP request/response
websocket         // holds WebSocket connections
streaming         // streams request and response bodies
filesystem        // reads and writes files
tcp               // raw TCP connections
udp               // UDP datagrams
backgroundTasks   // runs work after the response
longRunning       // survives as a long-lived process
edgeRuntime       // runs on an edge platform
serverless        // runs as a serverless function
gracefulShutdown  // can drain before stopping
abortSignal       // honours AbortSignal cancellation
```

> WATCH OUT
>
>
>
> The registry checks for `=== true`. A capability left out is treated as unsupported, which is the safe default — but it also means a typo such as `webSocket` silently reports "not supported" forever.

## The Registry

`AdapterRegistry` is the one piece of running code in the package. It keeps adapters by name, brings them all up or down together, and answers capability questions.

Names are normalized — trimmed and lowercased — so `"Node-HTTP"` and `"node-http"` are the same adapter. A blank name is rejected with `AdapterConfigurationError`.

A complete, runnable example:

```ts
import { AdapterRegistry } from "@zudojs/adapters";
import type { Adapter } from "@zudojs/adapters";

const clock: Adapter = {
  name: "clock",
  version: "1.0.0",
  capabilities: { backgroundTasks: true, gracefulShutdown: true },
  start: () => console.log("clock started"),
  stop: () => console.log("clock stopped"),
};

const registry = new AdapterRegistry();
registry.register(clock);

await registry.startAll();

console.log(registry.getNames());
console.log(registry.supports("clock", "backgroundTasks"));
console.log(registry.findByCapability("websocket").length);

await registry.disposeAll();
```

What you should see:

```ts
clock started
[ 'clock' ]
true
0
clock stopped
```

The methods worth knowing:

| Method | What it does | Notes |
| --- | --- | --- |
| `register(adapter)` | Adds an adapter under its own `name` | Throws `AdapterAlreadyRegisteredError` on a duplicate |
| `get(name)` | Returns the adapter, or `undefined` | Use when absence is normal |
| `require(name)` | Returns the adapter or throws | `AdapterNotFoundError` |
| `has(name)`, `getNames()`, `getAll()`, `size` | Inspect what is registered | Names come back normalized |
| `supports(name, capability)`, `requireCapability(name, capability)` | Check a declared capability; `require` returns the adapter | `false` for an unknown adapter / `AdapterCapabilityMissingError` |
| `findByCapability(capability)` | Every adapter declaring it | Use to pick one that can do the job |
| `initializeAll()`, `startAll()`, `stopAll()` | Run that hook on all of them, in registration order | Collects failures into an `AggregateError` |
| `remove(name)` | Unregisters without cleaning up | You keep responsibility for the resources |
| `removeAndDispose(name)` | Unregisters, then calls `stop` and `dispose` | Prefer this one |
| `clear()`, `disposeAll()` | Empty the registry; `disposeAll` also releases resources | `clear()` leaks if adapters hold sockets |

> TIP
>
>
>
> Reach for `removeAndDispose` and `disposeAll` rather than `remove` and `clear`. The plain versions forget the adapter but leave its sockets and timers open, and a forgotten adapter is one you can no longer close.

## Health Reports

An `AdapterHealth` is a small record: a `status` of `"healthy"`, `"degraded"` or `"unhealthy"`, a timestamp, and an optional message. Three helpers build one for you.

```ts
import {
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "@zudojs/adapters";
import type { LifecycleAdapter } from "@zudojs/adapters";

let connected = true;

const store: LifecycleAdapter = {
  name: "store",
  capabilities: { filesystem: true },
  health: () =>
    connected
      ? createHealthyHealth()
      : createUnhealthyHealth("disk unreachable"),
};

console.log(store.health?.());
```

That prints something like `{ status: 'healthy', timestamp: 1767225600000 }`. Use `createDegradedHealth("slow disk")` for the middle case: still working, but not well.

## Bridging to a Real Server

Because `@zudojs/http` and `@zudojs/adapters` know nothing about each other, you connect them yourself. It takes about ten lines: wrap the HTTP adapter in an object that satisfies `Adapter`.

This is a complete file. It starts a real server through the registry.

```ts
import { AdapterRegistry } from "@zudojs/adapters";
import type { Adapter } from "@zudojs/adapters";
import {
  createNodeHttpAdapter,
  createResponseContext,
} from "@zudojs/http";

const node = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 3000,
  handler: () => createResponseContext().setStatus(200).text("ok"),
});

const web: Adapter = {
  name: "node-http",
  version: "1.0.0",
  capabilities: {
    http: true,
    longRunning: true,
    gracefulShutdown: true,
  },
  start: () => node.start(),
  stop: () => node.stop(),
};

const registry = new AdapterRegistry();
registry.register(web);

await registry.startAll();
console.log("serving on", node.address?.port);

const response = await fetch("http://127.0.0.1:3000/");
console.log(response.status, await response.text());

await registry.disposeAll();
```

What you should see:

```ts
serving on 3000
200 ok
```

The registry now owns the server's lifecycle. `disposeAll()` calls `stop` on the wrapper, which closes the Node server.

## Testing With Fakes

The package ships three helpers so tests do not have to hand-write stub adapters. `createMockAdapter` returns an adapter with every capability set to `false`, which you override as needed.

```ts
import {
  createMockAdapter,
  createMockAdapterRegistry,
} from "@zudojs/adapters";

const fake = createMockAdapter({ name: "fake-http" });

const { registry } = createMockAdapterRegistry([fake]);

console.log(registry.has("fake-http"));
console.log(registry.supports("fake-http", "http"));
```

This prints `true` then `false` — registered, but declaring no capabilities until you give it some.

## Related

- [@zudojs/adapters](https://zudojs.oyinlola.site/docs/packages-adapters.md) — the full export list for this package.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — where the one working server adapter lives.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the source of every `Adapter*Error` class.
- [Runtime](https://zudojs.oyinlola.site/docs/architecture-runtime.md) — how adapter start and stop calls fit into an application's lifecycle.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — reach for it when several adapters must start in a particular order.
