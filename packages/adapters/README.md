# @zudojs/adapters

Boundary layer between Zudojs and external platforms with adapter contracts, registry, capabilities, and transport abstractions.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-adapters](https://zudojs.oyinlola.site/docs/packages-adapters) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-adapters.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/adapters
```

## Quick Start

```typescript
import { AdapterRegistry } from "@zudojs/adapters";
import type { Adapter } from "@zudojs/adapters";

const registry = new AdapterRegistry();

const postgres: Adapter = {
  name: "postgres",
  version: "1.0.0",
  // Capabilities are a declaration object, not a list of method names.
  capabilities: { longRunning: true, gracefulShutdown: true },
  initialize: async () => {
    /* open the pool */
  },
  dispose: async () => {
    /* close the pool */
  },
};

registry.register(postgres);

registry.get("postgres"); // Adapter | undefined
registry.require("postgres"); // throws AdapterNotFoundError when absent
```

Names are case-insensitive: they are trimmed and lowercased for registration
and lookup, and `getNames()` reports them in that form. A name that is blank
after trimming is rejected with `AdapterConfigurationError` — it could never
be looked up again. Registering the same name twice throws
`AdapterAlreadyRegisteredError`.

## Lifecycle

An adapter may implement `initialize()`, `start()`, `stop()` and `dispose()`.
The registry drives them across everything it holds:

```typescript
await registry.initializeAll(); // prepare resources
await registry.startAll(); // begin processing
await registry.stopAll(); // stop processing, stay registered
await registry.disposeAll(); // stop, dispose, and empty the registry
```

Each of these attempts every adapter and then throws an `AggregateError`
carrying the failures, rather than stopping at the first one — a half-applied
transition leaves resources nobody is tracking. From `initializeAll()`,
`startAll()` and `stopAll()` every entry in `errors` is typed and names its
adapter — `AdapterInitializationError`, `AdapterOperationError` (operation
`"start"` or `"stop"`), or `AdapterTimeoutError` when the hook exceeded
`timeout` — with the hook's own error as `cause`. `disposeAll()` and
`removeAndDispose()` rethrow the hooks' own errors (an `AggregateError` of
both when `stop()` and `dispose()` both failed).

`initializeAll()` and `startAll()` run in registration order; `stopAll()` and
`disposeAll()` run in reverse, so an adapter is torn down before the ones
registered ahead of it that it may depend on. `initializeAll()`,
`startAll()` and `stopAll()` take the same `AdapterOperationOptions` as
`healthAll()`: `timeout` bounds each hook, `retry: { attempts, delay }`
re-runs a failed one, and `signal` stops the pass.
`runAdapterLifecycle(adapter, "start", options)` runs one hook the same way,
and `withRetry` is exported for your own operations.

`remove()` and `clear()` only drop references; `removeAndDispose()` and
`disposeAll()` also release resources.

## Capabilities

Adapters declare what they support so runtime code can pick one that can do
the job:

```typescript
registry.findByCapability("http"); // every adapter declaring http
registry.supports("postgres", "gracefulShutdown"); // boolean, never throws
registry.requireCapability("edge", "streaming"); // throws AdapterCapabilityMissingError
```

Well-known capabilities (`KnownAdapterCapabilities`): `http`, `websocket`,
`streaming`, `filesystem`, `tcp`, `udp`, `backgroundTasks`, `longRunning`,
`edgeRuntime`, `serverless`, `gracefulShutdown`, `abortSignal`.
`AdapterCapabilities` is open: an adapter may declare any other name
(`capabilities: { refunds: true }`) and `findByCapability("refunds")`,
`supports()` and `requireCapability()` look it up like any other.

## Health

```typescript
import {
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "@zudojs/adapters";

const health = createDegradedHealth("replica lag above threshold");
```

A `LifecycleAdapter` adds optional `configure(options)` and `health()` to the
base contract. The registry calls them:

```typescript
import {
  AdapterRegistry,
  createHealthyHealth,
  createMockAdapter,
} from "@zudojs/adapters";

const registry = new AdapterRegistry();
registry.register(
  createMockAdapter({
    name: "db",
    health: () => createHealthyHealth(),
    configure: () => {},
  }),
);

await registry.configure("db", { poolSize: 10 }); // throws if the adapter has no configure()
const report = await registry.healthAll({ timeout: 2_000 });
report.status; // worst of the per-adapter statuses: "healthy" | "degraded" | "unhealthy"
report.adapters.db; // AdapterHealth; throwing, timed-out or aborted checks are "unhealthy"
```

Adapters without `health()` are left out of `report.adapters`; the rest appear
in registration order, whichever check finished first. `collectAdapterHealth`
and `configureAdapter` are exported for registries of your own.

`healthAll({ retry: { attempts, delay } })` re-runs a check that reports
`unhealthy`, up to `attempts` tries in total, pausing `delay` ms between
them; `timeout` bounds each try and an aborted `signal` stops the retries.
Adapter names are checked on `register()`: `__proto__`, `constructor` and
`prototype` are refused, because a report keyed by adapter name cannot hold
them.

## Transport contracts

Type-only interfaces that extend `Adapter` for each transport:
`HTTPAdapter`, `HTTPServerAdapter`, `MessageAdapter`, `StorageAdapter`,
`QueueAdapter`, `RuntimeAdapter`, `WebSocketAdapter`, `CLIAdapter`,
`SchedulerAdapter`.

## Testing utilities

```typescript
import {
  createMockAdapter,
  createMockAdapterRegistry,
  createMockHealth,
} from "@zudojs/adapters";

const { registry } = createMockAdapterRegistry([
  createMockAdapter({ name: "fake-http", capabilities: { http: true } }),
]);
```

## Errors

Re-exported from `@zudojs/errors`: `AdapterError` · `AdapterNotFoundError` ·
`AdapterAlreadyRegisteredError` · `AdapterNotSupportedError` ·
`AdapterCapabilityMissingError` · `AdapterConnectionError` ·
`AdapterOperationError` · `AdapterTimeoutError` · `AdapterDisposeError` ·
`AdapterInitializationError` · `AdapterConfigurationError`.

## Use Cases

- Database adapters
- Message queue adapters
- Cache adapters
- External service integrations
