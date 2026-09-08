# @zudojs/core

Application lifecycle management, execution context propagation, and runtime orchestration for Zudojs applications.

## Installation

```bash
npm install @zudojs/core
```

## Quick Start

```typescript
import { createApplication, defineModule } from "@zudojs/core";

const app = await createApplication({
  modules: [
    defineModule({
      id: "users",
      name: "Users",
      factory: () => ({
        id: "users",
        name: "Users",
        onInitialize: async () => {
          /* prepare resources */
        },
        onShutdown: async () => {
          /* release resources */
        },
      }),
    }),
  ],
  runtime: {
    name: "my-service",
    mode: "production",
    signals: { handleSigint: true, handleSigterm: true },
  },
});

await app.start(); // loads, initializes, and starts modules
await app.stop(); // stops and destroys modules
await app.start(); // restart: a fresh runtime is created
await app.shutdown(); // stop + dispose; cannot be restarted afterwards
```

`createApplication` wires the standard graph (container, configuration manager, logger, module registry/loader/lifecycle, runtime, application lifecycle). Every piece can also be assembled by hand:

```typescript
import {
  Application,
  ApplicationContext,
  Lifecycle,
  createRuntime,
} from "@zudojs/core";

const lifecycle = new Lifecycle();
lifecycle.register({
  name: "http-server",
  start: async () => server.listen(),
  stop: async () => server.close(),
});

const app = await Application.create({
  lifecycle,
  runtime: () => createRuntime(dependencies, options), // factory enables restart
});
```

## Runtime

`createRuntime(dependencies, options)` returns a single-use runtime:

```
CREATED → BOOTSTRAPPING → READY → STOPPING → STOPPED
FAILED is reachable from every non-terminal state via fail() or a failure.
```

- `start()` loads, initializes, and starts modules through the bootstrap pipeline; `getStatus().bootstrap` reports counts, errors, and duration.
- `stop()` stops and destroys modules through the shutdown pipeline; `getStatus().shutdown` reports the same.
- `startup.timeoutMs` / `shutdown.timeoutMs` abort the pipeline with a `RuntimeTimeoutError`; the abandoned pipeline can never surface an unhandled rejection.
- `continueOnInitializeError` / `continueOnStartError` (and the stop/destroy equivalents) make the runtime finish with `success: false` and the failures listed instead of throwing.
- Every error the runtime throws extends `RuntimeError` (which itself extends `RuntimeError` from `@zudojs/errors`), so `isRuntimeError()` from either package recognises it.
- `runtime.context` is the runtime's immutable `RuntimeExecutionContext` (`executionId` = runtime id, `service` = runtime name, `metadata.runtimeId/runtimeName/runtimeMode/runtimeRole` plus `RuntimeOptions.metadata`); `runtime.timing` holds the state-transition timestamps; `runtime.contextStorage` is the `ContextStorage` the context is established in (`RuntimeDependencies.contextStorage`, default `getDefaultContextStorage()`).

### Signals

When `signals.handleSigint` / `handleSigterm` / `handleSighup` are on (SIGINT and SIGTERM default to on), the runtime registers handlers on start and removes them on stop, failure, or dispose. The first signal triggers a graceful `stop()`. A second signal during shutdown is logged and ignored unless `signals.forceExitOnSecondSignal` is explicitly enabled, in which case the process exits with `signals.forceExitCode`. `handleUncaughtException` / `handleUnhandledRejection` mark the runtime failed and stop it. The runtime never calls `process.exit()` otherwise.

## Modules

Modules implement the `Module` contract and are driven by `ModuleLifecycleManager` in dependency order:

```
onInitialize → onReady → onShutdown → onDestroy
```

- Register definitions with `defineModule(...)` (or subclass `BaseModule`); dependencies may be plain ids or `{ id, optional, version }` objects, and version constraints (`^`, `~`, `>=`, exact) are checked when the graph is built.
- Dependents are skipped when a dependency fails, and modules initialized before a failure are rolled back (stopped and destroyed).
- `unloadModule(id)` stops, destroys, and forgets a module (refused while loaded dependents exist); `replaceModule(definition)` shuts the old instance down first.
- Only the documented `on*` hooks are invoked. The legacy `initialize/start/stop/destroy` names are no longer called.

## Configuration

`createConfigurationManager({ registry, schemas, loaderOptions, validationOptions, redactorOptions })` loads registered sources by priority, deep-merges them, applies schema defaults, validates, and exposes an immutable `Configuration`.

- `manager.on(event, listener)` / `manager.off(...)` receive `initializing`, `loaded`, `validated`, `ready`, `failed`, `reloading`, and `reloaded` events.
- `manager.getSection(name)` returns a scoped configuration for a registered section; `manager.reload()` keeps programmatic defaults and serialises overlapping reloads.
- Values are deep-frozen; `toObject()` returns an independent deep copy. Path lookups never walk the prototype chain, and `getNumber` accepts only plain decimal numbers.
- Secrets never reach errors or logs: validation, load, and source errors pass through the redactor, which matches whole key words (`password`, `secret`, `token`, `pwd`, `passphrase`, `auth`, `dsn`, `credential`, ...).

## Logging

`new ConsoleLogger({ level, structured, service, version, environment, context, redact })` emits structured JSON (circular and `BigInt` safe) or human-readable output.

- `logger.child({ moduleId })` merges the context into every entry it emits; `LoggerOptions.context` is attached to every entry.
- `LoggerOptions.contextStorage` makes the logger merge `executionId`, `correlationId`, `traceId`, `spanId`, and `runtimeId` from the active execution context beneath its own context (explicit values win). `createApplication` sets it on the logger it creates.
- An unknown `level` throws `InvalidArgumentError` at construction rather than silently disabling logging.
- Error causes are serialised recursively with a depth limit; `redact` (see `createLogRedactor()`) is applied to context and error details.
- `trace` output goes through `console.debug`, so the structured-output invariant holds.

## Execution context

There is one execution-context model: the immutable `ExecutionContext` (`createExecutionContext`, `deriveExecutionContext`, `withExecutionMetadata`) propagated by `ContextStorage`, which wraps `AsyncLocalStorage`. `run(context, fn)` and `runDerived(overrides, fn)` establish a context for the callback and everything it awaits, `runWithValues(values, fn)` adds request-scoped values, and `capture()` / `runSnapshot(snapshot, fn)` carry a context across queue or timer boundaries. `getDefaultContextStorage()` is the process-wide instance every component uses unless another is injected.

Propagation is real at runtime:

- `runtime.start()` and `runtime.stop()` run the bootstrap and shutdown pipelines inside `runtime.contextStorage.run(runtime.context, ...)`.
- Each module hook (`onInitialize`, `onReady`, `onShutdown`, `onDestroy`) runs in a context derived from it: `module` is the module id, `operation` is the hook name, and `{ moduleId, phase }` is merged into `metadata`. `ModuleLifecycleOptions.contextStorage` selects the storage (default: the shared one).
- `Application.start()` / `stop()` / `shutdown()` run lifecycle participants inside the runtime's context as well.
- `createApplication` threads one storage (`CreateApplicationOptions.contextStorage`) through the `ApplicationContext` (`getContextStorage()`), the container's `currentScope` (so `"scoped"` providers resolve once per execution context), the module lifecycle, the runtime, and the logger.

```typescript
import { defineModule, getDefaultContextStorage } from "@zudojs/core";

defineModule({
  id: "users",
  name: "Users",
  factory: () => ({
    id: "users",
    name: "Users",
    onInitialize: async () => {
      const context = getDefaultContextStorage().require();
      // context.executionId === runtime.identity.id
      // context.metadata.moduleId === "users", context.metadata.phase === "initializing"
    },
  }),
});
```

The former mutable `Context` class and `DefaultRuntimeContext` are gone; `Context`, `createContext`, `RuntimeContext`, and `createRuntimeContext` remain as deprecated aliases of the canonical names.

## Features

- Application lifecycle management (start, stop, restart)
- Execution context propagation via `ContextStorage` (`AsyncLocalStorage`)
- Dependency-ordered module lifecycle with rollback on failure
- Configuration loading, validation, schema defaults, redaction, and events
- Structured, redaction-aware logging
- Runtime state machine with dependency-ordered module lifecycle
- Signal handling for graceful shutdown (SIGINT, SIGTERM, SIGHUP)
- Dependency injection container with singleton, scoped (per execution context), and transient lifetimes

## Use Cases

- Bootstrapping Zudojs applications
- Managing application lifecycle in serverless environments
- Coordinating startup and shutdown of multiple services
