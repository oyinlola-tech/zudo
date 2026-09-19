---
title: "@zudojs/plugins — Plugin System Documentation"
description: "Complete documentation for @zudojs/plugins — the controlled extension system for Zudojs applications."
source: https://zudojs.oyinlola.site/docs/packages-plugins
---

v1.1.0

# @zudojs/plugins

Controlled extension system for the Zudojs framework. Provides plugin registration, dependency resolution with cycle detection, lifecycle management, and orchestration for Zudojs applications.

PLUGINS EXTENSIONS LIFECYCLE DEPENDENCIES

## OVERVIEW

A *plugin* is optional functionality added to an application after the core is built, like a browser extension: the browser works without it. `@zudojs/plugins` gives you a manager that installs, starts, stops and cleans up plugins for you.

Plugins often need each other. You declare that need and the manager works out the start order, refuses to start if something is missing, and shuts everything down in reverse.

This is different from a *module*. A module (see [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) and [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md)) is a permanent part of your own application, such as your users or orders feature. A plugin is bolted on from outside, possibly by someone else, and possibly absent. Modules describe what your app *is*; plugins describe what it can be *extended with*.

Use it when

- Third parties (or other teams) add features to your app
- Features must start in a specific order because they depend on each other
- You need a clean shutdown that releases timers, sockets and connections
- You want a health report of which extensions are running or failed

Skip it when

- The code is a fixed part of your app; use a module instead
- You only have one extension and no ordering concerns; a plain function call is simpler
- You need to load code from disk at runtime; this package only orchestrates objects you already have

## INSTALLATION

Install the package. Its three helper packages (`@zudojs/errors`, `@zudojs/constants`, `@zudojs/types`) are pulled in automatically.

```bash
$ npm install @zudojs/plugins
```

> **Note:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This example defines one plugin, registers it with a manager, starts it, checks that it is healthy, and stops it.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

const greeter: Plugin = {
  metadata: { name: "greeter", version: "1.0.0" },
  start() {
    console.log("greeter started");
  },
  stop() {
    console.log("greeter stopped");
  },
};

const manager = new PluginManager();
manager.register(greeter);

const context = createPluginContext({ name: "my-app" });

await manager.start(context);
console.log(manager.diagnostics().healthy);

await manager.stop(context);
```

What you should see, in order:

```ts
greeter started
1
greeter stopped
```

`register()` told the manager the plugin exists, `start()` ran its hooks, and `stop()` shut it down. The *context* is the bag of shared services (logger, config, and so on) every plugin receives; here it holds only a name.

## WRITING A PLUGIN

A plugin is a plain object. It has one required field, `metadata`, and up to five optional functions called *lifecycle hooks*. A hook is a function the manager calls at a fixed moment: when the plugin is installed, started, stopped, and so on. You only write the hooks you need.

```ts
interface Plugin<TOptions = unknown> {
  readonly metadata: PluginMetadata;
  readonly dependencies?: readonly PluginDependency[];
  readonly optionalDependencies?: readonly PluginDependency[];

  install?(context: PluginContext, options: TOptions): void | Promise<void>;
  initialize?(context: PluginContext): void | Promise<void>;
  start?(context: PluginContext): void | Promise<void>;
  stop?(context: PluginContext): void | Promise<void>;
  dispose?(context: PluginContext): void | Promise<void>;
}
```

| Hook | When the manager calls it | Put here |
| --- | --- | --- |
| install(context, options) | First, once. Receives the options you passed to `register()`. | Register services, validate options. |
| initialize(context) | After every plugin has installed. | Open connections, load data. |
| start(context) | After every plugin has initialized. | Begin real work: listen, poll, schedule. |
| stop(context) | On shutdown, before dispose. | Stop accepting work. |
| dispose(context) | Last. Also runs if startup failed part-way. | Release what is left. |

`metadata.name` is the plugin's unique key. `metadata.version` is optional unless another plugin requires a version range (see [Dependencies](#dependencies)).

This plugin takes options. The type parameter gives their shape, and `register()` passes them to `install`.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

const banner: Plugin<{ text: string }> = {
  metadata: { name: "banner", version: "1.0.0", description: "Prints a banner" },
  install(context, options) {
    console.log(`[${context.plugin.name}] ${options.text}`);
  },
};

const manager = new PluginManager();
manager.register(banner, { text: "hello" });

await manager.start(createPluginContext({ name: "my-app" }));
// prints: [banner] hello
```

> **Watch out:** a hook that throws stops the whole startup. The manager rolls back everything it already started and rethrows your original error. Validate early, in `install`, so a bad configuration fails before any connection is opened.

## THE PLUGIN CONTEXT

Every hook receives a `PluginContext`. It carries the shared services you handed to `createPluginContext()`, plus three things the manager adds for each plugin: the plugin's own metadata, an abort signal, and a way to register cleanup.

```ts
interface PluginContext {
  readonly plugin: PluginMetadata;      // this plugin's own metadata
  readonly container?: PluginContainer; // { register(token, provider) }
  readonly config?: PluginConfig;       // { get(key) }
  readonly logger?: PluginLogger;       // { info, warn, error }
  readonly events?: PluginEvents;       // { on, off, emit }
  readonly signal: AbortSignal;         // aborted on shutdown

  onDispose(handler: () => void | Promise<void>): void;
  registerDisposable(disposable: PluginDisposable): void;
}
```

The four service fields are optional, tiny interfaces; any object with matching method names will do. Cleanup is the important part: call `context.onDispose()` right where you acquire something. The manager runs those handlers in reverse order at disposal, and never twice.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";

const manager = new PluginManager();

manager.register({
  metadata: { name: "ticker" },
  install(context) {
    const timer = setInterval(() => context.logger?.info("tick"), 1000);
    context.onDispose(() => clearInterval(timer));

    context.signal.addEventListener("abort", () => {
      context.logger?.info("ticker asked to stop");
    });
  },
});

const logger = { info: console.log, warn: console.warn, error: console.error };
const context = createPluginContext({ name: "my-app" }, { logger });

await manager.start(context);
await manager.stop(context);
// prints: ticker asked to stop   (and the interval is cleared)
```

On `stop()` the manager aborts `context.signal` first, then runs the dispose handlers. Pass the signal to `fetch` or any API that accepts an `AbortSignal` and that work is cancelled for free.

> **In plain words:** the context you create is a template. The manager makes a private copy per plugin, so `context.plugin.name` inside a hook is that plugin's name and its cleanup belongs to it alone. Calling `onDispose` on the template outside a hook does nothing useful.

## DEPENDENCIES

A dependency is another plugin that must be running before yours starts. List it under `dependencies`. The manager starts dependencies first and stops them last. Here `reports` needs `database`; registration order does not matter.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";

const manager = new PluginManager();

manager.register({
  metadata: { name: "reports", version: "1.0.0" },
  dependencies: [{ name: "database", version: "^2.0.0" }],
  start() { console.log("reports up"); },
  stop() { console.log("reports down"); },
});

manager.register({
  metadata: { name: "database", version: "2.3.1" },
  start() { console.log("database up"); },
  stop() { console.log("database down"); },
});

const context = createPluginContext({ name: "my-app" });
await manager.start(context);
await manager.stop(context);
```

```ts
database up
reports up
reports down
database down
```

Three rules apply, all checked when you call `start()`:

- A required dependency that was never registered throws `PluginDependencyError`: *Plugin "reports" depends on "database" which is not registered.*
- Two plugins that need each other (a *cycle*) throw `PluginDependencyCycleError`. The manager cannot pick which to start first.
- A `version` on a dependency is a range in npm style: `^2.0.0`, `~1.2.0`, `>=1.0.0`, exact `1.2.3`, or `*`. If the registered plugin's `metadata.version` does not satisfy it (or is missing), startup throws `PluginDependencyError`.

`optionalDependencies` work the same way for ordering, but a missing one is silently ignored. Use them when your plugin can integrate with another *if it happens to be present*.

> **Tip:** the manager uses `DependencyResolver` internally. You can call `new DependencyResolver().resolve(map)` yourself to inspect `ordered`, `missingDetails` and `cycles` without starting anything.

## LIFECYCLE AND STATES

Each registered plugin has a *state*: a single word that says where it is in its life. The manager only moves a plugin along allowed paths, so a plugin can never be started twice or disposed while running. Trying an invalid move throws `PluginStateError`.

The happy path runs left to right:

registered → installing → installed → initializing → initialized → starting → started
started → stopping → stopped → disposing → disposed

| From | Can move to |
| --- | --- |
| registered | installing, disposing |
| installing | installed, failed |
| installed | initializing, stopping, disposing, failed |
| initializing | initialized, failed |
| initialized | starting, stopping, disposing, failed |
| starting | started, failed |
| started | stopping |
| stopping | stopped, failed |
| stopped | disposing, starting |
| disposing | disposed, failed |
| disposed | *none (final)* |
| failed | disposing |

You can ask the same table a question with `isValidTransition()`.

```ts
import { isValidTransition } from "@zudojs/plugins";

console.log(isValidTransition("registered", "installing")); // true
console.log(isValidTransition("registered", "started"));    // false
```

When any hook throws during `start()`, the failing plugin moves to `failed`, every plugin that already came up is stopped and disposed, and the original error is thrown to you. Nothing is left half-running.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";

const manager = new PluginManager();
manager.register({ metadata: { name: "ok" }, dispose() { console.log("ok disposed"); } });
manager.register({ metadata: { name: "broken" }, install() { throw new Error("boom"); } });

try {
  await manager.start(createPluginContext({ name: "my-app" }));
} catch (error) {
  console.log((error as Error).message);              // boom
  console.log(manager.diagnostics().failed);            // 1
}
// "ok disposed" is printed before the catch block runs
```

> **Watch out:** `manager.stop()` disposes every plugin, and `disposed` is final: a further `start()` throws `PluginStateError`. To run the same plugins again, unregister and re-register them, or create a new `PluginManager`.

## MANAGER OPTIONS

`new PluginManager(options)` accepts four optional settings. All of them are about failure: how long to wait, who hears about errors, and what plugins are allowed to ask for.

| Option | What it does | Default |
| --- | --- | --- |
| hookTimeout | Milliseconds a single hook may run. A hook that overruns throws `PluginTimeoutError`. | `0` (no limit) |
| onError(error, pluginName) | Called for each failure during `stop()`. Shutdown continues past the failing plugin. | logs to `console.error` |
| checkVersions | Enforce `version` ranges on dependencies at `start()`. | `true` |
| allowedCapabilities | List of strings a plugin's `metadata.capabilities` may contain. Anything else is rejected at `register()`. | unset (allow all) |

This manager gives every hook two seconds and collects shutdown errors instead of printing them.

```ts
import { PluginManager, createPluginContext } from "@zudojs/plugins";

const failures: string[] = [];

const manager = new PluginManager({
  hookTimeout: 2000,
  onError: (error, pluginName) => failures.push(pluginName),
  allowedCapabilities: ["http"],
});

manager.register({
  metadata: { name: "web", capabilities: ["http"] },
  stop() { throw new Error("could not close"); },
});

const context = createPluginContext({ name: "my-app" });
await manager.start(context);
await manager.stop(context);

console.log(failures); // [ "web" ]
```

A *capability* is just a label a plugin puts on itself, such as `"http"` or `"filesystem"`. With `allowedCapabilities` set, registering a plugin that claims `"filesystem"` throws `PluginRegistrationError` before it can run any code.

## DIAGNOSTICS AND EVENTS

`manager.diagnostics()` returns a snapshot of every plugin: its state, whether it ever failed, its dependencies, and a health label. A plugin is `healthy` when started, `unhealthy` when it failed, and `degraded` in every other state.

```ts
const report = manager.diagnostics();

console.log(report.total, report.healthy, report.degraded, report.unhealthy, report.failed);
console.log(report.plugins[0]?.state, report.plugins[0]?.health.status); // started healthy
```

If your context has an `events` object, the manager emits an event at every state change. Subscribe *before* calling `start()`. Node's built-in `EventEmitter` has the right shape.

```ts
import { EventEmitter } from "node:events";
import { PluginManager, createPluginContext, PLUGIN_EVENTS } from "@zudojs/plugins";
import type { PluginLifecycleEvent } from "@zudojs/plugins";

const events = new EventEmitter();
events.on(PLUGIN_EVENTS.STARTED, (event: PluginLifecycleEvent) => {
  console.log(`${event.plugin.name}: ${event.previousState} -> ${event.state}`);
});

const manager = new PluginManager();
manager.register({ metadata: { name: "greeter" } });

await manager.start(createPluginContext({ name: "my-app" }, { events }));
// prints: greeter: starting -> started
```

Event names live on `PLUGIN_EVENTS`: `INSTALLING`, `INSTALLED`, `INITIALIZING`, `INITIALIZED`, `STARTING`, `STARTED`, `STOPPING`, `STOPPED`, `DISPOSING`, `DISPOSED` and `FAILED`. Each event payload is a `PluginLifecycleEvent` with `plugin`, `state`, `previousState`, `timestamp` and, on failure, `error`.

> **Note:** `PLUGIN_EVENTS.REGISTERED` exists as a constant, but `register()` does not emit it. Events start with `INSTALLING`. A listener that throws is logged and does not interrupt the lifecycle.

## API REFERENCE

Everything below is exported from `@zudojs/plugins`.

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| PluginManager | The one class most apps use. `register(plugin, options?)`, `unregister(name)`, `get(name)`, `has(name)`, `list()`, `start(context)`, `stop(context)`, `diagnostics()`. | Constructor takes `PluginManagerOptions`. `unregister` only works before start or after dispose. |
| PluginRegistryImpl | Stores plugins with their state. `register`, `get`, `has`, `list`, `remove`, `clear`. | Used inside the manager. `get()` returns a `RegisteredPlugin` wrapper, not the plugin itself. |
| DependencyResolver | `resolve(map)` returns `{ ordered, missing, missingDetails, cycles }`. | Map keys are plugin names; values are `{ dependencies?, optionalDependencies? }`. |
| LifecycleController | Runs one phase at a time: `install`, `initialize`, `start`, `stop`, `dispose` on a `RegisteredPlugin`. | Low level; reach for it only when building your own manager. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createPluginContext(metadata, options?) | Builds the template context you pass to `start()` and `stop()`. | Options: `container`, `config`, `logger`, `events`, `disposables`, `abortController`. |
| createOwnedPluginContext(metadata, options?) | Same, but also returns the `disposables` array and an `abort()` function. | For tests and custom managers that need to trigger teardown themselves. |
| assertResolutionValid(resolution) | Throws `PluginDependencyError` or `PluginDependencyCycleError` if a resolution has problems. | Pairs with `DependencyResolver.resolve()`. |
| satisfiesVersion(version, range) | Returns `true`, `false`, or `undefined` if the range is not understood. | Supports `^`, `~`, `>=`, `>`, `<=`, `<`, exact and `*`. |
| parseVersion(text) | Splits `"1.2.3-beta"` into `{ major, minor, patch, prerelease }`. | Returns `undefined` for non-semver text. |
| compareVersions(a, b) | Negative, zero or positive, like a sort comparator. | Takes parsed versions, not strings. |
| assertDependencyVersions(map) | Throws on the first plugin whose dependency range is not satisfied. | The manager calls this when `checkVersions` is on. |
| isValidTransition(from, to) | Checks the state table. | The table itself is `VALID_STATE_TRANSITIONS`. |
| createPluginLifecycleEvent(metadata, state, previousState?, error?) | Builds a `PluginLifecycleEvent` with a timestamp. | Useful when replaying or faking events in tests. |
| buildDiagnosticReport(entries) | Turns `{ plugin, state, failed?, error? }` entries into a `PluginDiagnosticReport`. | `manager.diagnostics()` calls this for you. |
| createHealthyHealth() / createDegradedHealth(details?) / createUnhealthyHealth(details?) | Build a `PluginHealth` value. | Handy when your plugin reports its own health. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| PLUGIN_EVENTS | Event name strings such as `"plugin:started"`. | See [Diagnostics and events](#diagnostics-and-events). |
| VALID_STATE_TRANSITIONS | Map from each `PluginState` to the states it may move to. | Frozen; read only. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| Plugin<TOptions> | The plugin object shape. | See [Writing a plugin](#writing-a-plugin). |
| PluginMetadata | `name` (required), `version`, `description`, `author`, `homepage`, `keywords`, `capabilities`. | All strings or string arrays. |
| PluginDependency | `{ name, version?, optional? }`. | Put optional ones in `optionalDependencies`. |
| PluginContext | What hooks receive. | See [The plugin context](#plugin-context). |
| PluginContainer, PluginConfig, PluginLogger, PluginEvents, PluginDisposable | The small service interfaces a context can carry. | Structural: any object with the methods qualifies. |
| PluginManagerOptions | Constructor options for `PluginManager`. | See [Manager options](#manager-options). |
| PluginState | The twelve state names. | Includes `"failed"`. |
| PluginDiagnosticReport, PluginDiagnostic, PluginHealth, PluginHealthStatus | Shape of `diagnostics()` output. | `PluginHealthStatus` is `"healthy" \| "degraded" \| "unhealthy"`. |
| PluginLifecycleEvent, DependencyResolution, MissingDependency, ResolvablePlugin, PluginRegistry, RegisteredPlugin, CreatePluginContextOptions, OwnedPluginContext | Payload and input/output types of the events, resolver, registry and context factories. | Low level. |

### Errors

All error classes come from `@zudojs/errors` and are re-exported here. Every one extends `PluginError`, so `isPluginError(error)` catches them all.

| Name | When you see it | Notes |
| --- | --- | --- |
| PluginRegistrationError | `register()` got a plugin with no name, or one requesting a capability not in `allowedCapabilities`. Also thrown if `start()` is called while another start is running. |  |
| PluginAlreadyRegisteredError | Registering a name twice. | Check `manager.has(name)` first if re-registration is expected. |
| PluginDependencyError | Missing dependency, or a version range not satisfied. | The message names both plugins. |
| PluginDependencyCycleError | Plugins depend on each other in a loop. |  |
| PluginStateError | An operation is not allowed from the plugin's current state. | Also thrown by `unregister()` on a running plugin. |
| PluginTimeoutError | A hook exceeded `hookTimeout`. | Message: *Plugin "x" timed out after 2000ms.* |
| PluginDisposeError | One or more dispose handlers threw. | Has an `errors` array with every failure; reported through `onError`. |
| PluginError, PluginNotFoundError, PluginInitializationError, PluginStartError, PluginStopError | Exported for your own plugin code. | The manager rethrows your hook's original error rather than wrapping it in these. |
| createPluginError(), isPluginError() | Factory and type guard. |  |

## COMMON MISTAKES

- **Registering after `start()`.** The new plugin is stored but never started, and `diagnostics()` shows it as `degraded`. Register everything first, then call `start()` once.
- **Calling `start()` again after `stop()`.** Every plugin is `disposed`, which is final, so `start()` throws `PluginStateError`. Unregister and re-register the plugins, or build a new `PluginManager`.
- **Cleaning up in `stop()` only.** If startup fails half-way, `stop` is never called on plugins that had not started, but `dispose` and `onDispose` handlers are. Put resource release in `onDispose()` or `dispose()`.
- **Subscribing to events after `start()`.** The `STARTED` events have already fired. Attach listeners to your `events` object before you call `start()`.
- **Leaving `hookTimeout` at 0 in production.** One plugin whose `start()` never resolves hangs the whole boot with no error. Set a limit so you get a `PluginTimeoutError` naming the plugin.

## RELATED

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — modules, the built-in unit for your app's own features. Reach for modules before plugins.
- [Concepts: Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — what a module is and how it differs from a plugin.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — the same start/stop idea applied to the whole application rather than to plugins.
- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — a full event bus you can pass as the context's `events`.

## COMPLETE EXPORT INDEX

Every name `@zudojs/plugins` exports from its package root at v1.1.0 — **60** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 60 exports**

Classes (17)

`DependencyResolver` `LifecycleController` `PluginAlreadyRegisteredError` `PluginDependencyCycleError` `PluginDependencyError` `PluginDependencyVersionError` `PluginDisposeError` `PluginError` `PluginInitializationError` `PluginManager` `PluginNotFoundError` `PluginRegistrationError` `PluginRegistryImpl` `PluginStartError` `PluginStateError` `PluginStopError` `PluginTimeoutError`

Functions (15)

`assertDependencyVersions` `assertResolutionValid` `buildDiagnosticReport` `compareVersions` `createDegradedHealth` `createHealthyHealth` `createOwnedPluginContext` `createPluginContext` `createPluginError` `createPluginLifecycleEvent` `createUnhealthyHealth` `isPluginError` `isValidTransition` `parseVersion` `satisfiesVersion`

Interfaces (24)

`CreatePluginContextOptions` `DependencyResolution` `LifecycleControllerOptions` `MissingDependency` `OwnedPluginContext` `Plugin` `PluginConfig` `PluginContainer` `PluginContext` `PluginDependency` `PluginDiagnostic` `PluginDiagnosticReport` `PluginDisposable` `PluginErrorOptions` `PluginEvents` `PluginHealth` `PluginLifecycleEvent` `PluginLogger` `PluginManagerOptions` `PluginMetadata` `PluginRegistry` `RegisteredPlugin` `ResolvablePlugin` `SemVer`

Type aliases (2)

`PluginHealthStatus` `PluginState`

Constants (2)

`PLUGIN_EVENTS` `VALID_STATE_TRANSITIONS`
