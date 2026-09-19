---
title: "Architecture"
description: "How Zudo's modular, layered architecture enables scalable TypeScript applications. DI container, lifecycle management, module system, and event-driven design."
source: https://zudojs.oyinlola.site/docs/architecture
---

v1.0.0

# Architecture Overview

39 small packages, stacked in six tiers, with dependencies that only ever point downward.

39 PACKAGES SIX TIERS NO CYCLES

## Overview

Zudo is not one big library. It is 39 separate npm packages under the `@zudojs` name, and you install only the ones you use.

Each package owns one job. `@zudojs/errors` owns error classes. `@zudojs/container` owns dependency lookup. `@zudojs/http` owns HTTP. Nothing tries to own two jobs at once.

The packages are arranged in tiers. A package may import from packages below it, never from packages above it. That single rule is what keeps the framework from tangling into a knot where nothing can be understood, tested, or replaced on its own.

> IN PLAIN WORDS
>
>
>
> A **tier** is a shelf. Packages on a higher shelf can reach down to lower shelves. They can never reach up. Because of that, you can always start reading at the bottom and work upward.

Three packages carry most of the weight in a normal application:

- **[@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md)** — defines a module, wires an application together, and runs it. This is the package you import first.
- **[@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md)** — turns an incoming network request into an object you can read, and your reply into bytes on the wire.
- **[@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md)** — hands out shared objects (a database client, a mailer) by name, so code does not have to construct them itself.

## The Six Tiers

A package's tier is decided by its longest chain of `@zudojs` dependencies. Tier 0 packages depend on no other Zudo package at all. A tier 3 package sits three steps above the bottom.

These lists come from the `dependencies` and `peerDependencies` fields in each package's own `package.json`, so they are checkable rather than aspirational.

```ts
TIER 5  auth
         depends on permissions, which depends on http
       ▲
TIER 4  permissions · tenancy · testing
         glue packages that sit on top of http
       ▲
TIER 3  adapters · api · cache · cli · cqrs
         http · queue · rpc · runtime · storage
         transports and application services
       ▲
TIER 2  core · crypto · events · lifecycle · messaging
         plugins · scheduler · schema · security · serialization
         framework machinery
       ▲
TIER 1  config · constants · container · database · docs
         feature-flags · logger · middleware · observability
         openapi · transactions · validation
         single-purpose building blocks
       ▲
TIER 0  errors · types · auth-oauth
         no @zudojs dependencies whatsoever
```

Two details in that diagram surprise people, so they are worth saying out loud.

- `@zudojs/core` is a tier 2 package, not a top-level one. It depends on `errors` and `constants` and nothing else. `http`, `runtime` and `cli` all sit *above* it.
- `@zudojs/auth-oauth` is at tier 0 with `errors` and `types`. It uses Node built-ins only and pulls in no Zudo package, so you can install it by itself.

> TIP
>
>
>
> Tiers are a consequence of the code, not a label attached to it. If you add a dependency, the tier moves. The [Dependency Direction](https://zudojs.oyinlola.site/docs/architecture-dependency-direction.md) page shows how to recompute the whole table yourself.

## Four Principles

### 1. Dependencies point down, never up

No package imports a package above it, and no two packages import each other. The dependency graph has no cycles, which is why every package can be built and tested on its own.

### 2. Everything has an explicit lifecycle

A module is started and stopped through named hooks, in dependency order, and stopped in reverse. Nothing starts itself as a side effect of being imported.

### 3. Shared objects come from a container

Code asks the container for what it needs instead of constructing it. In a test you register a fake under the same name and the code under test never notices.

### 4. The outside world is reached through adapters

Framework code talks to an interface, and an adapter translates that interface into a real platform call. See [Adapters](https://zudojs.oyinlola.site/docs/architecture-adapters.md) for what is a contract and what is a working implementation today.

## How an Application Starts

A Zudo application is a list of modules plus a runtime that walks them through their hooks. You describe the modules; `createApplication` builds the container, the configuration manager, the logger and the runtime around them.

The example below is a complete file. It defines one module, builds an application from it, starts it, and stops it.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module, ModuleContext } from "@zudojs/core";

// A module is a plain object with an id, a name, and optional hooks.
function createGreeter(): Module {
  return {
    id: "greeter",
    name: "greeter",
    onInitialize(context: ModuleContext) {
      console.log(`initialising ${context.name}`);
    },
    onReady() {
      console.log("greeter is ready");
    },
    onShutdown() {
      console.log("greeter is stopping");
    },
  };
}

// defineModule freezes a description of the module. It does not build one yet.
const greeter = defineModule({
  id: "greeter",
  name: "greeter",
  factory: createGreeter,
});

const app = await createApplication({ modules: [greeter] });

await app.start();
console.log(app.state);

await app.stop();
console.log(app.state);
```

What you should see, in this order:

```ts
initialising greeter
greeter is ready
running
greeter is stopping
stopped
```

Note the two-step shape. `defineModule` stores a *description* — an id, a name, and a `factory` function. The runtime calls that factory later, which is what lets an application be stopped and started again with fresh module instances.

> WATCH OUT
>
>
>
> The hooks are named `onInitialize`, `onReady`, `onShutdown` and `onDestroy`. Methods called `initialize`, `start`, `stop` or `destroy` on a module are simply never called.

## How a Request Flows

HTTP lives in a separate package, `@zudojs/http`. It gives you an *adapter* that owns the socket, and a *response context* that you build up and return.

The path a request takes is short: the adapter accepts the connection, wraps it in a request object, calls your handler, and writes whatever response context the handler returns.

```ts
  browser
     │  GET /hello
     ▼
  createNodeHttpAdapter  — owns the Node server and the socket
     │
     ▼
  your handler(request)  — plain function, returns a response context
     │
     ▼
  createResponseContext()  — status, headers, body
     │
     ▼
  bytes on the wire
```

This is a complete, runnable file. It starts a server on port 3000 and answers every request with JSON.

```ts
import {
  createNodeHttpAdapter,
  createResponseContext,
} from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 3000,
  handler: () =>
    createResponseContext().setStatus(200).json({ hello: "world" }),
});

await adapter.start();

console.log(`listening on port ${adapter.address?.port}`);
```

It prints `listening on port 3000`. Visit `http://127.0.0.1:3000/` and you get back `{"hello":"world"}` with a `content-type` of `application/json`, which the response context works out from the body for you.

> TIP
>
>
>
> Pass `port: 0` and the operating system picks a free port. Read the real one back from `adapter.address`. This is how the framework's own tests avoid clashing with whatever else is running on your machine.

Call `await adapter.stop()` to shut the server down. In a real application you would put that call in a module's `onShutdown` hook, so the runtime closes the server as part of an orderly stop.

## Where To Go Next

[### Module System →

What a module is, how `defineModule` works, and which hooks run when.](https://zudojs.oyinlola.site/docs/architecture-module-system.md) [### Runtime →

The state machine behind startup and shutdown, plus signal handling.](https://zudojs.oyinlola.site/docs/architecture-runtime.md) [### Adapters →

The boundary to the outside world, and an honest list of what exists today.](https://zudojs.oyinlola.site/docs/architecture-adapters.md) [### Dependency Direction →

The full 39-package graph and a script that verifies it.](https://zudojs.oyinlola.site/docs/architecture-dependency-direction.md)

Package references for the packages named on this page:

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — modules, application, container, configuration, logging.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — requests, responses, routing, the Node adapter.
- [@zudojs/runtime](https://zudojs.oyinlola.site/docs/packages-runtime.md) — the standalone runtime with readiness and health checks.
- [@zudojs/adapters](https://zudojs.oyinlola.site/docs/packages-adapters.md) — adapter contracts, registry, capabilities.
- [All 39 packages](https://zudojs.oyinlola.site/docs/packages.md) — the complete index.
