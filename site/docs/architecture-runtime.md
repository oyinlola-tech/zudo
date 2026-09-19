---
title: "Runtime"
description: "The application runtime that orchestrates startup, shutdown, and lifecycle management in the Zudo TypeScript framework. Graceful shutdown, signal handling, and state machine."
source: https://zudojs.oyinlola.site/docs/architecture-runtime
---

v1.0.0

# Runtime

The part that actually runs your modules: a small state machine, an ordered start, and a shutdown that waits for work to finish.

STATE MACHINE GRACEFUL STOP SIGNALS

## Overview

The **runtime** is the object that owns your application while it is alive. It loads modules, runs their hooks in order, listens for termination signals, and unwinds everything when it is time to stop.

You rarely build one by hand. `createApplication` from `@zudojs/core` creates a runtime for you and hands you an `Application` wrapped around it.

> TWO RUNTIMES, TWO PACKAGES
>
>
>
> Zudo ships two runtimes and they are not the same object. `@zudojs/core` has the one `createApplication` uses. `@zudojs/runtime` is a separate, standalone package with its own state names and extra readiness and health features. Everything up to the "Standalone Runtime" section below describes the `@zudojs/core` one.

For everything in the next four sections:

```bash
$ npm install @zudojs/core
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## Runtime States

A **state machine** is a rule about which step may follow which. The runtime has six states, and moving to a state that is not allowed from the current one throws `InvalidRuntimeTransitionError` instead of quietly doing something strange.

```ts
  created
     │  start()
     ▼
  bootstrapping  ──── error ────▶  failed
     │                                │
     ▼                                │
  ready                                │
     │  stop()                        │  stop()
     ▼                                ▼
  stopping ─────────────────────▶ stopped
```

| State | What it means |
| --- | --- |
| `created` | Built, nothing has run. This is the only state you can start from. |
| `bootstrapping` | Loading modules and running `onInitialize` then `onReady`. |
| `ready` | Every module is up. The application is serving. |
| `stopping` | Running `onShutdown` then `onDestroy`, in reverse order. |
| `stopped` | Finished. Terminal — this runtime cannot start again. |
| `failed` | Something threw. Terminal, but you can still call `stop()` to clean up. |

The names come from the `RuntimeState` enum, which is exported so you can compare against it rather than typing strings.

```ts
import { createApplication, RuntimeState } from "@zudojs/core";

const app = await createApplication();
await app.start();

console.log(app.applicationRuntime?.state === RuntimeState.READY);
// true

await app.stop();
```

> APPLICATION STATE IS SEPARATE
>
>
>
> `app.state` is not the same value. It is one of `created`, `initializing`, `initialized`, `starting`, `running`, `stopping`, `stopped`, `failed`. The application wraps the runtime, so `running` on the outside corresponds to `ready` on the inside.

## Startup

Startup is four steps: work out the module order, build each module from its factory, run every `onInitialize`, then run every `onReady`. Only after the last `onReady` does the runtime become `ready`.

A complete program that starts, reports, and stops:

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const database = defineModule({
  id: "database",
  name: "Database",
  factory: (): Module => ({
    id: "database",
    name: "Database",
    onInitialize: () => console.log("database connected"),
    onDestroy: () => console.log("database closed"),
  }),
});

const api = defineModule({
  id: "api",
  name: "API",
  dependencies: ["database"],
  factory: (): Module => ({
    id: "api",
    name: "API",
    onReady: () => console.log("api listening"),
    onShutdown: () => console.log("api draining"),
  }),
});

const app = await createApplication({
  modules: [api, database],
  autoStart: true,
});

console.log("state:", app.state);

await app.stop();
```

What you should see:

```ts
database connected
api listening
state: running
api draining
database closed
```

Notice that `api` was listed first but `database` ran first. Declaration order does not matter; the `dependencies` field does.

Startup behaviour is tunable through `runtime.startup`:

| Option | What it does | Default |
| --- | --- | --- |
| `autoLoadModules` | Build module instances from their factories | `true` |
| `autoInitializeModules` | Run `onInitialize` during bootstrap | `true` |
| `autoStartModules` | Run `onReady` during bootstrap | `true` |
| `continueOnInitializeError` | Keep going when a module fails to initialize | `false` |
| `continueOnStartError` | Keep going when a module fails in `onReady` | `false` |
| `timeoutMs` | Give up on bootstrap after this long; `0` means never | `0` |

> WATCH OUT
>
>
>
> With `continueOnInitializeError: true` the runtime still reaches `ready`, but the bootstrap result reports `success: false` and lists the failures. A half-started application that looks healthy is worse than one that refuses to start, so leave this off unless you check the result.

## Graceful Shutdown

**Graceful** means the application stops accepting new work, finishes what it already accepted, and only then lets go of its resources. The opposite is being killed mid-request.

Shutdown walks the modules in the exact reverse of startup order. Every module gets `onShutdown` first; once they are all done, every module gets `onDestroy`.

| Option | What it does | Default |
| --- | --- | --- |
| `autoStopModules` | Run `onShutdown` | `true` |
| `autoDestroyModules` | Run `onDestroy` | `true` |
| `continueOnStopError` | Keep stopping the rest when one module throws | `true` |
| `continueOnDestroyError` | Keep destroying the rest when one module throws | `true` |
| `timeoutMs` | Abandon shutdown after this long; `0` means never | `30000` |

The two `continueOn` defaults are `true` on purpose. During shutdown, one broken module must not strand every other module's cleanup.

Shortening the shutdown budget to five seconds:

```ts
const app = await createApplication({
  modules: [api, database],
  runtime: {
    shutdown: { timeoutMs: 5_000 },
  },
});
```

`app.stop()` stops the runtime but leaves the application able to start again. `app.shutdown()` stops it and releases the lifecycle for good — after that, a restart is not possible.

## Signal Handling

A **signal** is how an operating system asks a process to stop. Pressing Ctrl-C sends `SIGINT`. Docker and Kubernetes send `SIGTERM` before they eventually force a kill.

The runtime installs handlers when it starts and removes them when it stops, so a signal turns into a graceful shutdown instead of an abrupt exit.

| Option | What it does | Default |
| --- | --- | --- |
| `handleSigint` | Stop gracefully on Ctrl-C | `true` |
| `handleSigterm` | Stop gracefully on `SIGTERM` | `true` |
| `handleSighup` | Stop gracefully on `SIGHUP` | `false` |
| `handleUncaughtException` | Mark failed and stop on an uncaught error | `true` |
| `handleUnhandledRejection` | Mark failed and stop on an unhandled rejection | `true` |
| `forceExitOnSecondSignal` | Exit immediately if a second signal arrives mid-stop | `false` |
| `forceExitCode` | Exit code used by the force exit above | `1` |

A container-friendly setup — impatient operators get a hard exit on the second Ctrl-C:

```ts
const app = await createApplication({
  modules: [api, database],
  autoStart: true,
  runtime: {
    name: "orders-service",
    mode: "production",
    signals: {
      handleSigterm: true,
      handleSigint: true,
      forceExitOnSecondSignal: true,
      forceExitCode: 130,
    },
    shutdown: { timeoutMs: 15_000 },
  },
});
```

> DANGER
>
>
>
> The runtime never calls `process.exit()` unless `forceExitOnSecondSignal` is switched on. That is deliberate: exiting the process is the host application's decision, not the framework's. If your process lingers after a signal, something else is still holding an open handle.

## The Standalone Runtime

`@zudojs/runtime` is a different package with a different runtime. It exists for hosts that assemble the pieces themselves rather than going through `createApplication`.

Its `createRuntime` takes explicit dependencies — a map of modules, a logger, a container and an event bus — and returns a `Runtime`.

```ts
import { createRuntime } from "@zudojs/runtime";

const runtime = createRuntime(
  { modules, logger, container, eventBus },
  { applicationName: "worker", environment: "production" },
);

await runtime.start();
```

Two things it adds over the core runtime:

- **Readiness checks.** `registerReadinessCheck(name, check)` adds a named check; `runReadinessChecks()` re-runs them all; `runtime.readiness` reports each result. A newly registered check starts out failing until it is first evaluated, so registering one on a live runtime moves it to degraded until it passes.
- **Health.** `runtime.health` and `runtime.status` give a structured report suitable for a health endpoint.

> DIFFERENT STATE NAMES
>
>
>
> This runtime's states are `created`, `initializing`, `initialized`, `starting`, `running`, `stopping`, `stopped` and `failed` — plain strings, not the core `RuntimeState` enum. Do not compare values from one runtime against the other.

The testing helper `testRuntime` is deliberately not exported from the package root. Import it from `@zudojs/runtime/testing`.

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — `createApplication`, `RuntimeState`, and the runtime most applications use.
- [@zudojs/runtime](https://zudojs.oyinlola.site/docs/packages-runtime.md) — the standalone runtime, with readiness and health.
- [Module System](https://zudojs.oyinlola.site/docs/architecture-module-system.md) — what the runtime is actually starting and stopping.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — ordering, timeouts and signal handling for components that are not modules.
- [Adapters](https://zudojs.oyinlola.site/docs/architecture-adapters.md) — the servers and connections a runtime brings up and tears down.
