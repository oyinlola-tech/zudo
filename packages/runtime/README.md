# @zudojs/runtime

Application lifecycle orchestrator with dependency ordering, rollback, signals, and readiness checks.

## Installation

```bash
npm install @zudojs/runtime
```

## Quick Start

`createRuntime` takes the framework services the runtime orchestrates,
then the runtime's own options.

```typescript
import { createRuntime } from "@zudojs/runtime";

const runtime = createRuntime(
  {
    modules: new Map([
      ["database", database],
      ["api", api],
    ]),
    logger,
    container,
    eventBus,
  },
  {
    environment: "production",
    applicationName: "my-app",
  },
);

await runtime.start();
await runtime.stop();
```

Modules start in dependency order and stop in reverse.

## Readiness and health

Readiness checks are registered on the runtime and re-evaluated on demand.
A registered check starts out failing until it is first run, so registering
one on a running runtime moves it to `degraded` until it passes.

```typescript
runtime.registerReadinessCheck("database", () => database.isConnected());

await runtime.runReadinessChecks();

runtime.ready; // false while any check fails
runtime.health.state; // "healthy" | "degraded" | ...
runtime.readiness.checks.get("database"); // per-check result and duration
```

`runtime.health` is derived from the lifecycle state and the readiness
checks: a running runtime is `healthy` when every check passes and
`degraded` when any check fails; every other lifecycle state maps onto
`starting`, `stopping`, `unhealthy` or `unknown`. A change emits
`runtime.health.changed` on the event bus.

`runtime.status` and `runtime.context` are read live, so `state`, `ready`,
`health`, `startedAt`, `stoppedAt`, `failedAt` and `error` always reflect
the runtime as it is now — including on the failure path, where
`context.error` names what went wrong.

By default a readiness check that does not settle within 5 seconds is
recorded as failed; pass `readinessCheckTimeout` to change that bound, or
`0` to remove it.

## Module context

Modules receive a `ModuleContext` giving them the framework services they
are allowed to reach. Configuration and the application context are
supplied through the runtime's dependencies:

```typescript
const runtime = createRuntime(
  { modules, logger, container, eventBus, configuration, application },
  options,
);
```

`configuration` backs `context.getConfiguration()`, `context.getConfig()`
and `context.requireConfig()`; it defaults to an empty manager loaded at
startup. `application` backs `context.application` — a module that reads
it when none was supplied gets a clear error rather than an empty object.
`context.hasModule()` and `context.getModuleContext()` resolve against the
registered modules, and a module keeps the same context across every
lifecycle phase.

## Runtime events

With `emitEvents` (the default), the runtime publishes on the event bus.
Subscribe with `bus.on(type, handler)`; the payload types are in
`RuntimeEventMap`.

| Event | Payload |
| --- | --- |
| `runtime.initializing`, `runtime.running`, `runtime.stopping`, `runtime.stopped` | `RuntimeEventPayload` |
| `runtime.failed` | `RuntimeFailureEventPayload` |
| `runtime.module.initializing` / `initialized` / `starting` / `started` / `stopping` / `stopped` / `failed` | `RuntimeModuleEventPayload` |
| `runtime.shutdown.drain`, `runtime.shutdown.complete` | `RuntimeEventPayload` |
| `runtime.health.changed` | `RuntimeHealthEventPayload` |
| `runtime.readiness.changed` | `RuntimeReadinessEventPayload` |

```typescript
bus.on("runtime.module.failed", (event) => {
  const { moduleId, moduleName, error, durationMs } = event.payload;
  alert(`${moduleName} (${moduleId}) failed after ${durationMs}ms`, error);
});
```

Every `runtime.module.*` event names the module it is about. A listener
that throws is logged and contained; it never fails the lifecycle phase
that produced the event.

## Options

```typescript
createRuntime(dependencies, {
  environment: "production", // required
  applicationName: "my-app", // required
  applicationVersion: "1.4.0",
  runtimeId: "rt_custom", // generated when omitted
  handleSignals: true, // SIGTERM/SIGINT trigger a graceful stop
  handleFatalErrors: true, // uncaughtException/unhandledRejection
  startupTimeout: 60_000,
  shutdownTimeout: 30_000,
  emitEvents: true,
  trackReadiness: true,
  trackHealth: true,
  readinessCheckTimeout: 5_000, // 0 removes the bound
  parallelInitialization: false, // initialize each depth group at once
  metadata: { region: "eu-west-1" },
});
```

`parallelInitialization` initializes modules that share a dependency depth
concurrently. They do not depend on one another by construction, but
enabling it surfaces any ordering a module assumed without declaring, so
it is opt-in.

## Features

- Module dependency ordering
- Graceful shutdown with rollback
- Signal handling (SIGINT, SIGTERM)
- Readiness checks and derived health
- Lifecycle hooks (onInitialize, onReady, onShutdown, onDestroy)

## Use Cases

- Application bootstrapping
- Microservice orchestration
- Graceful shutdown handling
- Health check endpoints
