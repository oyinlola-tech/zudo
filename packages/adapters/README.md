# @zudojs/adapters

Boundary layer between Zudojs and external platforms with adapter contracts, registry, capabilities, and transport abstractions.

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
transition leaves resources nobody is tracking.

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

Declared capabilities: `http`, `websocket`, `streaming`, `filesystem`, `tcp`,
`udp`, `backgroundTasks`, `longRunning`, `edgeRuntime`, `serverless`,
`gracefulShutdown`, `abortSignal`.

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
base contract.

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
