---
title: "Lifecycle"
description: "State machine pattern for predictable component lifecycle management with dependency ordering, hooks, and graceful shutdown."
source: https://zudojs.oyinlola.site/docs/concepts-lifecycle
---

v1.0.0

# Lifecycle

State machine for component lifecycle management with hooks and dependency ordering.

LIFECYCLE STATE MACHINE HOOKS

## Overview

A *lifecycle* is the fixed order in which things come up and go down. A database opens before anything queries it, and closes only after everything has stopped querying.

You do not schedule any of this yourself. You write small hooks, say what depends on what, and the framework works out the order — forwards on startup, backwards on shutdown.

Two kinds of thing take part. *Modules* are your features. *Participants* are application-level resources that are not modules, such as an HTTP server that must be listening before, and stop after, everything else.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release. Everything here comes from @zudojs/core.

## The Application Phases

An application walks through a small set of states, readable at any time as app.state.

```ts
created → initializing → initialized → starting → running
running → stopping → stopped → (starting → running again)
any failure → failed
```

| Call | What it does | Afterwards |
| --- | --- | --- |
| `createApplication()` | Wires everything and runs participant `initialize` hooks | State is `initialized` |
| `start()` | Starts participants, then initializes and readies every module | State is `running` |
| `stop()` | Shuts down and destroys modules, then stops participants | State is `stopped`; can start again |
| `shutdown()` | Stops, then disposes the runtime and participants | State is `stopped`; cannot start again |

The difference between stop() and shutdown() matters. After stop() a later start() builds fresh module instances from your factories. After shutdown() the application is finished.

## Module Hooks

A module can implement any of four hooks. Startup runs the first two across all modules; shutdown runs the last two in reverse.

| Hook | When | Order |
| --- | --- | --- |
| `onInitialize(context)` | Startup, first pass | Dependencies before dependents |
| `onReady(context)` | Startup, after every module initialized | Dependencies before dependents |
| `onShutdown(context)` | Shutdown, first pass | Dependents before dependencies |
| `onDestroy(context)` | Shutdown, after every module shut down | Dependents before dependencies |

Two passes exist because some work must wait until the whole application is up. Open a connection in onInitialize; begin consuming a queue in onReady, once everything that will handle those messages is ready.

> **Watch out**
>
> Only these four names are ever called on a module. A method called start or stop on a module is ignored without warning — those names belong to participants, not modules.

## Participants

A *lifecycle participant* is a plain object with a name and any of initialize, start, stop, dispose. Participants wrap around the modules: they start first and stop last.

This complete program records the real order of events for one participant and one module.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const events: string[] = [];

const app = await createApplication({
  logger: { level: "warn" },
  participants: [{
    name: "http",
    start: () => { events.push("http:start"); },
    stop: () => { events.push("http:stop"); },
  }],
  modules: [defineModule({
    id: "users",
    name: "Users",
    factory: (): Module => ({
      id: "users",
      name: "Users",
      onInitialize: () => { events.push("users:initialize"); },
      onShutdown: () => { events.push("users:shutdown"); },
    }),
  })],
});

await app.start();
await app.shutdown();
console.log(events);
```

**What you should see.** [ 'http:start', 'users:initialize', 'users:shutdown', 'http:stop' ] — the server is up before the module and comes down after it.

The same machinery is available on its own. new Lifecycle(), then register(participant), then initialize(), start(), stop(), dispose(). Stop runs in reverse registration order.

## When a Hook Throws

By default a failing startup hook stops the whole start. Modules that already initialized are rolled back, start() throws a RuntimeError, and app.state becomes failed. That is usually what you want: a half-started service is worse than one that refuses to boot.

When a single non-essential module should not take the service down, turn the flag on and read the report instead.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const app = await createApplication({
  logger: { level: "fatal" },
  runtime: { mode: "test", startup: { continueOnStartError: true } },
  autoStart: true,
  modules: [defineModule({
    id: "metrics",
    name: "Metrics",
    factory: (): Module => ({
      id: "metrics",
      name: "Metrics",
      onReady: () => { throw new Error("exporter unreachable"); },
    }),
  })],
});

const report = app.applicationRuntime!.getStatus().bootstrap!;
console.log(app.state, report.success);      // "running" false
console.log(report.errors[0]?.moduleName);    // "metrics" (the module id)
await app.shutdown();
```

**What you should see.** running false, then metrics. The application is up; the failure is recorded rather than fatal.

| Runtime option | What it changes | Default |
| --- | --- | --- |
| `startup.continueOnInitializeError` | Keep starting when `onInitialize` throws | `false` |
| `startup.continueOnStartError` | Keep starting when `onReady` throws | `false` |
| `shutdown.continueOnStopError`, `continueOnDestroyError` | Keep shutting down past a failing module | `false` |
| `startup.timeoutMs`, `shutdown.timeoutMs` | Give up with `RuntimeTimeoutError`; `0` means no limit | `0`, `30000` |
| `signals.handleSigint`, `handleSigterm` | Stop gracefully when the OS asks the process to quit | `true` |

> **Tip**
>
> Signal handling is what makes a container restart graceful. Leave handleSigterm on in production, and use mode: "test" in tests so parallel runs do not fight over process signals.

## Related

- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — a standalone orchestrator for resources that are not modules, with dependsOn, per-component timeouts and retries.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for Lifecycle, the runtime states and every runtime option.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — where the four hooks are written.
- [Application](https://zudojs.oyinlola.site/docs/concepts.md) — the object that drives all of this.
