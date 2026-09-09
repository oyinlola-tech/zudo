# @zudojs/plugins

Plugin manager, registry, dependency resolver, lifecycle controller, events, and diagnostics. The basis for extending a Zudojs app with third-party functionality.

## When to use

Import this when you need:

- register extensions and bring them up in dependency order
- enforce declared dependency versions before anything starts
- run plugin lifecycle hooks (`install` → `initialize` → `start` → `stop` → `dispose`)
- give each plugin a scoped `PluginContext` with its own disposables and abort signal
- roll back cleanly when one plugin fails to start

## Installation

```bash
npm install @zudojs/plugins
```

## Quick start

```typescript
import { PluginManager, createPluginContext } from "@zudojs/plugins";

const manager = new PluginManager({ hookTimeout: 5_000 });

manager.register({
  metadata: { name: "@acme/db", version: "1.0.0" },
  async start(context) {
    const pool = openPool();
    // Released automatically, in reverse registration order, on dispose.
    context.registerDisposable({ dispose: () => pool.end() });
  },
});

manager.register({
  metadata: { name: "@acme/api" },
  dependencies: [{ name: "@acme/db", version: "^1.0.0" }],
  async start(context) {
    context.logger?.info("api started");
  },
});

const context = createPluginContext({ name: "@acme/host" });

await manager.start(context); // @acme/db first, then @acme/api
await manager.stop(context); // reverse order; disposables released
```

`createPluginContext` takes the host's own `PluginMetadata` and, optionally,
the services plugins may reach (`container`, `config`, `logger`, `events`).
The manager derives a per-plugin view of it: `context.plugin` names the
plugin currently running, `context.registerDisposable` and
`context.onDispose` write to that plugin's own cleanup list, and
`context.signal` is aborted when the plugin system shuts down.

## Lifecycle

| Phase | Called by | Runs |
| --- | --- | --- |
| `install(context, options)` | `manager.start` | once, in dependency order |
| `initialize(context)` | `manager.start` | after every plugin is installed |
| `start(context)` | `manager.start` | after every plugin is initialized |
| `stop(context)` | `manager.stop` | reverse dependency order |
| `dispose(context)` | `manager.stop` | after `stop`, releasing disposables |

Every hook is optional. Each phase completes across all plugins before the
next begins, so a plugin may rely on its dependencies being installed by
the time its own `initialize` runs.

If any phase throws, `manager.start` stops and disposes everything it had
already brought up, then rethrows. `manager.stop` continues past a failing
plugin so one bad `stop` cannot strand the rest; those failures are
reported through the `onError` option (and logged to `console.error` if you
do not supply one) rather than swallowed.

## Dependency order and versions

Required dependencies must be registered, or `start` throws
`PluginDependencyError` naming both the plugin that declared the dependency
and the dependency itself. Cycles throw `PluginDependencyCycleError` with
the cycle path. Optional dependencies that are present still participate in
ordering; optional dependencies that are absent are ignored.

Declared versions are enforced before any hook runs:

```typescript
manager.register({ metadata: { name: "@acme/db", version: "1.4.0" } });
manager.register({
  metadata: { name: "@acme/api" },
  dependencies: [{ name: "@acme/db", version: "^2.0.0" }],
});

await manager.start(context);
// PluginDependencyVersionError: Plugin "@acme/api" requires "@acme/db@^2.0.0",
// but version 1.4.0 is registered. Register a "@acme/db" that satisfies
// ^2.0.0, relax the constraint on "@acme/api", or construct the manager
// with { checkVersions: false }.
```

Supported range forms are an exact version (`1.2.3`), caret and tilde
(`^1.2.3`, `~1.2.3`), comparators (`>=1.2.3`, `>`, `<=`, `<`) and `*`.
Pass `{ checkVersions: false }` to skip the check.

## Manager options

```typescript
new PluginManager({
  checkVersions: true, // enforce declared dependency versions (default)
  hookTimeout: 5_000, // bound each lifecycle hook; 0 = unbounded (default)
  onError: (error, pluginName) => report(error, pluginName), // teardown failures
  allowedCapabilities: ["http", "db"], // reject plugins requesting anything else
  events: eventSink, // receives `plugin:registered`
});
```

## Events

Lifecycle events are emitted on `context.events` if you supply one, and
`plugin:registered` on the manager's own `events` option. Names are in
`PLUGIN_EVENTS`; payloads are `PluginLifecycleEvent`.

```typescript
import { PLUGIN_EVENTS } from "@zudojs/plugins";

const manager = new PluginManager({
  events: {
    on() {},
    off() {},
    emit(name, payload) {
      if (name === PLUGIN_EVENTS.REGISTERED) console.log(payload);
    },
  },
});
```

A throwing subscriber never fails the phase that emitted the event.

## Diagnostics

```typescript
const report = manager.diagnostics();

report.total; // plugins registered
report.healthy; // started and not failed
report.degraded; // registered but not started
report.unhealthy; // failed at some point
report.plugins[0].state; // "started" | "failed" | ...
report.plugins[0].health.details; // failure message, when unhealthy
```

A plugin that failed and was then disposed during rollback is still
reported as failed: the current state alone would not show it.

## License

MIT
