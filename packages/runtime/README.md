# @zudojs/runtime

Application lifecycle orchestrator with dependency ordering, rollback, signals, and readiness checks.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-runtime](https://zudojs.oyinlola.site/docs/packages-runtime) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-runtime.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

## Lifecycle states

`start()` walks the state machine in order:

```
created -> initializing -> initialized -> starting -> running -> stopping -> stopped
```

Every module's `onInitialize` runs while `runtime.state` is
`initializing`; once all have initialized the runtime passes through
`initialized` to `starting`, and every `onReady` runs under `starting`.
`start()` resolves in `running`. A failure in any phase ends in `failed`,
which is still stoppable. `created` may go straight to `stopped` (a
`stop()` before `start()`). Only `stopped` is terminal:
`isTerminalState("failed")` is `false`, because `stop()` moves a failed
runtime on to `stopped`.

## Startup failures

If any module throws, the runtime rolls back (modules that already started
are stopped and destroyed in reverse) and the state becomes `failed`.
`start()` then rejects with a `RuntimeStartError` that wraps the error your
module threw rather than re-throwing it: the original is `error.cause`,
`error.phase` is `"initialize"` (an `onInitialize` threw) or `"start"` (an
`onReady` threw), and `error.failedModuleId` names the module.

Two subclasses of `RuntimeStartError` narrow it down:

- `RuntimeInitializationError` — the failure was in the initialize phase
  (an `onInitialize` threw, or the configuration manager failed to load).
- `RuntimeRollbackError` — startup failed AND the rollback that followed
  failed, so a module may still hold resources. `phase`,
  `failedModuleId` and `cause` still describe the startup failure;
  `originalError` is the error `start()` would otherwise have thrown, and
  `rollbackError` is what failed during rollback (an `AggregateError`
  when several modules failed). Call `stop()` to retry the release.

A shutdown triggered by `SIGTERM`, `SIGINT` or a fatal error has no caller
to reject; if it fails, the runtime logs a `RuntimeSignalError` (with the
failure as `cause`) as the `error` field of its "Shutdown handler
failed." entry.

## Signals and exit codes

With `handleSignals: true`, a `SIGTERM` or `SIGINT` runs a graceful
`stop()`, and the runtime holds the process open until that shutdown has
finished — every `onShutdown` and `onDestroy` hook runs, even when nothing
else is keeping the event loop alive or a hook closes the last open socket
before its async work is done. (Node's signal listeners do not keep the
process alive by themselves; before this was fixed, a process with nothing
else pending exited with code 0 mid-shutdown, still `running` or
`stopping`.)

When the shutdown is over the runtime lets the process exit on its own
rather than calling `process.exit()`, so your own `SIGTERM` listeners and
pending writes still finish:

- clean shutdown: the exit code is left alone (0 unless you set one);
- failed shutdown — `stop()` rejected (including an `onShutdown` that
  outlives `shutdownTimeout`, which leaves the runtime `failed`), or a
  module's hook failed (`status.shutdownFailures` is non-empty):
  `process.exitCode` is set to `1` and the failure is logged as a
  `RuntimeSignalError`. A failed stop publishes `runtime.failed`
  (`phase: "stop"`) once;
- fatal error (`exitOnFatalError`): `process.exit(1)` once shutdown ends;
- second `SIGTERM`/`SIGINT` during shutdown (`forceExitOnSecondSignal`):
  `process.exit(1)` at once.

If something outside the runtime still holds a handle (a server you did not
close in a module), the process stays up after the runtime has stopped, as
it would without the runtime.

```typescript
import { RuntimeStartError } from "@zudojs/runtime";

try {
  await runtime.start();
} catch (error) {
  if (error instanceof RuntimeStartError) {
    const original = error.cause; // what the module threw
    logger.error(`Module ${error.failedModuleId} failed in ${error.phase}`, {
      original,
    });
  }
  await runtime.stop(); // release anything rollback did not reach
}
```

A startup that outlives `startupTimeout` rejects with `RuntimeTimeoutError`,
which has no cause.

## Container ownership

The runtime does not create the container; you pass it in, so by default
you own it and `stop()` leaves it alone. Dispose it yourself after
`stop()`:

```typescript
await runtime.stop();
await container.dispose();
```

or hand ownership to the runtime with `disposeContainerOnStop: true`, and
`stop()` disposes it after every module has shut down and been destroyed.
A disposal failure does not fail `stop()`; it is logged and recorded in
`runtime.status.shutdownFailures` under the id `"(container)"`
(exported as `CONTAINER_SHUTDOWN_ID`).
`createTestRuntime` (from `@zudojs/runtime/testing`) creates its own
container and sets `disposeContainerOnStop: true`.

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
| `runtime.initializing`, `runtime.initialized`, `runtime.starting`, `runtime.running`, `runtime.stopping`, `runtime.stopped` | `RuntimeEventPayload` |
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
  exitOnFatalError: true, // exit(1) once a fatal-error shutdown finishes
  fatalExitTimeout: 10_000, // exit(1) anyway if that shutdown hangs
  forceExitOnSecondSignal: true, // a second SIGTERM/SIGINT exits at once
  startupTimeout: 60_000,
  shutdownTimeout: 30_000,
  emitEvents: true,
  trackReadiness: true,
  trackHealth: true,
  readinessCheckTimeout: 5_000, // 0 removes the bound
  parallelInitialization: false, // initialize each depth group at once
  disposeContainerOnStop: false, // true: stop() disposes the container
  metadata: { region: "eu-west-1" },
});
```

`startupTimeout` abandons the startup: no further module hook starts,
and a module whose `onInitialize` or `onReady` finishes after the timeout
is shut down and destroyed as soon as it settles. `stop()` waits for that
teardown (bounded by `shutdownTimeout`), so a stopped runtime never has a
live module behind it. A second `stop()` after a shutdown timeout joins
the teardown still running rather than calling `onShutdown` again.

A configuration manager that fails to load fails startup with a
`RuntimeStartError` (`phase: "initialize"`) instead of letting modules
initialize against partial configuration.

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
