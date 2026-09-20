---
title: "@zudojs/core — Application Lifecycle, Context & Runtime"
description: "Complete documentation for @zudojs/core — application lifecycle management, execution context propagation, module system, configuration, logging, and runtime orchestration for the Zudo framework."
source: https://zudojs.oyinlola.site/docs/packages-core
---

v1.2.0

# @zudojs/core

Application lifecycle, context propagation, runtime orchestrator, and module system.

CORE LIFECYCLE RUNTIME

## OVERVIEW

An application is made of parts: a database connection, an HTTP server, a cache. Each must be set up in the right order and torn down in reverse when the process stops. `@zudojs/core` does that ordering for you.

You describe each part as a *module*: a plain object with an `id`, a `name`, and optional hooks such as `onInitialize`. You hand the modules to `createApplication()`, which builds a *runtime* that starts them, keeps them running, and stops them cleanly on Ctrl+C.

WHEN YOU NEED IT

- More than one thing to start and stop.
- Module B must wait until module A is ready.
- Ctrl+C or SIGTERM should shut everything down in order.

WHEN YOU DON'T

- A one-file script that runs and exits.
- You only need a container, logger, or config: see [Related](#related) for the smaller packages.

## INSTALLATION

Install the package. Its dependencies `@zudojs/errors` and `@zudojs/constants` come with it. Everything is imported from the package root.

```bash
$ npm install @zudojs/core
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This defines one module, builds an application around it, starts it, and shuts it down. Save it as `app.ts` and run `npx tsx app.ts`.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const users = defineModule({
  id: "users",
  name: "Users",
  factory: (): Module => ({
    id: "users",
    name: "Users",
    onInitialize: (context) => { context.logger.info("users: initialized"); },
    onShutdown: (context) => { context.logger.info("users: shutting down"); },
  }),
});

const app = await createApplication({
  modules: [users],
  runtime: { name: "my-service", mode: "development" },
});

await app.start();
console.log(app.state);   // "running"
await app.shutdown();
console.log(app.state);   // "stopped"
```

**What you should see.** The default logger prints one JSON line per call. Around your two `console.log` lines you also get the runtime's own progress lines. Yours look like this (the id is a random UUID):

```json
{"level":"info","message":"users: initialized","timestamp":"2026-09-09T10:00:00.000Z","context":{"executionId":"my-service-3f2b1c9e-7a4d-4e8b-9c1f-2d5a6b7c8d9e","runtimeId":"my-service-3f2b1c9e-7a4d-4e8b-9c1f-2d5a6b7c8d9e","moduleId":"users","module":"Users"}}
running
{"level":"info","message":"users: shutting down","timestamp":"2026-09-09T10:00:00.010Z","context":{"executionId":"my-service-3f2b1c9e-7a4d-4e8b-9c1f-2d5a6b7c8d9e","runtimeId":"my-service-3f2b1c9e-7a4d-4e8b-9c1f-2d5a6b7c8d9e","moduleId":"users","module":"Users"}}
stopped
```

## MODULES

A *module definition* (from `defineModule`) describes a module and holds a `factory` that creates the real module object. The definition is registered once; the factory runs on every start, so a restart gets fresh instances.

A module may implement any of four hooks. Only these names are called, in this order:

| Hook | When it runs | Typical work |
| --- | --- | --- |
| `onInitialize(context)` | On start, dependencies first | Open connections |
| `onReady(context)` | After every module initialized | Start listening or polling |
| `onShutdown(context)` | On stop, dependents first | Stop accepting work |
| `onDestroy(context)` | After every module shut down | Close connections |

### Dependencies and the context

List the ids that must be ready first in `dependencies`. The runtime sorts modules accordingly, and a module may only look at the modules it declared, through `context.getModuleContext(id)`. Here `orders` depends on `users` and reads its name.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const users = defineModule({
  id: "users",
  name: "Users",
  factory: (): Module => ({ id: "users", name: "Users" }),
});

const orders = defineModule({
  id: "orders",
  name: "Orders",
  dependencies: ["users"],
  factory: (): Module => ({
    id: "orders",
    name: "Orders",
    dependencies: ["users"],
    onInitialize: (context) => {
      console.log(context.getModuleContext("users")?.name);   // "Users"
      console.log(context.getConfig("orders.limit"));            // undefined (no config yet)
    },
  }),
});

const app = await createApplication({ modules: [orders, users], logger: { level: "warn" } });
await app.start();
await app.shutdown();
```

Listing order does not matter; `users` still initializes first. A dependency that was never registered makes `start()` throw `MissingModuleDependencyError`; a cycle throws `CircularModuleDependencyError`.

Every hook receives a `ModuleContext`:

| Member | What it does |
| --- | --- |
| `id`, `name`, `options` | The module's identity and the `options` from its definition |
| `logger` | Logger that tags every line with the module id |
| `getConfig(path)`, `requireConfig(path)` | Read a config value by dotted path; `require` throws if missing |
| `getModuleContext(id)`, `hasModule(id)` | Reach a declared dependency; undeclared ids throw / return `false` |
| `application` | `ApplicationContext`: `getContainer()`, `getConfiguration()`, `getModules()`, `getLogger()` |

> COMMON MISTAKE
>
>
>
> Hooks named `initialize`, `start`, `stop`, or `setup` on a module are silently ignored. Prefer a class? Extend `BaseModule` and pass `factory: () => new MyModule()`.

## APPLICATION

`createApplication(options)` wires the container, configuration, logger, module registry and runtime, and returns an `Application` in state `"initialized"`.

| Option | What it does | Default |
| --- | --- | --- |
| `modules` | Module definitions to register | `[]` |
| `runtime` | `RuntimeOptions`: name, mode, signals, timeouts (see [Runtime](#runtime)) | `{}` |
| `participants` | App-level start/stop hooks that are not modules (see [Lifecycle](#lifecycle)) | `[]` |
| `logger` | A `Logger`, or `LoggerOptions` for the built-in `ConsoleLogger` | JSON, level `info` |
| `configuration`, `container` | Your own `ConfigurationManager` / `Container` | Created empty |
| `autoStart` | Call `start()` before returning | `false` |

`stop()` shuts modules down but lets you `start()` again with fresh instances. `shutdown()` stops and releases everything; after it the app cannot start again. This restarts once, then shuts down.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const cache = defineModule({
  id: "cache",
  name: "Cache",
  factory: (): Module => ({ id: "cache", name: "Cache" }),
});
const app = await createApplication({ modules: [cache], logger: { level: "warn" } });

await app.start();
await app.stop();
console.log(app.state);                                           // "stopped"
await app.start();                                                // new runtime
console.log(app.applicationRuntime?.requireModule("cache").name); // "Cache"
await app.shutdown();
```

`app.state` is one of `created`, `initializing`, `initialized`, `starting`, `running`, `stopping`, `stopped`, `failed`. `start()` while running is a no-op; from `failed` it throws `InvalidStateError`. `app.applicationRuntime` is the current runtime; `app.applicationContext` holds the shared services.

## LIFECYCLE PARTICIPANTS

A *lifecycle participant* is something that must start before any module and stop after all of them, such as an HTTP server. It is a plain object with a `name` and any of `initialize`, `start`, `stop`, `dispose`. Participants live on the app's `Lifecycle`; modules live in the runtime. This records the order.

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
console.log(events);   // [ "http:start", "users:initialize", "users:shutdown", "http:stop" ]
```

`Lifecycle` also works alone: `new Lifecycle()`, `register(participant)`, then `initialize()`, `start()`, `stop()`, `dispose()`. Stop runs in reverse registration order and continues past a failing participant unless you pass `{ continueOnShutdownError: false }`.

## BUILDING BLOCKS

The runtime is assembled from four smaller pieces. Each is exported so you can use it directly.

### Container

A *dependency container* is a box you register values in under a *token* (a named key) so other code can ask for them by token instead of creating them. A *provider* says how to make the value: `{ useValue }`, `{ useClass }`, or `{ useFactory }`. This registers a config object and a database built from it.

```ts
import { Container, createToken } from "@zudojs/core";

const PortToken = createToken<number>("Port");
const UrlToken = createToken<string>("Url");

const container = new Container();
container.register(PortToken, { useValue: 5432 });
container.register(UrlToken, { useFactory: (c) => `postgres://localhost:${c.resolve(PortToken)}` });

console.log(container.resolve(UrlToken));   // "postgres://localhost:5432"
```

The optional third argument to `register` is the scope: `"singleton"` (default), `"transient"` (new per `resolve`), or `"scoped"` (one per execution context; resolving it outside any execution context, or from inside a singleton's factory, throws `DependencyResolutionError`). Unknown tokens throw `ProviderNotFoundError`; registering twice throws `ProviderAlreadyRegisteredError`.

### Configuration

Values come from *sources*: objects with a `name`, `type`, `priority`, and a `load()` returning `{ path, value }` entries; higher priority wins. Register sources, build a manager, and pass it as `configuration` to `createApplication`, which initializes it for you. Modules then use `context.getConfig(path)`.

```ts
import {
  createConfigurationManager, createConfigurationRegistry, createConfigurationSource,
} from "@zudojs/core";

const registry = createConfigurationRegistry();
registry.registerSource(createConfigurationSource({
  name: "defaults",
  type: "default",
  priority: 0,
  load: async () => [{ path: "http.port", value: 3000 }],
}));

const configuration = createConfigurationManager({ registry });
await configuration.initialize();
console.log(configuration.get("http.port"));      // 3000
console.log(configuration.get("http.host"));      // undefined
configuration.require("http.host");                 // throws ConfigurationMissingError
```

Keys such as `password` and `secret` are masked in configuration error messages. For environment, file and schema sources use [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md).

### Logging

`ConsoleLogger` has six levels (`trace` to `fatal`) and prints JSON unless `structured: false`. `child(fields)` returns a logger that adds those fields to every line. Any object with the six level methods and `child()` counts as a `Logger`.

```ts
import { ConsoleLogger } from "@zudojs/core";

const logger = new ConsoleLogger({ level: "info", structured: false, timestamps: false });
logger.info("invoice sent", { invoiceId: 42 });   // INFO: invoice sent invoiceId=42
logger.child({ module: "users" }).warn("slow query"); // WARN: slow query module=users
logger.error("failed", new Error("boom"));            // error object is the 2nd argument
```

An unknown level throws `InvalidArgumentError`. Secrets are not masked by default; pass `redact: createLogRedactor()` to hide keys like `password`.

### Execution context

An *execution context* is a small read-only record of "what is happening now": an `executionId`, an optional `operation`, tracing ids, and `metadata`. A `ContextStorage` makes it readable from any function called inside `run()`, even across `await`, without passing it around.

```ts
import { createExecutionContext, getDefaultContextStorage } from "@zudojs/core";

const storage = getDefaultContextStorage();
async function saveOrder(): Promise<void> {
  await Promise.resolve();
  console.log(storage.require().operation);   // "checkout"
}

await storage.run(createExecutionContext({ operation: "checkout" }), saveOrder);
console.log(storage.get());   // undefined (outside run)
```

`require()` outside `run()` throws `ExecutionContextNotFoundError`. The runtime runs every module hook inside a context whose `module` is the module id; the default logger adds its `executionId` to each line, and `"scoped"` providers resolve once per context. `run(ctx, fn)` starts a new execution without the enclosing execution's `ContextValues`; `runDerived()` keeps them.

## RUNTIME

The *runtime* is the engine that loads, initializes and starts modules, then stops and destroys them. It is single-use: its `state` goes `created` → `bootstrapping` → `ready` → `stopping` → `stopped`, or `failed`. That is why the application makes a new one per restart. Configure it with the `runtime` option:

| Option | What it does | Default |
| --- | --- | --- |
| `name`, `mode` | Service name; `"development"`, `"test"` or `"production"`. `mode` defaults to the mode derived from `NODE_ENV` via `resolveEnvironment()` (@zudojs/constants); `staging` runs as `production`, unset is `development` | `"application"`, from `NODE_ENV` |
| `startup.timeoutMs`, `shutdown.timeoutMs` | Abort with `RuntimeTimeoutError` after this long (`0` = no limit) | `0`, `30000` |
| `startup.continueOnInitializeError`, `continueOnStartError` | Keep going when a module throws; report it in `getStatus().bootstrap` instead | `false` |
| `signals.handleSigint`, `handleSigterm`, `handleSighup` | Stop gracefully on the OS signal | `true`, `true`, `false` |
| `signals.handleUncaughtException`, `handleUnhandledRejection` | Mark the runtime failed, stop it, then exit with code 1 (opt out with `signals.exitOnFatalError: false`; `signals.fatalExitTimeout`, default 10000 ms, bounds a hanging stop) | `true` |
| `signals.forceExitOnSecondSignal` | A second signal during shutdown exits with `signals.forceExitCode` (default `1`) | `true` |
| `diagnostics.startupLogging`, `shutdownLogging` | Print the runtime's own progress lines | `true` |

With `continueOnStartError` on, a broken module does not stop the app. This starts a module whose `onReady` throws and reads the report.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const app = await createApplication({
  logger: { level: "fatal" },
  runtime: { mode: "test", startup: { continueOnStartError: true } },
  autoStart: true,
  modules: [defineModule({
    id: "bad",
    name: "Bad",
    factory: (): Module => ({
      id: "bad",
      name: "Bad",
      onReady: () => { throw new Error("bad start"); },
    }),
  })],
});

const report = app.applicationRuntime!.getStatus().bootstrap!;
console.log(app.state, report.success);      // "running" false
console.log(report.errors[0]?.moduleName);    // "bad"
await app.shutdown();
```

Without the flag, `start()` throws a `RuntimeError`, already-initialized modules are rolled back, and the app ends in `failed`. Other runtime members: `getModule(id)`, `requireModule(id)`, `getUptime()`, `identity`, `environment`.

> MANUAL WIRING
>
>
>
> `createRuntime(dependencies, options)` and `Application.create({ lifecycle, runtime })` let you assemble the graph yourself from `ApplicationContext`, `createModuleRegistry`, `createModuleLoader` and `createModuleLifecycleManager`. `packages/core/tests/application.test.ts` shows the full recipe.

## API REFERENCE

All names are imported from `"@zudojs/core"`. Only exports a typical user calls or configures are listed.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createApplication(options?)` | Wires everything; returns an initialized `Application` | Async, restartable |
| `defineModule(options)` | Frozen `ModuleDefinition` | Throws `InvalidModuleDefinitionError` on bad input |
| `moduleToDefinition(module, factory?)` | Definition from an existing module instance |  |
| `createToken<T>(description)` | Unique container token | Strings and classes work too |
| `createConfigurationRegistry()`, `createConfigurationSource(options)`, `createConfigurationManager(options?)` | Configuration pipeline | `registerSource()`; manager has `initialize()`, `get()`, `require()`, `reload()`, `on()` |
| `createExecutionContext(input?)`, `deriveExecutionContext(parent, overrides)` | New / modified context records | Immutable |
| `getDefaultContextStorage()`, `createContextStorage()` | Shared / private `ContextStorage` |  |
| `createLogRedactor(options?)` | Redaction hook for `LoggerOptions.redact` |  |
| `createRuntime(dependencies, options?)`, `resolveRuntimeOptions(options)` | Manual runtime; fill in defaults | See Runtime |
| `createHandler(fn)` | Wraps a function as a `Handler` with `handle()` | Used by adapters |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `Application` | `start()`, `stop()`, `shutdown()`, `state`, `applicationRuntime`, `applicationContext` | `Application.create()` for manual wiring |
| `ApplicationContext` | `getContainer()`, `getConfiguration()`, `getModules()`, `getLogger()`, `getContextStorage()` | `context.application` in hooks |
| `Lifecycle`, `LifecycleManager` | Ordered initialize/start/stop/dispose over participants | `register()` |
| `BaseModule` | Abstract module with no-op hooks | Set `id` and `name` |
| `Container` | `register()`, `resolve()`, `has()`, `unregister()`, `createScope()` |  |
| `ConsoleLogger` | JSON or plain-text `Logger` | `child()` |
| `ContextStorage` | `run()`, `runDerived()`, `get()`, `require()`, `has()`, `capture()` | Wraps `AsyncLocalStorage` |

### Types and constants

| Name | What it is | Notes |
| --- | --- | --- |
| `Module`, `ModuleContext`, `ModuleDefinition` | Module object, hook argument, `defineModule` result | `dependencies` may be ids or `{ id, optional, version }` |
| `CreateApplicationOptions`, `ApplicationState` | Options and the eight states |  |
| `LifecycleParticipant` | `{ name, initialize?, start?, stop?, dispose? }` |  |
| `Token`, `Provider`, `Scope` | Container vocabulary |  |
| `Logger`, `LoggerOptions`, `LogLevel` | Logging contract | `LogLevel` is also a constant object |
| `RuntimeOptions`, `Runtime`, `RuntimeStatus`, `RuntimeState` | Runtime config, instance, `getStatus()` result, state enum | `DEFAULT_RUNTIME_OPTIONS` holds defaults |
| `ExecutionContext` | The context record |  |
| `Adapter`, `Handler`, `Disposable` | Contracts shared with other packages |  |

### Errors

All extend `FrameworkError`, which extends `ApplicationError` from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md).

| Name | When it is thrown | Notes |
| --- | --- | --- |
| `InvalidStateError` | `start()`/`stop()` from a state that forbids it |  |
| `InvalidArgumentError` | Bad option, e.g. unknown log level |  |
| `ProviderNotFoundError`, `ProviderAlreadyRegisteredError` | Container token missing / duplicated |  |
| `ConfigurationMissingError` | `require(path)` on a missing value | Extends `ConfigurationError` |
| `ExecutionContextNotFoundError` | `storage.require()` outside `run()` |  |
| `ModuleNotFoundError`, `DuplicateModuleError`, `MissingModuleDependencyError`, `CircularModuleDependencyError`, `InvalidModuleDefinitionError` | Module registration and dependency problems | All extend `ModuleError` |
| `RuntimeError`, `RuntimeStartError`, `RuntimeStopError`, `RuntimeTimeoutError` | Runtime start/stop failures and timeouts | `isRuntimeError(e)` |

## COMMON MISTAKES

- **Passing a module object as a definition.** `modules: [{ id, name }]` is rejected; `modules` takes definitions. Wrap it: `defineModule({ id, name, factory: () => module })`.
- **Old hook names.** `setup`, `initialize`, `start`, `stop` on a module never run. Use `onInitialize`, `onReady`, `onShutdown`, `onDestroy`.
- **Undeclared dependency.** `context.getModuleContext("db")` throws `MissingModuleDependencyError` unless `"db"` is declared in the definition's `dependencies` or on the module instance (`Module.dependencies`, e.g. `super({ dependencies: ["db"] })`).
- **`start()` after `shutdown()`.** Shutdown disposes the lifecycle, so it throws. Use `stop()` when you mean to start again.
- **Expecting a throw with `continueOnStartError`.** The app stays `running`; the failure is only in `applicationRuntime.getStatus().bootstrap.errors`. Check it.

## RELATED PACKAGES

- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — a standalone dependency container with more features than the one bundled here.
- [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md) — environment, file and schema-validated sources for `ConfigurationManager`.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — transports and formatting beyond `ConsoleLogger`; same `Logger` interface.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — an HTTP server you wire in as a participant or module.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `ApplicationError` base every core error extends.

## COMPLETE EXPORT INDEX

Every name `@zudojs/core` exports from its package root at v1.2.1 — **432** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 432 exports**

Classes (79)

`AdapterNotFoundError` `Application` `ApplicationContext` `BaseConfigurationSource` `BaseLogger` `BaseModule` `CircularModuleDependencyError` `Configuration` `ConfigurationConflictError` `ConfigurationError` `ConfigurationLoader` `ConfigurationLoadError` `ConfigurationManager` `ConfigurationMissingError` `ConfigurationNotFoundError` `ConfigurationPathError` `ConfigurationRedactor` `ConfigurationRegistry` `ConfigurationSchemaError` `ConfigurationSchemaRegistry` `ConfigurationSourceError` `ConfigurationTypeError` `ConfigurationValidationError` `ConsoleLogger` `Container` `ContainerScope` `ContextStorage` `ContextValues` `DefaultConfigurationProvider` `DefaultContextProvider` `DefaultModuleContext` `DefaultModuleRegistry` `DefaultRuntime` `DefaultRuntimeBootstrap` `DefaultRuntimeEnvironment` `DefaultRuntimeShutdown` `DependencyResolutionError` `DuplicateModuleError` `ExecutionContextNotFoundError` `FrameworkError` `InvalidArgumentError` `InvalidModuleDefinitionError` `InvalidModuleDependencyError` `InvalidModuleInstanceError` `InvalidModuleStateError` `InvalidProviderError` `InvalidRuntimeStateError` `InvalidRuntimeTransitionError` `InvalidStateError` `Lifecycle` `LifecycleManager` `LifecycleRegistry` `LifecycleScope` `LoggerFactory` `MissingEnvironmentVariableError` `MissingModuleDependencyError` `ModuleError` `ModuleInstantiationError` `ModuleLifecycleError` `ModuleLifecycleManager` `ModuleLoader` `ModuleLoadError` `ModuleNotFoundError` `ModuleOperationError` `ModuleOperationInProgressError` `ModuleVersionMismatchError` `ProviderAlreadyRegisteredError` `ProviderNotFoundError` `RuntimeCancellationError` `RuntimeDependencyError` `RuntimeError` `RuntimeInitializationError` `RuntimeLoadError` `RuntimeNotReadyError` `RuntimeSignalManager` `RuntimeStartError` `RuntimeStopError` `RuntimeTimeoutError` `RuntimeUnsupportedOperationError`

Functions (136)

`applyConfigurationSchemaDefaults` `applyConfigurationSourceEntries` `assertRuntimeMode` `assertRuntimeRole` `assertRuntimeState` `assertRuntimeTransition` `canStartRuntime` `canStopRuntime` `canTransitionRuntime` `createApplication` `createConfiguration` `createConfigurationEventBase` `createConfigurationFailedEvent` `createConfigurationInitializingEvent` `createConfigurationKey` `createConfigurationLoadedEvent` `createConfigurationLoader` `createConfigurationManager` `createConfigurationProvider` `createConfigurationReadyEvent` `createConfigurationRedactor` `createConfigurationRegistry` `createConfigurationReloadedEvent` `createConfigurationReloadingEvent` `createConfigurationSchema` `createConfigurationSchemaRegistry` `createConfigurationSource` `createConfigurationValidatedEvent` `createContextKey` `createContextProvider` `createContextSnapshot` `createContextStorage` `createContextValues` `createExecutionContext` `createExecutionId` `createHandler` `createLoggerContext` `createLogRedactor` `createModule` `createModuleContext` `createModuleDependency` `createModuleDependencyGraph` `createModuleLifecycleManager` `createModuleLoader` `createModuleMetadata` `createModuleRegistry` `createRuntime` `createRuntimeEnvironment` `createRuntimeError` `createRuntimeExecutionContext` `createRuntimeId` `createRuntimeIdentity` `createRuntimeStateSnapshot` `createRuntimeStateTransition` `createToken` `deepFreezeModuleOptions` `defineModule` `deleteContextValue` `deriveContextSnapshot` `deriveExecutionContext` `describeConfigurationCause` `describeToken` `detectCI` `detectContainer` `detectHostInfo` `detectPlatform` `detectProcessInfo` `detectRuntimeEngine` `findModuleDependencyCycle` `getContextValue` `getDefaultContextStorage` `getExecutionDuration` `getLifecycleErrorCode` `getModuleMetadataSummary` `getNextRuntimeStates` `getRuntimeStateLabel` `getRuntimeStates` `hasContextValue` `hasDestroyHook` `hasInitializeHook` `hasModuleDependencyCycle` `hasModuleErrorCode` `hasModuleVersionConstraint` `hasRuntimeErrorCode` `hasStartHook` `hasStopHook` `isLogLevel` `isModule` `isModuleContext` `isModuleDefinition` `isModuleDeprecated` `isModuleEnabledForEnvironment` `isModuleError` `isModuleExperimental` `isModuleRegistration` `isOptionalModuleDependency` `isRuntimeError` `isRuntimeFailed` `isRuntimeMode` `isRuntimeReady` `isRuntimeRole` `isRuntimeState` `isRuntimeTerminal` `isRuntimeTransitioning` `loggerContextFromExecution` `mergeModuleMetadata` `moduleToDefinition` `normalizeConfigurationPath` `normalizeDependencies` `normalizeModuleDependencies` `normalizeModuleDependency` `redactConfiguration` `requireConfigurationPath` `requireContextValue` `resolveLogLevel` `resolveModuleShutdownOrder` `resolveModuleStartupOrder` `resolveRuntimeOptions` `restoreContextSnapshot` `safeLogStringify` `sanitizeLogValue` `satisfiesModuleVersionConstraint` `serializeLogError` `setContextValue` `shouldLog` `sortConfigurationSources` `toModuleError` `toRuntimeError` `validateConfiguration` `validateConfigurationOrThrow` `validateModuleDependencies` `validateModuleDependencyGraph` `validateRuntimeOptions` `validateSchema` `withExecutionMetadata` `withRuntimeTimeout`

Interfaces (129)

`Adapter` `ApplicationContextOptions` `ApplicationOptions` `ClassProvider` `ConfigurationEntry` `ConfigurationErrorIssue` `ConfigurationEvent` `ConfigurationFailedEvent` `ConfigurationInitializingEvent` `ConfigurationKey` `ConfigurationLoadedEvent` `ConfigurationLoaderOptions` `ConfigurationLoadResult` `ConfigurationManagerOptions` `ConfigurationManagerResult` `ConfigurationOptions` `ConfigurationProvider` `ConfigurationProviderOptions` `ConfigurationReadyEvent` `ConfigurationRedactorOptions` `ConfigurationReloadedEvent` `ConfigurationReloadingEvent` `ConfigurationSchema` `ConfigurationSchemaOptions` `ConfigurationSection` `ConfigurationSectionOptions` `ConfigurationSensitivity` `ConfigurationSource` `ConfigurationSourceEntry` `ConfigurationSourceOptions` `ConfigurationValidatedEvent` `ConfigurationValidationContext` `ConfigurationValidationIssue` `ConfigurationValidationOptions` `ConfigurationValidationReport` `ConfigurationValidationResult` `ContainerOptions` `ContextKey` `ContextProvider` `ContextSnapshot` `CreateApplicationOptions` `CreateExecutionContextInput` `CreateModuleContextOptions` `DefineModuleOptions` `Disposable` `ExecutionContext` `FactoryProvider` `Handler` `LifecycleManagerOptions` `LifecycleOptions` `LifecycleParticipant` `LifecycleRegistration` `LifecycleScopeOptions` `LogEntry` `LogError` `LogErrorSerializationOptions` `Logger` `LoggerContext` `LoggerFactoryOptions` `LoggerOptions` `LogRedactorOptions` `Module` `ModuleContext` `ModuleContextDependencies` `ModuleContextInfo` `ModuleDefinition` `ModuleDependency` `ModuleDependencyDefinition` `ModuleDependencyGraph` `ModuleDependencyNode` `ModuleDependencyNodeInput` `ModuleErrorDetails` `ModuleLifecycle` `ModuleLifecycleOptions` `ModuleLifecyclePhaseOptions` `ModuleLifecycleResult` `ModuleLifecycleSkip` `ModuleLifecycleState` `ModuleLoaderOptions` `ModuleLoadResult` `ModuleMetadata` `ModuleMetadataOptions` `ModuleRegisterOptions` `ModuleRegistration` `ModuleRegistry` `ModuleRegistryEvent` `ModuleRegistryOptions` `OnDestroy` `OnInitialize` `OnStart` `OnStop` `ResolvedRuntimeOptions` `Runtime` `RuntimeBootstrap` `RuntimeBootstrapDependencies` `RuntimeBootstrapErrorInfo` `RuntimeBootstrapOptions` `RuntimeBootstrapResult` `RuntimeDependencies` `RuntimeDiagnosticsOptions` `RuntimeEngineInfo` `RuntimeEnvironment` `RuntimeEnvironmentInfo` `RuntimeEnvironmentOptions` `RuntimeEnvironmentOverrides` `RuntimeErrorOptions` `RuntimeExecutionContext` `RuntimeExecutionMetadata` `RuntimeHostInfo` `RuntimeIdentity` `RuntimeOptions` `RuntimeProcessInfo` `RuntimeShutdown` `RuntimeShutdownConfig` `RuntimeShutdownDependencies` `RuntimeShutdownErrorInfo` `RuntimeShutdownOptions` `RuntimeShutdownResult` `RuntimeSignalHandlers` `RuntimeSignalManagerOptions` `RuntimeSignalOptions` `RuntimeSignalTarget` `RuntimeStartupOptions` `RuntimeStateSnapshot` `RuntimeStateTransition` `RuntimeStatus` `RuntimeTimeoutOptions` `RuntimeTiming` `ValueProvider`

Type aliases (63)

`ApplicationState` `ConfigurationEntrySource` `ConfigurationEventListener` `ConfigurationEventSubscription` `ConfigurationEventTypeValue` `ConfigurationLifecycleEvent` `ConfigurationSourceType` `ConfigurationValidator` `ConfigurationValue` `ConfigurationValueSource` `Constructor` `ConstructorToken` `Context` `ContextType` `ContextValueStore` `CreateContextOptions` `ExecutionContextOverrides` `FrameworkErrorJSON` `HandlerFunction` `LifecycleComponent` `LifecycleHook` `LogContext` `LoggerImplementation` `LogLevelOption` `LogRedactionHook` `ManagedLifecycleComponent` `ModuleCategory` `ModuleContextResolver` `ModuleDependencies` `ModuleDependencyInput` `ModuleEnvironment` `ModuleFactory` `ModuleId` `ModuleLifecycleHookName` `ModuleLifecycleHooks` `ModuleLifecyclePhase` `ModuleLifecycleStep` `ModuleOptions` `ModuleRegistrationState` `ModuleRegistryEventType` `ModuleRegistryListener` `Provider` `RedactedConfiguration` `RuntimeBootstrapPhase` `RuntimeContext` `RuntimeEngine` `RuntimeEnvironmentSummary` `RuntimeEnvironmentVariables` `RuntimeErrorJSON` `RuntimeErrorMetadata` `RuntimeErrorPhase` `RuntimeFactory` `RuntimeLifecycleState` `RuntimeMode` `RuntimeOperation` `RuntimePlatform` `RuntimeProcessEvent` `RuntimeRole` `RuntimeShutdownPhase` `RuntimeTerminationSignal` `Scope` `TimeoutAwareOperation` `Token`

Constants (23)

`ConfigurationEventType` `createContext` `createRuntimeContext` `DEFAULT_LOG_LEVEL` `DEFAULT_LOGGER_OPTIONS` `DEFAULT_REDACTION_VALUE` `DEFAULT_RUNTIME_OPTIONS` `DEFAULT_SENSITIVE_PATTERNS` `defaultContextStorage` `ErrorCode` `ErrorCodeType` `LifecycleScopeState` `LifecycleState` `LogLevel` `LogLevelPriority` `LogLevelType` `ModuleErrorCode` `ModuleErrorCodeType` `RuntimeErrorCode` `STARTABLE_RUNTIME_STATES` `STOPPABLE_RUNTIME_STATES` `TERMINAL_RUNTIME_STATES` `TRANSITIONAL_RUNTIME_STATES`

Enums (2)

`ConfigurationManagerState` `RuntimeState`
