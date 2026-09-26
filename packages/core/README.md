# @zudojs/core

Application lifecycle management, execution context propagation, and runtime orchestration for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-core](https://zudojs.oyinlola.site/docs/packages-core) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-core.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

When `runtime.mode` is omitted, it is derived from `NODE_ENV` with `resolveEnvironment()` from `@zudojs/constants` (`prod` / `Production` → `"production"`, `staging` → `"production"`, `test` → `"test"`, unset → `"development"`).

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

A failed `lifecycle.start()` stops, in reverse order, every participant whose `start()` completed, so a retry starts from the first one again. `dispose()` only reaches participants whose `initialize()` ran.

### Names shared with sibling packages

`LifecycleState`, `Lifecycle`, `LifecycleManager`, `createRuntime`, `Container` and `ConfigurationManager` are also exported — with different meanings — by `@zudojs/constants`, `@zudojs/lifecycle`, `@zudojs/runtime`, `@zudojs/container` and `@zudojs/config`. This package's `LifecycleState` (`created … running … stopped`) is the state of the core `Lifecycle` participant machine; `@zudojs/constants`' is the component state used by `@zudojs/lifecycle` (`idle … ready … disposed`); `@zudojs/runtime` has its own `RuntimeState`. When two of these packages meet in one file, import the aliases `CoreLifecycleState`, `CoreLifecycle`, `CoreLifecycleManager`, `createCoreRuntime`, `CoreContainer` and `CoreConfigurationManager` instead of renaming at the import.

## Runtime

`createRuntime(dependencies, options)` returns a single-use runtime:

```
CREATED → BOOTSTRAPPING → READY → STOPPING → STOPPED
FAILED is reachable from every non-terminal state via fail() or a failure.
```

- `start()` loads, initializes, and starts modules through the bootstrap pipeline; `getStatus().bootstrap` reports counts, errors, and duration.
- `stop()` stops and destroys modules through the shutdown pipeline; `getStatus().shutdown` reports the same.
- `startup.timeoutMs` / `shutdown.timeoutMs` abort the pipeline with a `RuntimeTimeoutError`; the abandoned pipeline can never surface an unhandled rejection. `startup.timeoutMs` defaults to `0` (no deadline) — set one in production. A timed-out bootstrap starts no further phase or module hook. `stop()` does not wait behind the hook that is still running: it tears down every module that came up and returns; the stuck module stays in its active phase, and if its hook settles later it is stopped and destroyed then (best-effort, recorded on its lifecycle state).
- Rollback and shutdown only call `onDestroy` on modules whose `onInitialize` was invoked; a module that was never reached (a dependent of the one that failed) is left untouched.
- `continueOnInitializeError` / `continueOnStartError` (and the stop/destroy equivalents) make the runtime finish with `success: false` and the failures listed instead of throwing.
- Every error the runtime throws extends `RuntimeError` (which itself extends `RuntimeError` from `@zudojs/errors`), so `isRuntimeError()` from either package recognises it.
- `runtime.context` is the runtime's immutable `RuntimeExecutionContext` (`executionId` = runtime id, `service` = runtime name, `metadata.runtimeId/runtimeName/runtimeMode/runtimeRole` plus `RuntimeOptions.metadata`); `runtime.timing` holds the state-transition timestamps; `runtime.contextStorage` is the `ContextStorage` the context is established in (`RuntimeDependencies.contextStorage`, default `getDefaultContextStorage()`).

### Signals

When `signals.handleSigint` / `handleSigterm` / `handleSighup` are on (SIGINT and SIGTERM default to on), the runtime registers handlers on start and removes them on stop, failure, or dispose. The first signal triggers a graceful `stop()`. A second signal during shutdown exits the process with `signals.forceExitCode` (default 1); set `signals.forceExitOnSecondSignal: false` to log and ignore it instead. `handleUncaughtException` / `handleUnhandledRejection` mark the runtime failed, stop it, and then exit the process with code 1, because the installed handler suppresses Node's own crash and the process would otherwise end with code 0. `signals.fatalExitTimeout` (default 10000 ms) bounds a shutdown that hangs; set `signals.exitOnFatalError: false` to stop the runtime and keep the process running. The runtime never calls `process.exit()` otherwise.

An `Application` follows a stop its runtime started on its own (`runtime.onStateChange(listener)` reports every transition): after a signal it moves through `stopping` to `stopped` and stops its lifecycle participants; after a fatal error it ends `failed`. `Application.stop()` is single-flight, so a concurrent call joins the run in progress. `signalTarget` accepts `process` or any `EventEmitter` without a cast.

Diagnostics log entries carry `environment` (the runtime mode: development/test/production), `engine` (the JavaScript engine) and, for the start entries, the phase about to run.

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

- `manager.on(type, listener)` / `manager.off(...)` receive the `configuration.initializing`, `configuration.loaded`, `configuration.validated`, `configuration.ready`, `configuration.failed`, `configuration.reloading`, and `configuration.reloaded` events (`"*"` subscribes to all of them).
- `manager.getSection(name)` returns a scoped configuration for a registered section; `manager.reload()` keeps programmatic defaults and serialises overlapping reloads.
- Values are deep-frozen; `toObject()` returns an independent deep copy. Path lookups never walk the prototype chain, and `getNumber` accepts only plain decimal numbers.
- Secrets never reach errors or logs: validation, load, and source errors pass through the redactor, which matches whole key words (`password`, `secret`, `token`, `pwd`, `passphrase`, `auth`, `dsn`, `credential`, ...).

## Logging

`new ConsoleLogger({ level, structured, service, version, environment, context, redact })` emits structured JSON (circular and `BigInt` safe) or human-readable output.

- `logger.child({ moduleId })` merges the context into every entry it emits; `LoggerOptions.context` is attached to every entry.
- `LoggerOptions.contextStorage` makes the logger merge `executionId`, `correlationId`, `traceId`, `spanId`, and `runtimeId` from the active execution context beneath its own context (explicit values win). `createApplication` sets it on the logger it creates.
- An unknown `level` throws `InvalidArgumentError` at construction rather than silently disabling logging.
- Error causes are serialised recursively with a depth limit. Sensitive keys (`password`, `secret`, `token`, `apiKey`, `authorization`, ...) in context and error details are redacted **by default** (`createLogRedactor()`); pass `redact: false` to log them in clear, or your own hook to replace the default. Child loggers inherit the setting.
- `logger.error(message, error, context?)` also accepts the `@zudojs/logger` convention `logger.error(message, context)`: a plain object in the second position with no third argument is logged as context. To log a plain object as the error, pass a third argument.
- `trace` output goes through `console.debug`, so the structured-output invariant holds.
- `ContextValues.require(key)` throws `ContextValueNotFoundError` (`CORE_CONTEXT_VALUE_NOT_FOUND`) rather than a bare `Error`.

## Execution context

There is one execution-context model: the immutable `ExecutionContext` (`createExecutionContext`, `deriveExecutionContext`, `withExecutionMetadata`) propagated by `ContextStorage`, which wraps `AsyncLocalStorage`. `run(context, fn)` and `runDerived(overrides, fn)` establish a context for the callback and everything it awaits, `runWithValues(context, values, fn)` additionally binds a `ContextValues` collection (read back with `getValues()`; `run()` starts a new execution without the enclosing execution's values, `runDerived()` keeps them), and `capture()` / `runSnapshot(snapshot, fn)` carry a context across queue or timer boundaries. `getDefaultContextStorage()` is the process-wide instance every component uses unless another is injected.

Propagation is real at runtime:

- `runtime.start()` and `runtime.stop()` run the bootstrap and shutdown pipelines inside `runtime.contextStorage.run(runtime.context, ...)`.
- Each module hook (`onInitialize`, `onReady`, `onShutdown`, `onDestroy`) runs in a context derived from it: `module` is the module id, `operation` is the hook name, and `{ moduleId, phase }` is merged into `metadata`. `ModuleLifecycleOptions.contextStorage` selects the storage (default: the shared one).
- `Application.start()` / `stop()` / `shutdown()` run lifecycle participants inside the runtime's context as well.
- `createApplication` threads one storage (`CreateApplicationOptions.contextStorage`) through the `ApplicationContext` (`getContextStorage()`), the container's `currentScope` (so `"scoped"` providers resolve once per execution context; resolving one outside any execution context, or from a singleton's factory, throws a `DependencyResolutionError`), the module lifecycle, the runtime, and the logger.

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
