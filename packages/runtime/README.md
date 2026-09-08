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

`runtime.status` and `runtime.context` are read live, so `state`,
`ready`, `health`, `startedAt`, `stoppedAt` and `error` always reflect
the runtime as it is now.

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
