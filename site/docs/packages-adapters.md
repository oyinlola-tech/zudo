---
title: "@zudojs/adapters — Boundary Layer Documentation"
description: "Complete documentation for @zudojs/adapters — the boundary layer between Zudojs and external platforms."
source: https://zudojs.oyinlola.site/docs/packages-adapters
---

v1.2.0

# @zudojs/adapters

Boundary layer between Zudojs and external platforms. Provides adapter contracts, a registry, capabilities, and transport abstractions so your application code never touches platform-specific APIs.

BOUNDARY LAYER TRANSPORT PLATFORM AGNOSTIC

## INSTALLATION

```ts
// npm
npm install @zudojs/adapters

// pnpm
pnpm add @zudojs/adapters

// yarn
yarn add @zudojs/adapters
```

> **Runtime Dependencies:** @zudojs/adapters has exactly one runtime dependency, @zudojs/errors (v1.2.0), for its error hierarchy. The lifecycle, transport and capability contracts it publishes are plain TypeScript interfaces, so nothing else is installed for you.

## WHAT IT DOES

`@zudojs/adapters` is the boundary between your Zudojs application and the outside world. It defines:

- A base **Adapter** interface that all adapters implement
- An **AdapterRegistry** for registering, discovering, and managing adapters
- A **Capabilities** system so runtime code can adapt behavior based on platform support
- **Transport-specific** interfaces for HTTP, messaging, storage, queue, runtime, WebSocket, CLI, and scheduler
- **Lifecycle contracts** with health checks and operation options

> **Core Principle:** Application code never directly calls platform APIs. It calls adapter interfaces. The adapter translates between Zudojs and the platform.

## WHERE IT SITS

TRANSPORT LAYER (HTTP, RPC, CLI)

APPLICATION LAYER (CQRS, Events, Modules)

ADAPTER LAYER (@zudojs/adapters)

EXTERNAL PLATFORM (Node.js, Edge, Serverless)

Adapters sit below the transport layer. Transport packages use adapters to interact with platforms. Application code never directly calls platform APIs.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | 1.2.0 | Adapter error hierarchy (AdapterError, AdapterNotFoundError, AdapterConfigurationError, etc.) |

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

## CORE API — ADAPTER INTERFACE

### Interface: Adapter

Every adapter in the Zudojs ecosystem implements this contract:

```ts
interface Adapter {
  /** Unique adapter name. */
  readonly name: string;

  /** Adapter version. */
  readonly version?: string;

  /** Declared capabilities of this adapter. */
  readonly capabilities: AdapterCapabilities;

  /** Adapter metadata. */
  readonly metadata?: AdapterMetadata;

  /** Initializes the adapter. */
  initialize(): Promise<void> | void;

  /** Starts active processing. */
  start(): Promise<void> | void;

  /** Stops gracefully. */
  stop(): Promise<void> | void;

  /** Releases all resources. */
  dispose(): Promise<void> | void;
}
```

### Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| name | string | Yes | Unique identifier. Normalized to lowercase for lookup. |
| version | string | No | Semantic version of the adapter. |
| capabilities | AdapterCapabilities | Yes | What the adapter supports. Runtime queries this to adapt behavior. |
| metadata | AdapterMetadata | No | Identification, versioning, and compatibility info. |

### Lifecycle Methods

| Method | When Called | Purpose |
| --- | --- | --- |
| initialize() | During app bootstrap | Prepare external resources. Connect to databases, validate config. |
| start() | After initialization | Begin active processing. Listen for requests, consume messages. |
| stop() | During graceful shutdown | Cease active processing. Stop accepting new work. |
| dispose() | After stopping | Release all resources. Close connections, clear timers. |

### Example: Custom Adapter

```ts
import type { Adapter, AdapterCapabilities } from "@zudojs/adapters";

const myAdapter: Adapter = {
  name: "my-custom-adapter",
  version: "1.0.0",
  capabilities: {
    http: true,
    gracefulShutdown: true,
    abortSignal: true,
  },

  async initialize() {
    // Validate config, establish connections
    console.log("Adapter initialized");
  },

  async start() {
    // Begin listening, processing
    console.log("Adapter started");
  },

  async stop() {
    // Stop accepting new work
    console.log("Adapter stopped");
  },

  async dispose() {
    // Close connections, release resources
    console.log("Adapter disposed");
  },
};
```

## ADAPTER REGISTRY

The `AdapterRegistry` manages adapter registration, lookup, and removal. Names are normalized to lowercase for case-insensitive lookup.

### Methods

| Method | Signature | Returns |
| --- | --- | --- |
| register() | register(adapter: Adapter): void | void. Throws `AdapterAlreadyRegisteredError` on duplicate, `AdapterConfigurationError` on a blank or reserved name. |
| get() | get<T>(name: string): T \| undefined | Adapter or undefined |
| has() | has(name: string): boolean | true if registered |
| remove() | remove(name: string): boolean | true if removed, false if not found |
| getAll() | getAll(): readonly Adapter[] | Frozen array of all adapters |
| getNames() | getNames(): readonly string[] | Frozen array of adapter names |
| size | get size(): number | Number of registered adapters |
| clear() | clear(): void | Removes all adapters |

> **Reserved names:** since v1.2.0 `register()` refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`. The check runs after normalization, so `"__PROTO__"` is refused too. They survive the registry's own `Map`, but any consumer that keys a plain object by adapter name — a health report, a metrics bag, a JSON dump — loses or corrupts the entry, so they are refused at the door. Rename the adapter; nothing else about registration changed.

### Example: Using the Registry

```ts
import { AdapterRegistry } from "@zudojs/adapters";

const registry = new AdapterRegistry();

// Register adapters
registry.register({
  name: "postgres",
  capabilities: { http: false },
  // ... lifecycle methods
});

registry.register({
  name: "redis",
  capabilities: { http: false },
  // ... lifecycle methods
});

// Lookup (case-insensitive)
const pg = registry.get("Postgres"); // Found
const cache = registry.get("redis"); // Found

// Check existence
if (registry.has("mysql")) {
  // ... use it
}

// List all
console.log(registry.getNames()); // ["postgres", "redis"]
console.log(registry.size);      // 2
```

## CAPABILITIES

Adapters declare what they support through `AdapterCapabilities`. Runtime code queries capabilities to decide behavior.

| Capability | Type | Description |
| --- | --- | --- |
| http | boolean | Supports HTTP request/response handling |
| websocket | boolean | Supports WebSocket connections |
| streaming | boolean | Supports streaming responses |
| filesystem | boolean | Supports file system access |
| tcp | boolean | Supports raw TCP connections |
| udp | boolean | Supports UDP datagrams |
| backgroundTasks | boolean | Supports background task execution |
| longRunning | boolean | Supports long-running processes |
| edgeRuntime | boolean | Runs on edge (Cloudflare, Vercel Edge) |
| serverless | boolean | Runs in serverless (Lambda, etc.) |
| gracefulShutdown | boolean | Supports graceful shutdown |
| abortSignal | boolean | Supports request cancellation via AbortSignal |

### Example: Querying Capabilities

```ts
const adapter = registry.get("http-server");

if (adapter?.capabilities.gracefulShutdown) {
  await adapter.stop();
}

if (adapter?.capabilities.edgeRuntime) {
  // Use edge-compatible code path
  await handleEdgeRequest(adapter);
} else {
  // Use Node.js-specific code path
  await handleRequest(adapter);
}
```

## METADATA

Adapter metadata provides identification, versioning, and compatibility information for diagnostics and tooling.

```ts
interface AdapterMetadata {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly license?: string;
  readonly zudojs?: string;       // Zudojs version compatibility
  readonly runtime?: string;       // Runtime version (e.g., "node >=18")
  readonly peerDependencies?: Record<string, string>;
}
```

## LIFECYCLE CONTRACTS

### AdapterHealth

```ts
type AdapterHealthStatus = "healthy" | "degraded" | "unhealthy";

interface AdapterHealth {
  readonly status: AdapterHealthStatus;
  readonly message?: string;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;
}
```

### Health Factory Functions

```ts
import {
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "@zudojs/adapters";

// Healthy
const ok = createHealthyHealth();
// { status: "healthy", timestamp: 1693000000000 }

// Degraded
const degraded = createDegradedHealth("Cache miss rate above threshold");

// Unhealthy
const unhealthy = createUnhealthyHealth("Connection pool exhausted");
```

### LifecycleAdapter

```ts
interface LifecycleAdapter extends Adapter {
  configure?(options: unknown): Promise<void> | void;
  health?(): Promise<AdapterHealth> | AdapterHealth;
}
```

`AdapterRegistry.healthAll({ timeout, signal, retry })` runs every `health()` hook and returns an `AdapterHealthReport`, `{ status, adapters }` (the worst status; failing, timed-out or aborted checks are `unhealthy`). `AdapterRegistry.configure(name, options)` calls the adapter's `configure()` and throws `AdapterConfigurationError` if it has none.

### AdapterOperationOptions

```ts
interface AdapterOperationOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly retry?: {
    readonly attempts: number;
    readonly delay?: number;
  };
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| signal | none | Cancels the operation. An aborted signal also stops any remaining retries at once. |
| timeout | none | Milliseconds allowed for *each* try, not for the whole retry sequence. |
| retry.attempts | `1` | The **total** number of tries, including the first one. `3` means one call plus at most two retries. Anything below `1`, fractional, or non-finite is clamped to a single try. |
| retry.delay | `0` | Milliseconds to pause between tries. Ended early by `signal`. |

Until v1.2.0 `retry` was part of the contract with nothing reading it: a caller asking for three attempts got one, silently. It is now honoured by `healthAll()`. A check is re-run only while it reports `unhealthy` — a `healthy` or `degraded` result is accepted and returned immediately. Omit `retry` and the behaviour is exactly what it was: one try.

```ts
const report = await registry.healthAll({
  timeout: 2000,
  retry: { attempts: 3, delay: 250 },
});

// attempts: 3 means three tries in TOTAL — the first call plus at
// most two retries. It is not "retry three more times".
// Each try gets its own 2000 ms timeout, with a 250 ms pause between.
// Worst case per adapter: 3 * 2000 + 2 * 250 = 6500 ms.
console.log(report.status);
```

> **Off by one:** `attempts: 1` is a single try and no retry at all, not "one retry". If you previously wrote `attempts: 3` expecting four calls, you now get three — and before v1.2.0 you got one.

## TRANSPORT ADAPTERS

### HTTP ADAPTER

Translates platform-specific HTTP requests/responses into Zudojs's normalized shapes.

```ts
interface HTTPRequestLike {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly rawBody?: Uint8Array;
  readonly protocol: string;
  readonly hostname: string;
  readonly ip?: string;
  readonly secure: boolean;
  readonly aborted: boolean;
}

interface HTTPAdapter extends Adapter {
  createRequest(input: unknown): HTTPRequestLike;
  createResponse(input?: unknown): HTTPResponseLike;
  handle(input: unknown): Promise<void>;
  listen?(options?: HTTPListenOptions): Promise<void>;
  close(): Promise<void>;
}
```

> **Best With:** `@zudojs/http` (v1.2.0), `@zudojs/security` (v1.1.0)

### MESSAGING ADAPTER

Connects Zudojs message bus to external providers (RabbitMQ, Kafka, Redis Streams, NATS, AWS SQS, Google Pub/Sub).

```ts
interface MessageAdapter extends Adapter {
  publish(topic: string, message: unknown, options?: AdapterOperationOptions): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<Subscription>;
  unsubscribe(subscription: Subscription): Promise<void>;
}

type MessageHandler = (message: unknown) => Promise<void> | void;

interface Subscription {
  readonly id: string;
  readonly topic: string;
  unsubscribe(): Promise<void>;
}
```

> **Best With:** `@zudojs/messaging` (v1.0.2), `@zudojs/events` (v1.1.0)

### STORAGE ADAPTER

Bridges Zudojs storage to external providers (AWS S3, Cloudflare R2, Google Cloud Storage, Azure Blob).

```ts
interface StorageAdapter extends Adapter {
  get(key: string, options?: AdapterOperationOptions): Promise<unknown>;
  put(key: string, value: unknown, options?: AdapterOperationOptions): Promise<void>;
  delete(key: string, options?: AdapterOperationOptions): Promise<void>;
  exists(key: string, options?: AdapterOperationOptions): Promise<boolean>;
  list(prefix?: string, options?: AdapterOperationOptions): Promise<readonly string[]>;
}
```

> **Best With:** `@zudojs/storage` (v1.1.1), `@zudojs/cache` (v1.1.0)

### QUEUE ADAPTER

Connects Zudojs queue abstractions to external providers (BullMQ, RabbitMQ, AWS SQS, Redis, Kafka).

```ts
interface QueueAdapter extends Adapter {
  enqueue(job: unknown, options?: AdapterOperationOptions): Promise<string>;
  dequeue(options?: AdapterOperationOptions): Promise<unknown | null>;
  acknowledge(jobId: string, options?: AdapterOperationOptions): Promise<void>;
  reject(jobId: string, requeue?: boolean, options?: AdapterOperationOptions): Promise<void>;
  stats(options?: AdapterOperationOptions): Promise<QueueStats>;
}

interface QueueStats {
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
}
```

> **Best With:** `@zudojs/queue` (v1.2.0)

### WEBSOCKET ADAPTER

```ts
interface WebSocketAdapter extends Adapter {
  accept(connection: unknown): Promise<WebSocketSession>;
  close(session: WebSocketSession, code?: number, reason?: string): Promise<void>;
  send(session: WebSocketSession, data: string | ArrayBuffer | Uint8Array): Promise<void>;
  broadcast(data: string | ArrayBuffer | Uint8Array): Promise<void>;
}

enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}
```

### RUNTIME ADAPTER

Provides platform-specific runtime services (Node.js, Bun, Deno, AWS Lambda, Cloudflare Workers).

```ts
interface RuntimeAdapter extends Adapter {
  readonly platform: string;
  readonly version?: string;
  createSignal(): AbortSignal;
  schedule(delay: number, task: () => void): { cancel: () => void };
  spawn(task: () => void): { cancel: () => void };
}
```

### CLI ADAPTER

```ts
interface CLIAdapter extends Adapter {
  run(command: string, args?: readonly string[], options?: CLIOptions): Promise<CLIResult>;
}

interface CLIResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
```

### SCHEDULER ADAPTER

```ts
interface SchedulerAdapter extends Adapter {
  schedule(name: string, task: ScheduledTask, options?: AdapterOperationOptions): Promise<ScheduledJob>;
  cancel(job: ScheduledJob, options?: AdapterOperationOptions): Promise<void>;
  list(options?: AdapterOperationOptions): Promise<readonly ScheduledJob[]>;
}

interface ScheduledTask {
  readonly name: string;
  readonly cron?: string;
  readonly interval?: number;
  readonly handler: () => Promise<void> | void;
}
```

## ERROR HIERARCHY

All error types are defined in `@zudojs/errors` and re-exported by this package.

| Error | When Thrown |
| --- | --- |
| AdapterError | Base error for all adapter issues |
| AdapterNotFoundError | Requested adapter not in registry |
| AdapterAlreadyRegisteredError | Duplicate adapter registration |
| AdapterNotSupportedError | Capability not supported by adapter |
| AdapterCapabilityMissingError | Required capability missing |
| AdapterConnectionError | Connection failure |
| AdapterOperationError | Operation failure |
| AdapterTimeoutError | Operation timed out |
| AdapterDisposeError | Disposal failure |
| AdapterInitializationError | Initialization failure |
| AdapterConfigurationError | Invalid configuration |

### Error Handling Pattern

```ts
import {
  isAdapterError,
  AdapterConnectionError,
} from "@zudojs/adapters";

try {
  await adapter.initialize();
} catch (error) {
  if (isAdapterError(error)) {
    console.error(`Adapter ${error.adapter}: ${error.message}`);
    if (error instanceof AdapterConnectionError) {
      // Retry connection or fail gracefully
    }
  }
}
```

## TESTING UTILITIES

Import from `@zudojs/adapters/testing` for mock adapters and test helpers.

```ts
import {
  createMockAdapter,
  createMockAdapterRegistry,
  createMockHealth,
} from "@zudojs/adapters/testing";
```

### createMockAdapter()

```ts
const adapter = createMockAdapter({
  name: "test-http",
  version: "1.0.0",
  capabilities: { http: true, gracefulShutdown: true },
  // Optional: override lifecycle methods
  initialize: async () => { /* ... */ },
  start: async () => { /* ... */ },
});

expect(adapter.name).toBe("test-http");
expect(adapter.capabilities.http).toBe(true);
```

### createMockAdapterRegistry()

```ts
const { registry, adapters } = createMockAdapterRegistry([
  createMockAdapter({ name: "http" }),
  createMockAdapter({ name: "storage" }),
]);

expect(registry.size).toBe(2);
expect(registry.has("http")).toBe(true);
```

### Full Test Example

```ts
import { describe, it, expect } from "vitest";
import {
  AdapterRegistry,
  createMockAdapter,
  createMockHealth,
} from "@zudojs/adapters";

describe("MyAdapter", () => {
  it("registers and retrieves by name", () => {
    const registry = new AdapterRegistry();
    const adapter = createMockAdapter({ name: "my-adapter" });

    registry.register(adapter);

    expect(registry.get("my-adapter")).toBe(adapter);
  });

  it("reports healthy status", () => {
    const health = createMockHealth();
    expect(health.status).toBe("healthy");
  });
});
```

## FULL INTEGRATION EXAMPLE

Complete example: register adapters, query capabilities, use with the runtime.

```ts
import {
  AdapterRegistry,
  createHealthyHealth,
  createDegradedHealth,
} from "@zudojs/adapters";
import type {
  HTTPAdapter,
  MessageAdapter,
  StorageAdapter,
} from "@zudojs/adapters";

// 1. Create registry
const registry = new AdapterRegistry();

// 2. Register HTTP adapter
const httpAdapter: HTTPAdapter = {
  name: "node-http",
  version: "1.0.0",
  capabilities: { http: true, gracefulShutdown: true },
  async initialize() { /* ... */ },
  async start() { /* ... */ },
  async stop() { /* ... */ },
  async dispose() { /* ... */ },
  createRequest(input) { /* ... */ return {} as any; },
  createResponse(input) { /* ... */ return {} as any; },
  async handle(input) { /* ... */ },
  async close() { /* ... */ },
};
registry.register(httpAdapter);

// 3. Register storage adapter
const storageAdapter: StorageAdapter = {
  name: "s3-storage",
  version: "1.0.0",
  capabilities: { filesystem: true },
  async initialize() { /* validate S3 config */ },
  async start() { /* no-op */ },
  async stop() { /* no-op */ },
  async dispose() { /* cleanup */ },
  async get(key) { return await s3GetObject(key); },
  async put(key, value) { await s3PutObject(key, value); },
  async delete(key) { await s3DeleteObject(key); },
  async exists(key) { return await s3Exists(key); },
  async list(prefix) { return await s3List(prefix); },
};
registry.register(storageAdapter);

// 4. Use adapters based on capabilities
const http = registry.get<HTTPAdapter>("node-http");
if (http?.capabilities.gracefulShutdown) {
  await http.stop();
}

// 5. Initialize all adapters in order
for (const adapter of registry.getAll()) {
  await adapter.initialize();
}
for (const adapter of registry.getAll()) {
  await adapter.start();
}

// 6. Graceful shutdown
process.on("SIGTERM", async () => {
  for (const adapter of [...registry.getAll()].reverse()) {
    await adapter.stop();
  }
  for (const adapter of [...registry.getAll()].reverse()) {
    await adapter.dispose();
  }
});
```

## CONNECTIONS TO OTHER PACKAGES

| Package | Version | Relationship | How They Connect |
| --- | --- | --- | --- |
| @zudojs/http | 1.3.0 | Transport | HTTP adapter provides request/response shapes that @zudojs/http consumes |
| @zudojs/messaging | 1.1.0 | Transport | Message adapter bridges external message providers to the internal message bus |
| @zudojs/storage | 1.1.2 | Transport | Storage adapter provides the implementation for storage abstractions |
| @zudojs/queue | 1.3.0 | Transport | Queue adapter provides the implementation for background job processing |
| @zudojs/scheduler | 1.1.2 | Transport | Scheduler adapter provides the implementation for job scheduling |
| @zudojs/lifecycle | 1.2.0 | Dependency | Lifecycle contracts integrate with the lifecycle state machine |
| @zudojs/runtime | 1.2.1 | Consumer | Runtime manages adapter lifecycle (initialize, start, stop, dispose) |
| @zudojs/errors | 1.2.0 | Dependency | All adapter error types defined in @zudojs/errors |
| @zudojs/database | 1.2.1 | Consumer | Database clients use storage adapter interface for connection management |

## VERSION COMPATIBILITY

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

| Package | adapters v1.2.0 works with | Stability |
| --- | --- | --- |
| @zudojs/errors | v1.2.0 | STABLE |
| @zudojs/constants | v1.1.1 | STABLE |
| @zudojs/types | v1.1.1 | STABLE |
| @zudojs/lifecycle | v1.2.0 | STABLE |
| @zudojs/http | v1.3.0 (peer) | PEER |
| @zudojs/messaging | v1.1.0 | STABLE |
| @zudojs/storage | v1.1.2 | STABLE |
| @zudojs/queue | v1.3.0 | STABLE |
| @zudojs/scheduler | v1.1.2 | STABLE |
| @zudojs/runtime | v1.2.1 | STABLE |

## IMPROVEMENTS & RECOMMENDATIONS

### 1. Add AdapterFactory Pattern

Create factory functions that encapsulate adapter creation with validation:

```ts
function createHTTPAdapter(config: HTTPAdapterConfig): HTTPAdapter {
  // Validate config
  // Create adapter with defaults
  // Return typed adapter
}
```

### 2. Add AdapterMiddleware Support

Allow wrapping adapter operations with middleware for logging, metrics, and retry logic.

### 3. Add AdapterHealthChecker

A utility that periodically checks adapter health and emits events when status changes.

### 4. Add Adapter Connection Pool

For adapters that maintain connections (HTTP, storage), add connection pooling with configurable limits.

### 5. Add Adapter Metrics Collection

Automatic metrics for adapter operations: request duration, error rates, connection counts.

## QUICK REFERENCE

```ts
// Import adapter types
import type {
  Adapter,
  AdapterCapabilities,
  AdapterMetadata,
  HTTPAdapter,
  MessageAdapter,
  StorageAdapter,
  QueueAdapter,
  WebSocketAdapter,
  RuntimeAdapter,
  CLIAdapter,
  SchedulerAdapter,
  LifecycleAdapter,
  AdapterHealth,
  AdapterOperationOptions,
} from "@zudojs/adapters";

// Import registry and helpers
import {
  AdapterRegistry,
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
} from "@zudojs/adapters";

// Import errors
import {
  AdapterError,
  AdapterNotFoundError,
  AdapterAlreadyRegisteredError,
  isAdapterError,
} from "@zudojs/adapters";

// Import testing utilities
import {
  createMockAdapter,
  createMockAdapterRegistry,
  createMockHealth,
} from "@zudojs/adapters/testing";
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/adapters` exports from its package root at v1.3.0 — **63** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 63 exports**

Classes (13)

`AdapterAlreadyRegisteredError` `AdapterCapabilityMissingError` `AdapterConfigurationError` `AdapterConnectionError` `AdapterDisposeError` `AdapterError` `AdapterInitializationError` `AdapterNotFoundError` `AdapterNotSupportedError` `AdapterOperationError` `AdapterRegistry` `AdapterTimeoutError` `MockAdapterRegistry`

Functions (13)

`collectAdapterHealth` `configureAdapter` `createAdapterError` `createDegradedHealth` `createHealthyHealth` `createMockAdapter` `createMockAdapterRegistry` `createMockHealth` `createUnhealthyHealth` `isAdapterError` `runAdapterLifecycle` `toAdapterLifecycleError` `withRetry`

Interfaces (32)

`Adapter` `AdapterCapabilities` `AdapterErrorOptions` `AdapterHealth` `AdapterHealthReport` `AdapterMetadata` `AdapterOperationOptions` `CLIAdapter` `CLIOptions` `CLIResult` `HTTPAdapter` `HTTPListenOptions` `HTTPRequestAdapter` `HTTPRequestLike` `HTTPResponseAdapter` `HTTPResponseLike` `HTTPServerAdapter` `KnownAdapterCapabilities` `LifecycleAdapter` `MessageAdapter` `MockAdapter` `MockAdapterHealth` `QueueAdapter` `QueueStats` `RuntimeAdapter` `ScheduledJob` `ScheduledTask` `SchedulerAdapter` `StorageAdapter` `Subscription` `WebSocketAdapter` `WebSocketSession`

Type aliases (4)

`AdapterCapabilityName` `AdapterHealthStatus` `AdapterLifecycleOperation` `MessageHandler`

Enums (1)

`WebSocketReadyState`
