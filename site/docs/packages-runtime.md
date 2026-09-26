---
title: "@zudojs/runtime — Runtime Orchestration Documentation"
description: "@zudojs/runtime docs: application lifecycle orchestration, dependency-ordered startup and shutdown, rollback, signal handling and readiness."
source: https://zudojs.oyinlola.site/docs/packages-runtime
---

v1.3.1

# @zudojs/runtime

Application runtime orchestrator for the Zudojs framework. Manages the complete lifecycle from creation through shutdown with deterministic dependency ordering, rollback, signal handling, readiness tracking, and health checks.

RUNTIME LIFECYCLE STARTUP SHUTDOWN ORCHESTRATION

## OVERVIEW

A real application is made of several pieces: a database connection, a queue, an HTTP server. They have to come up in the right order — the server should not accept traffic before the database is connected — and go down in the opposite order, so nothing is torn out from under something still using it.

A **runtime** is the thing that does that for you. You hand it your pieces, it works out the order from the dependencies you declared, starts them one by one, and when the process is asked to shut down it stops them in reverse.

Each piece you hand it is a **module**: a plain object with an `id`, a `name`, an optional list of module ids it depends on, and up to four hook functions the runtime calls at the right moments.

### When you need it

- Your process owns resources that must be opened before use and closed on exit.
- One piece of your app must be up before another one starts.
- You deploy somewhere that sends SIGTERM and expects a clean exit (Kubernetes, Docker, systemd).
- You need a readiness endpoint that only says "yes" once your dependencies really answer.

### When you don't

- A script that runs top to bottom and exits. There is no lifecycle to manage.
- A library. Libraries should not start processes; leave that to the application that uses them.
- You already use `createApplication()` from [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md), which wires a runtime for you.

### How this fits with core and lifecycle

[@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) owns the `Module` contract and the application object. It defines what a module *is*; this package defines when each of its hooks is *called*. Reach for core when you are writing modules, and for this package when you are booting a process yourself.

[@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) is the same idea one level down: it orders and starts arbitrary components, not Zudo modules, and knows nothing about runtime status, readiness or health. Use it to sequence a handful of objects inside a larger program; use this package to run the whole process.

## INSTALLATION

Install the package together with the services it orchestrates. All of them ship at the same version.

```bash
$ npm install @zudojs/runtime @zudojs/core @zudojs/logger @zudojs/container @zudojs/events
```

> **Source of truth:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

The package also pulls in `@zudojs/errors`, `@zudojs/constants` and `@zudojs/config` as regular dependencies, so you do not install those yourself unless you import from them directly. Node 24 or newer is required.

## QUICK START

This is a complete program. It defines one module, builds a runtime around it, starts it and stops it.

```ts
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { createRuntime } from "@zudojs/runtime";

const database: Module = {
  id: "database",
  name: "Database",
  async onInitialize() {
    console.log("database connected");
  },
  async onShutdown() {
    console.log("database closed");
  },
};

const runtime = createRuntime(
  {
    modules: new Map([["database", database]]),
    logger: createLogger({ name: "my-app" }),
    container: createContainer(),
    eventBus: createEventBus(),
  },
  {
    environment: "development",
    applicationName: "my-app",
  },
);

await runtime.start();
console.log(runtime.state, runtime.ready); // "running" true

await runtime.stop();
console.log(runtime.state); // "stopped"
```

What you should see, in this order (interleaved with the runtime's own log lines):

```ts
database connected
running true
database closed
stopped
```

> **Tip:** The first argument is the services the runtime works with; the second is how the runtime itself should behave. `environment` and `applicationName` are the only required options.

## RUNTIME STATES

A **lifecycle state** is one word describing where the runtime is right now: not started yet, coming up, up, going down, down, or broken. Read it from `runtime.state`.

```ts
type RuntimeState =
  | "created"       // built, nothing has run yet
  | "initializing"  // onInitialize hooks are running
  | "initialized"   // every module has initialized
  | "starting"      // onReady hooks are running
  | "running"       // everything is up
  | "stopping"      // modules are being torn down
  | "stopped"       // everything is down
  | "failed";       // something went wrong on the way up or down
```

The runtime only moves between states along fixed paths. Ask for an illegal move and you get a `RuntimeStateError` instead of a half-started process.

| From | Can move to |
| --- | --- |
| created | initializing, stopped, failed |
| initializing | initialized, failed |
| initialized | starting, failed |
| starting | running, failed |
| running | stopping, failed |
| stopping | stopped, failed |
| stopped | *nothing — this is the end* |
| failed | stopping, stopped |

> **Changed in v1.3.0:** `start()` passes through every state in order: `created → initializing → initialized → starting → running`. `onInitialize` hooks see `initializing` and `onReady` hooks see `starting`, and the runtime publishes `runtime.initialized` and `runtime.starting` between the two phases. `RUNTIME_STATE_TRANSITIONS` no longer allows `initializing → running` or `initialized → running`. In 1.2.1 the two middle states were declared but never entered, and `onReady` ran while the state still read `initializing`.

> **In plain words:** `failed` is not the end. A failed start only rolls back the modules that actually started, so you can still call `stop()` to release everything else. Since v1.3.0 the state helpers agree: `TERMINAL_STATES` is `["stopped"]` and `isTerminalState("failed")` is `false`.

The same rules are available as functions, if you want to check a state without touching a runtime.

```ts
import {
  canTransition,
  isTerminalState,
  isRunning,
  hasFailed,
} from "@zudojs/runtime";

console.log(canTransition("created", "initializing")); // true
console.log(canTransition("stopped", "running"));   // false
console.log(isTerminalState("stopped"));               // true
console.log(isTerminalState("failed"));                // false — stop() still works from "failed"
console.log(isRunning("running"));                     // true
console.log(hasFailed("failed"));                      // true
```

For more than the bare state, read `runtime.status`. It is recomputed every time you read it, so it never goes stale.

```ts
interface RuntimeStatus {
  readonly state: RuntimeState;
  readonly ready: boolean;
  readonly running: boolean;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
  readonly failedAt?: Date;
  readonly error?: RuntimeError;
  /** Modules that failed to stop or destroy during the last shutdown. */
  readonly shutdownFailures?: readonly RuntimeShutdownFailure[];
}
```

> **Watch out:** `state === "stopped"` with a non-empty `shutdownFailures` means the runtime finished shutting down but some modules did not release their resources. Log that list; do not treat it as a clean exit.

## MODULES AND ORDER

A module declares what it needs through `dependencies` — a list of other module ids. The runtime sorts modules so that a module's dependencies are always brought up first, and torn down last.

Each module can implement any of four hooks. The runtime calls them with a `ModuleContext`, and skips any hook a module does not define.

| Hook | When it runs | Order |
| --- | --- | --- |
| onInitialize | Bringing the module up: open connections, read config. | Dependencies first |
| onReady | After every module has initialized: start accepting work. `runtime.state` is `starting` here (it was still `initializing` before v1.3.0). | Dependencies first |
| onShutdown | Shutting down: stop accepting work, drain. | Reverse |
| onDestroy | Last call: release everything the module still holds. | Reverse |

This example has three modules in a chain. Watch the printed order.

```ts
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { createRuntime } from "@zudojs/runtime";

function noisyModule(id: string, dependencies: string[]): Module {
  return {
    id,
    name: id,
    dependencies,
    async onInitialize() {
      console.log(`up: ${id}`);
    },
    async onShutdown() {
      console.log(`down: ${id}`);
    },
  };
}

const modules = new Map([
  ["api", noisyModule("api", ["cache"])],
  ["cache", noisyModule("cache", ["database"])],
  ["database", noisyModule("database", [])],
]);

const runtime = createRuntime(
  {
    modules,
    logger: createLogger({ name: "ordering" }),
    container: createContainer(),
    eventBus: createEventBus(),
  },
  { environment: "development", applicationName: "ordering" },
);

await runtime.start();
await runtime.stop();
```

Even though the map lists `api` first, this prints:

```ts
up: database
up: cache
up: api
down: api
down: cache
down: database
```

You can compute that order yourself, without a runtime. The dependency functions take a map of module id to its dependency ids.

```ts
import { resolveDependencies } from "@zudojs/runtime";

const graph = new Map([
  ["database", []],
  ["cache", ["database"]],
  ["api", ["cache"]],
]);

console.log(resolveDependencies(graph).order);
// [ 'database', 'cache', 'api' ]

// Modules at the same depth have no dependency on each other,
// so they could be started together.
console.log(resolveDependencies(graph).parallelGroups);
// [ [ 'database' ], [ 'cache' ], [ 'api' ] ]
```

> **Danger:** Naming a dependency that is not in the map throws `RuntimeDependencyError`, and a dependency cycle throws `RuntimeCircularDependencyError`. Both surface at startup, not later at runtime.

## STARTUP AND SHUTDOWN

`start()` initializes every module in order, then readies them. If any module throws, the runtime rolls back: modules that already started are stopped and destroyed in reverse, and the state becomes `failed`.

`start()` does **not** re-throw the error your module threw. It rejects with a `RuntimeStartError` whose `cause` is your original error, whose `phase` is `"initialize"` (an `onInitialize` threw) or `"start"` (an `onReady` threw), and whose `failedModuleId` names the module. So `error instanceof MyDbError` is always false in the catch block; test `error.cause` instead. Since v1.3.0 two subclasses narrow it down, and `instanceof RuntimeStartError` still matches both:

- `RuntimeInitializationError` (`phase: "initialize"`) when an `onInitialize` hook fails, or when the configuration manager fails to load (then with no `failedModuleId`).
- `RuntimeRollbackError` when startup fails *and* the rollback that follows also fails. `phase`, `failedModuleId` and `cause` describe the startup failure, `originalError` holds the error `start()` would otherwise have thrown, `rollbackError` what failed during rollback (an `AggregateError` when several modules failed), and the message names both, for example `Module "api" failed during initialization. Rollback also failed: close failed`. Before v1.3.0 a rollback failure was only logged.

A startup that outlives `startupTimeout` rejects with `RuntimeTimeoutError` instead, which has no cause.

`stop()` goes the other way, and is safe to call more than once — stopping an already-stopped runtime does nothing.

Handling a failed start, and getting at the original error:

```ts
import { RuntimeStartError, RuntimeTimeoutError } from "@zudojs/runtime";

try {
  await runtime.start();
} catch (error) {
  if (error instanceof RuntimeStartError) {
    // error.cause is the error your module threw.
    console.error(
      `module ${error.failedModuleId} failed in ${error.phase}:`,
      error.cause,
    );
  } else if (error instanceof RuntimeTimeoutError) {
    console.error(`${error.operation} timed out after ${error.timeoutMs}ms`);
  } else {
    console.error("startup failed:", error);
  }

  // Release whatever startup did not roll back, then exit non-zero.
  await runtime.stop();
  await container.dispose(); // unless you passed disposeContainerOnStop: true
  process.exit(1);
}
```

With a module whose `onInitialize` throws `new Error("connect ECONNREFUSED")`, this prints `module database failed in initialize: Error: connect ECONNREFUSED`.

### Who disposes the container

The container is passed in, so by default the caller owns it: `stop()` calls every module's `onShutdown` and `onDestroy` but leaves the container alone, and any `SINGLETON` it created (a pool, a file handle, a client with open sockets) is still open after `runtime.stop()` resolves. Since v1.3.0 you can hand ownership to the runtime with `disposeContainerOnStop: true`: `stop()` then disposes the container after every module has shut down and been destroyed, including a signal-driven stop and `stop()` on a runtime that never started. A disposal failure is recorded in `status.shutdownFailures` under the id `"(container)"` (exported as `CONTAINER_SHUTDOWN_ID`) and does not fail the stop.

```ts
const runtime = createRuntime(
  { modules, logger, container, eventBus },
  { environment: "production", applicationName: "my-api", disposeContainerOnStop: true },
);

await runtime.start();
await runtime.stop();      // modules shut down, then each singleton's dispose() runs
console.log(container.isDisposed()); // true
```

Without the option, dispose the container yourself *after* the runtime has stopped (modules may still resolve services while they shut down, and a disposed container throws on every use): `await runtime.stop(); await container.dispose();`.

The fatal-error path (`uncaughtException`, `unhandledRejection`) calls `process.exit(1)` as soon as the stop settles, so an asynchronous `dispose()` you start yourself from a `runtime.stopped` handler may not finish there. `disposeContainerOnStop: true` avoids that, because the disposal is part of `stop()` itself.

Two options bound how long either direction may take. A module whose hook never settles no longer hangs the process forever.

| Option | Default | What it bounds |
| --- | --- | --- |
| startupTimeout | 60000 | The whole startup sequence. On expiry, startup fails with a timeout error and rolls back; no further module hook starts, and a module whose hook finishes late is shut down and destroyed. |
| shutdownTimeout | 30000 | The whole shutdown sequence. On expiry `stop()` throws `RuntimeStopError` and the state becomes `failed`. |

> **In plain words:** pick a shutdown timeout slightly shorter than your platform's grace period. Kubernetes sends SIGTERM and then SIGKILL 30 seconds later by default, so a 30-second shutdown timeout leaves no room.

## READINESS AND HEALTH

**Liveness** asks: is this process still worth keeping alive? If the answer is no, the right fix is to restart it.

**Readiness** asks something narrower: should this process be sent traffic *right now*? A process can be perfectly alive and still not ready — it is starting up, or its database went away for a minute. Restarting it would not help; you just stop sending it requests until it recovers.

A **readiness check** is a named function returning a boolean (or a promise of one). Register as many as you have dependencies worth checking.

Registering a check and re-running it:

```ts
let databaseConnected = false;

runtime.registerReadinessCheck("database", () => databaseConnected);

await runtime.runReadinessChecks();
console.log(runtime.ready);         // false
console.log(runtime.health.state);  // "degraded"

databaseConnected = true;

await runtime.runReadinessChecks();
console.log(runtime.ready);         // true
console.log(runtime.health.state);  // "healthy"
console.log(runtime.readiness.checks.get("database")?.durationMs); // e.g. 0
```

A check that should be visible in health but must not take the process out of rotation, such as a cache, is registered as non-critical. A check that returns `false` reports the message `"Check returned false."`, and `readiness.reason` names the failing critical checks.

```ts
runtime.registerReadinessCheck("cache", () => cacheConnected, { critical: false });
```

Once `stop()` begins, the runtime stays not-ready (`shutting_down`) even if every check passes again, so a load balancer stops sending traffic for good. A manual `markNotReady()` also holds until `markReady()`: re-running the checks does not undo it.

> **Watch out:** registering a check does not run it. A new check starts out failing, so registering one on a running runtime makes it not-ready until `runReadinessChecks()` passes it. That is deliberate — a check nobody has evaluated is not evidence of anything.

`runtime.health` is derived, never stored. While the runtime is running it is `healthy` if every check passes and `degraded` if any fails; every other lifecycle state maps straight onto a health state.

| Lifecycle state | health.state |
| --- | --- |
| created, stopped | unknown |
| initializing, initialized, starting | starting |
| running | healthy or degraded, from the checks |
| stopping | stopping |
| failed | unhealthy |

Wiring the two ideas to two probe endpoints, as a fragment inside your HTTP handler:

```ts
// Liveness: restart me only if I am broken beyond recovery.
const liveStatus = runtime.health.state === "unhealthy" ? 503 : 200;

// Readiness: send me traffic only when every check passes.
await runtime.runReadinessChecks();
const readyStatus = runtime.ready ? 200 : 503;
```

A check that throws counts as failing, and its message is recorded on the check. A check that does not settle within 5 seconds is recorded as failed too, so one hanging probe cannot wedge your readiness endpoint.

## SIGNALS

When your platform wants your process gone, it sends a *signal* — a small message from the operating system. The runtime listens for these and calls `stop()` for you, so you rarely write signal code yourself.

| Signal or event | What the runtime does |
| --- | --- |
| SIGTERM | Graceful shutdown. The process stays alive until every `onShutdown` has finished, then exits on its own: code 0 when the shutdown succeeded, code 1 when it failed. A signal during startup waits for startup to settle, then stops. A second SIGTERM during shutdown exits immediately. |
| SIGINT | Same as SIGTERM. This is Ctrl-C. |
| uncaughtException | Logs the error, shuts down, then exits with code 1. |
| unhandledRejection | Same as an uncaught exception. |

Handlers are attached before modules start, so a signal arriving mid-boot is still honoured. Turn them off — in tests, or when your host owns process signals — with two options:

```ts
const runtime = createRuntime(dependencies, {
  environment: "test",
  applicationName: "my-app",
  handleSignals: false,
  handleFatalErrors: false,
});
```

> **Watch out:** do not add your own `process.on("SIGTERM", ...)` that also calls `stop()` while `handleSignals` is on. You get two shutdowns racing; the second signal is then read as "exit now".

### How a signal-driven shutdown ends

With `handleSignals` on, the signal handler holds the event loop open for the whole graceful shutdown, so `onShutdown` runs to the end even under plain `node`, after your server has closed and nothing else keeps the process alive. The runtime never calls `process.exit()` here. It sets `process.exitCode` and lets the process exit on its own:

| What happened during shutdown | Final state | Exit code | Events and log |
| --- | --- | --- | --- |
| Every hook finished | `stopped` | 0 (left alone) | `runtime.stopped` |
| An `onShutdown` threw | `stopped` | 1 | `runtime.module.failed`, then `runtime.stopped`; logs `Shutdown handler failed.` with a `RuntimeSignalError` |
| The shutdown outlived `shutdownTimeout` | `failed` | 1 | `runtime.failed` (`phase: "stop"`) once; logs `Shutdown handler failed.` with a `RuntimeSignalError` |

Tested under plain `node` with a module whose `onShutdown` clears the last interval and then waits on an unref'd 300 ms timer, and `shutdownTimeout: 500`:

```ts
clean shutdown        → database closed, runtime.stopped, exit code 0, state "stopped"
onShutdown throws     → exit code 1, state "stopped", runtime.failed not published
onShutdown never ends → runtime.failed stop (once), exit code 1, state "failed"
```

An orchestrator such as Kubernetes or systemd sees the non-zero exit without any code of yours. You no longer need to set `process.exitCode` from a `runtime.failed` handler; subscribe to `runtime.failed` and `runtime.module.failed` only to report the failure.

> **Changed in v1.3.1:** in v1.3.0 a `SIGTERM`/`SIGINT` under plain `node` could end the process at once with code 0, with the runtime still `running` or `stopping` and `onShutdown` unfinished, whenever nothing else kept the event loop alive (`tsx` hid this by keeping the loop alive). A failed signal-driven shutdown was only logged, as `Shutdown failed.`, and the exit code stayed 0, so this page advised setting `process.exitCode = 1` in a `runtime.failed` handler; that workaround can go. A failed stop also published `runtime.failed` twice, and a module failure during startup did too; each now publishes it once.

## EVENTS

The runtime announces what it is doing on the event bus you passed in. Subscribe if you want to log boot progress, export metrics, or react to a health change without polling.

Listening for health changes:

```ts
import { createEventBus } from "@zudojs/events";
import type { RuntimeHealthEventPayload } from "@zudojs/runtime";

const eventBus = createEventBus();

eventBus.on("runtime.health.changed", (event) => {
  const payload = event.payload as RuntimeHealthEventPayload;
  console.log(`health: ${payload.previousState} -> ${payload.currentState}`);
});

// Pass this same eventBus in the runtime's dependencies.
// A clean boot prints: health: unknown -> starting, then starting -> healthy
```

Eighteen event types are emitted, in four families:

- **Runtime** — `runtime.initializing`, `.initialized`, `.starting`, `.running`, `.stopping`, `.stopped`, `.failed`. `.initialized` and `.starting` are published since v1.3.0, and since v1.3.1 the `RuntimeEventType` union includes them too. There is no `runtime.created` event.
- **Module** — `runtime.module.initializing`, `.initialized`, `.starting`, `.started`, `.stopping`, `.stopped`, `.failed`
- **Shutdown** — `runtime.shutdown.drain`, `runtime.shutdown.complete`
- **Derived state** — `runtime.health.changed`, `runtime.readiness.changed`

Every payload carries `runtimeId`, `timestamp` and `state`. Module events add `moduleId` and `moduleName`; failure events add `error` and `phase`. Set `emitEvents: false` to silence all of them.

## RUNTIME CONTEXT

The context is one object holding everything about the running application: who it is, how it is doing, and the shared services. Read it from `runtime.context`. Like `status`, it is rebuilt on every read, so the values are always current.

```ts
interface RuntimeContext {
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly state: RuntimeState;
  readonly status: RuntimeStatus;
  readonly startedAt?: Date;
  readonly logger: Logger;
  readonly container: Container;
  readonly eventBus: EventBus;
  readonly health: RuntimeHealth;
  readonly ready: boolean;
}
```

Anything you put in `metadata` at creation shows up here — handy for a region, a build number, or a pod name.

```ts
const runtime = createRuntime(dependencies, {
  environment: "production",
  applicationName: "my-api",
  applicationVersion: "1.4.0",
  metadata: { region: "eu-west-1" },
});

console.log(runtime.context.metadata.region); // "eu-west-1"
console.log(runtime.context.runtimeId);       // "rt_9f2c..." (generated)
```

Modules get a different object, a `ModuleContext` from [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md), giving them a logger, the container, and configuration. Configuration is backed by a manager you supply; without one, modules see an empty configuration rather than a crash.

```ts
import { createConfigurationManager } from "@zudojs/core";

const runtime = createRuntime(
  {
    modules,
    logger,
    container,
    eventBus,
    configuration: createConfigurationManager(),
  },
  { environment: "production", applicationName: "my-api" },
);
```

> **Note:** `context.application` is only available if you pass an `application` in the same dependencies object. Reading it without one throws a clear error instead of handing back an empty stub.

## MULTIPLE RUNTIMES

One process sometimes runs more than one thing — an API and a background worker, say. `RuntimeRegistry` keeps them together so you can start and stop them as a unit. You register each one under an id of your choosing.

```ts
import { RuntimeRegistry } from "@zudojs/runtime";

const registry = new RuntimeRegistry();

registry.register("api", apiRuntime);
registry.register("worker", workerRuntime);

await registry.startAll();

console.log(registry.isAllReady()); // true
console.log(registry.getStatus());
// { api: { state: 'running', ready: true },
//   worker: { state: 'running', ready: true } }

await registry.stopAll();
```

Runtimes start in registration order and stop in reverse. If one fails to start, the ones already started are stopped again before the error reaches you, so you never keep a half-booted process.

> **Watch out:** `unregister(id)` only drops the reference and returns whether there was one — it does not stop the runtime. Use `removeAndStop(id)` when you want both.

## TESTING

The test helpers live behind their own entry point, `@zudojs/runtime/testing`, so a test-only module never ends up in your production bundle. They are not exported from the package root.

`withTestRuntime` builds a runtime with signals off, starts it, runs your callback, and stops it — even if the callback throws.

```ts
import { describe, it, expect } from "vitest";
import {
  withTestRuntime,
  createMockModule,
} from "@zudojs/runtime/testing";

describe("my app", () => {
  it("starts and stops cleanly", async () => {
    const users = createMockModule("users");

    await withTestRuntime(async (runtime) => {
      expect(runtime.state).toBe("running");
      expect(runtime.ready).toBe(true);
    }, [users]);

    expect(users.calls.onInitialize).toBe(1);
    expect(users.callOrder).toEqual([
      "onInitialize",
      "onReady",
      "onShutdown",
      "onDestroy",
    ]);
  });
});
```

When you need the runtime object itself, build one with `createTestRuntime` and drive it by hand. It creates its own container and, since v1.3.0, disposes it on `stop()` (`disposeContainerOnStop: true`); pass `disposeContainerOnStop: false` to keep it.

```ts
import { createTestRuntime, createMockModule } from "@zudojs/runtime/testing";

const runtime = createTestRuntime([createMockModule("users")], {
  startupTimeout: 1_000,
});

await runtime.start();
await runtime.stop();
```

> **Note:** `createMockModule` records its own calls in `calls` and `callOrder`. They are plain counters, not `vi.fn()` spies, so do not call `toHaveBeenCalled()` on them.

## API REFERENCE

### The Runtime object

| Member | What it does | Notes |
| --- | --- | --- |
| start() | Brings every module up in dependency order. | Rolls back and throws `RuntimeStartError` (original on `cause`; `RuntimeInitializationError` or `RuntimeRollbackError` where they apply) on failure. Calling it twice is a no-op. |
| stop() | Tears every module down in reverse order. | Works from `failed`; safe to call repeatedly. Disposes the container only with `disposeContainerOnStop: true`. |
| state | The current lifecycle state. | One `RuntimeState` string. |
| status | State plus timestamps, error and shutdown failures. | Recomputed on every read. |
| context | Identity, services and live state in one object. | Recomputed on every read. |
| health | Derived health, with per-check results. | Always `unknown` when `trackHealth` is off. |
| ready | Whether every readiness check passes. | Boolean. |
| readiness | Readiness state plus a map of check results. | Each result carries `ready`, `message`, `durationMs`. |
| registerReadinessCheck(name, check, { critical? }) | Adds a named check. | Starts out failing until first run. `critical: false` reports the check without making the runtime not-ready. |
| removeReadinessCheck(name) | Removes a check. | Returns whether one existed. |
| runReadinessChecks() | Re-evaluates every check. | Each check is bounded by a 5-second timeout. |

### Options

| Option | Default | What it does |
| --- | --- | --- |
| environment | *required* | "development" \| "test" \| "staging" \| "production". |
| applicationName | *required* | Name used in logs and events. |
| applicationVersion | "0.1.0" | Version reported on the context. |
| runtimeId | generated | Identifier for this runtime instance. |
| handleSignals | true | Shut down on SIGTERM and SIGINT. |
| handleFatalErrors | true | Shut down and exit 1 on an uncaught error. |
| exitOnFatalError | true | Exit 1 after a fatal-error shutdown. |
| fatalExitTimeout | 10000 | Exit anyway if that shutdown hangs. |
| forceExitOnSecondSignal | true | A second SIGTERM/SIGINT exits immediately. |
| startupTimeout | 60000 | Milliseconds allowed for startup. |
| shutdownTimeout | 30000 | Milliseconds allowed for shutdown. |
| emitEvents | true | Publish lifecycle events on the bus. |
| trackReadiness | true | Mark ready automatically once all checks pass. |
| trackHealth | true | Derive health and emit health events. |
| readinessCheckTimeout | 5000 | Milliseconds one readiness check may take before it counts as failed. |
| parallelInitialization | false | Initialize modules at the same dependency depth together instead of one by one. |
| disposeContainerOnStop | false | Dispose the container after every module has shut down. New in v1.3.0; `createTestRuntime` sets it to `true`. |
| metadata | {} | Free-form values surfaced on the context. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createRuntime(deps, options) | Builds a runtime. | The normal entry point. |
| resolveDependencies(map) | Returns order and parallelGroups. | Throws on a missing dependency or a cycle. |
| buildDependencyGraph(map) | Returns nodes, order and any cycles. | Does not throw on a cycle; it reports one. |
| validateDependencies(map) | Throws if a module names a dependency that is not in the map. | Returns nothing; resolveDependencies calls it for you. |
| computeRuntimeHealth(state, readiness) | Derives health from a state and check results. | What `runtime.health` uses. |
| createRuntimeOptions(options) | Applies defaults, then validates. | `resolveRuntimeOptions` and `validateRuntimeOptions` do each half. |
| createRuntimeContext(deps) | Builds a context object. | The runtime does this for you. |
| createRuntimeIdentity(id, env, name, version) | Adds hostname and process id to the identity. | Useful in log metadata. |
| createRuntimeId() | Generates an `rt_…` identifier. | `createCorrelationId` and `createRequestId` match it. |
| createStatus(state) | Builds a bare status from a state. | No timestamps. |
| canTransition(from, to) | Whether a state move is legal. | `assertTransition` throws instead. |
| isTerminalState / isRunning / hasFailed / canStart / canStop | One-line state questions. | All take a `RuntimeState`. |
| executeStartup / rollbackStartup / executeShutdown | The sequences the runtime runs internally. | Only needed if you build your own runtime. |
| createRuntimeEventPayload and friends | Build event payloads. | Module, failure, health and readiness variants exist. |
| publishRuntimeEvent(bus, logger, event) | Publishes an event without letting a subscriber break the caller. | Used by the runtime. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| DefaultRuntime | The runtime implementation. | Prefer `createRuntime()`. |
| RuntimeRegistry | Holds several runtimes in one process. | `register(id, runtime)`, `startAll`, `stopAll`, `removeAndStop`. |
| ReadinessTracker | Stores and evaluates readiness checks. | Usable on its own: `registerCheck`, `runChecks`, `updateCheck`, `removeCheck`, `getState`. |
| LifecycleManager | Calls module hooks in order. | `initialize`, `start`, `stop`, `destroy`, `rollback`. |
| SignalHandler | Attaches and removes process handlers. | The runtime owns one already. |

### Errors

| Name | Thrown when | Notes |
| --- | --- | --- |
| RuntimeStateError | An illegal state move is attempted. | E.g. starting a stopped runtime. |
| RuntimeStartError | A module hook, or the configuration manager, fails during startup. | Carries `phase` (`"initialize"` or `"start"`) and `failedModuleId`; the error your module threw is on `cause`. |
| RuntimeStopError | Shutdown fails. | Carries `phase`. |
| RuntimeInitializationError | An `onInitialize` hook, or the configuration manager, fails during startup. | Extends `RuntimeStartError` with `phase: "initialize"`; accepts a `failedModuleId`. Thrown since v1.3.0. |
| RuntimeTimeoutError | Startup, shutdown or a check runs too long. | Carries `operation` and `timeoutMs`. |
| RuntimeRollbackError | Startup fails and the rollback that follows also fails. | Extends `RuntimeStartError`. `originalError` is the startup error, `rollbackError` what failed during rollback (an `AggregateError` for several). Thrown since v1.3.0. |
| RuntimeCircularDependencyError | Modules depend on each other in a loop. | Carries the `cycle`. |
| RuntimeDependencyError | A module depends on an unregistered id. | Carries `moduleId` and `dependencyId`. |
| RuntimeSignalError | Logged by `SignalHandler` when the shutdown it triggered rejects; never thrown, since a signal handler has no caller. | Carries `signal` and, since v1.3.0, an optional `cause`. See the note under Signals: a runtime from `createRuntime` catches its own stop failure first and logs `Shutdown failed.` instead. |
| toRuntimeError(error, phase) | Wraps anything thrown into a `RuntimeError`. | Passes an existing one through unchanged. |

### Constants and types

| Name | What it is | Notes |
| --- | --- | --- |
| DEFAULT_RUNTIME_OPTIONS | The default option values. | Frozen object. |
| RUNTIME_STATE_TRANSITIONS | The legal moves per state. | Backs `canTransition`. |
| TERMINAL_STATES / STARTABLE_STATES / STOPPABLE_STATES | State groupings. | Frozen arrays. `TERMINAL_STATES` is `["stopped"]` since v1.3.0. |
| CONTAINER_SHUTDOWN_ID | `"(container)"` | The `shutdownFailures` id under which a failed container disposal is recorded. |
| Runtime, RuntimeDependencies | The runtime interface and its inputs. | Type-only exports. |
| RuntimeOptions, ResolvedRuntimeOptions | Options before and after defaults. | Type-only. |
| RuntimeState, RuntimeStatus, RuntimeHealth, RuntimeHealthState | State and health shapes. | Type-only. |
| ReadinessCheckFn, ReadinessCheck, ReadinessTrackerState | Readiness shapes. | Type-only. |
| LifecyclePhase, LifecycleResult, LifecycleFailure | Per-phase results from the lifecycle manager. | Type-only. |
| RuntimeEventType, RuntimeModuleEventType, RuntimeEventMap and payload types | Event names and payload shapes. | Type-only. Since v1.3.1 `RuntimeEventType` is `keyof RuntimeEventMap` (all 18 names, including `runtime.initialized` and `runtime.starting`), and `RuntimeModuleEventType` is its `runtime.module.*` subset. |

## COMMON MISTAKES

- **Importing test helpers from the package root.** `import { withTestRuntime } from "@zudojs/runtime"` fails — nothing by that name is exported there. Import from `@zudojs/runtime/testing` instead.
- **Registering a runtime without an id.** `registry.register(apiRuntime)` does not type-check. The signature is `register(id, runtime)`, and registering the same id twice throws.
- **Expecting a new readiness check to pass.** It is failing until `runReadinessChecks()` runs it, so `runtime.ready` flips to false the moment you register one. Run the checks before reading readiness.
- **Treating `failed` as the end.** Startup rollback shuts down started modules and destroys every module whose `onInitialize` ran (including one that threw); a module that finishes after a startup timeout is torn down when it settles, and `stop()` waits for that. Call `stop()` on a failed runtime to release it fully.
- **Caching `runtime.status` in a variable and reading it later.** Each read builds a fresh snapshot; the one you held onto is frozen in the past. Read `runtime.status` at the moment you need it.
- **Ignoring `status.shutdownFailures`.** The state reaches `stopped` either way. Only that list tells you a module failed to release its resources.
- **Checking the startup error's type directly.** `start()` wraps a module's failure in `RuntimeStartError`, so `error instanceof YourError` is false. Look at `error.cause`.
- **Assuming `stop()` closes container services.** By default it does not call `container.dispose()`. Pass `disposeContainerOnStop: true`, or call it yourself after the runtime has stopped.
- **Checking `state === "initializing"` inside `onReady`.** Since v1.3.0 `onReady` runs in `starting`. Test for the state you actually mean, or subscribe to `runtime.starting` / `runtime.running`.

## RELATED PACKAGES

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — defines `Module`, `ModuleContext` and the application object. Start here when you are writing the modules a runtime will run.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — orders and starts arbitrary components rather than Zudo modules. Use it inside a program that is not built around a runtime.
- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — the event bus every runtime event is published on.
- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — the dependency container the runtime hands to your modules.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — the logger the runtime writes its lifecycle messages to.

## COMPLETE EXPORT INDEX

Every name `@zudojs/runtime` exports from its package root at v1.4.0 — **93** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 93 exports**

Classes (14)

`DefaultRuntime` `LifecycleManager` `ReadinessTracker` `RuntimeCircularDependencyError` `RuntimeDependencyError` `RuntimeInitializationError` `RuntimeRegistry` `RuntimeRollbackError` `RuntimeSignalError` `RuntimeStartError` `RuntimeStateError` `RuntimeStopError` `RuntimeTimeoutError` `SignalHandler`

Functions (31)

`assertTransition` `buildDependencyGraph` `canStart` `canStop` `canTransition` `computeRuntimeHealth` `createCorrelationId` `createFailureEventPayload` `createHealthEventPayload` `createModuleEventPayload` `createReadinessEventPayload` `createRequestId` `createRuntime` `createRuntimeContext` `createRuntimeEventPayload` `createRuntimeId` `createRuntimeOptions` `createStatus` `executeShutdown` `executeStartup` `hasFailed` `isRunning` `isTerminalState` `publishRuntimeEvent` `resolveDependencies` `resolveRuntimeOptions` `rollbackStartup` `toRuntimeError` `validateDependencies` `validateRuntimeOptions` `withRuntimeContextState`

Interfaces (32)

`CircularDependencyInfo` `DependencyGraph` `DependencyNode` `DependencyResolutionResult` `LifecycleContext` `LifecycleFailure` `LifecycleManagerOptions` `LifecycleResult` `ManagedModule` `ModuleContextServices` `ReadinessCheck` `ReadinessCheckOptions` `ReadinessInitialCheck` `ReadinessOptions` `ReadinessTrackerState` `ResolvedRuntimeOptions` `Runtime` `RuntimeContext` `RuntimeContextDependencies` `RuntimeContextState` `RuntimeDependencies` `RuntimeEventMap` `RuntimeEventPayload` `RuntimeFailureEventPayload` `RuntimeHealth` `RuntimeHealthCheck` `RuntimeHealthEventPayload` `RuntimeModuleEventPayload` `RuntimeOptions` `RuntimeReadinessEventPayload` `RuntimeShutdownFailure` `RuntimeStatus`

Type aliases (10)

`LifecyclePhase` `ModuleEventListener` `ReadinessCheckFn` `ReadinessState` `RuntimeEventType` `RuntimeFailureState` `RuntimeHealthState` `RuntimeId` `RuntimeModuleEventType` `RuntimeState`

Constants (6)

`CONTAINER_SHUTDOWN_ID` `DEFAULT_RUNTIME_OPTIONS` `RUNTIME_STATE_TRANSITIONS` `STARTABLE_STATES` `STOPPABLE_STATES` `TERMINAL_STATES`
