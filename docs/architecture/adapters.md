# Adapters

> Adapters are the boundary layer between Zudojs and external platforms.
> They provide contracts, registries, capabilities, and transport abstractions
> that let Zudojs run on different runtimes without changing application code.

---

## 1. Purpose

Zudojs applications should not depend on platform-specific APIs.
An application written for Node.js should be portable to edge runtimes,
serverless environments, or test harnesses without rewriting business logic.

Adapters solve this by:

- Defining **platform-agnostic contracts** for external interactions.
- Providing a **registry** for discovering and managing adapters.
- Declaring **capabilities** so runtime code can adapt behavior.
- Offering **lifecycle contracts** that integrate with `@zudojs/lifecycle`.

---

## 2. Core Concepts

### 2.1 Adapter Interface

Every adapter implements the base `Adapter` interface:

```ts
interface Adapter {
  readonly name: string;
  readonly version?: string;
  readonly capabilities: AdapterCapabilities;
  readonly metadata?: AdapterMetadata;

  initialize?(): Promise<void> | void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
```

The lifecycle methods map to the standard Zudojs lifecycle:

```
initialize → start → running → stop → dispose
```

Transport-specific adapters extend this base with additional methods.

### 2.2 Capabilities

Adapters declare what they support through the `AdapterCapabilities` interface:

```ts
interface AdapterCapabilities {
  readonly http?: boolean;
  readonly websocket?: boolean;
  readonly streaming?: boolean;
  readonly filesystem?: boolean;
  readonly tcp?: boolean;
  readonly udp?: boolean;
  readonly backgroundTasks?: boolean;
  readonly longRunning?: boolean;
  readonly edgeRuntime?: boolean;
  readonly serverless?: boolean;
  readonly gracefulShutdown?: boolean;
  readonly abortSignal?: boolean;
}
```

Runtime code queries capabilities to decide behavior:

```ts
const httpAdapter = registry.get<HTTPAdapter>("http");

if (httpAdapter?.capabilities.gracefulShutdown) {
  await httpAdapter.stop();
}
```

### 2.3 Metadata

Adapters optionally provide metadata for diagnostics and observability:

```ts
interface AdapterMetadata {
  readonly platform?: string;
  readonly runtime?: string;
  readonly region?: string;
  readonly [key: string]: unknown;
}
```

### 2.4 Registry

The `AdapterRegistry` manages adapter registration, lookup, and removal:

```ts
const registry = new AdapterRegistry();

registry.register(httpAdapter);
registry.register(queueAdapter);

const http = registry.get<HTTPAdapter>("http");
const names = registry.getNames();
const all = registry.getAll();
```

The registry:

- Ensures adapter names are unique.
- Normalizes names for case-insensitive lookup.
- Provides immutable snapshots via `getAll()` and `getNames()`.
- Throws `AdapterAlreadyRegisteredError` on duplicate registration.

---

## 3. Transport Adapters

### 3.1 HTTP Adapter

The `HTTPAdapter` translates platform-specific HTTP requests into Zudojs's normalized shapes.

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

interface HTTPResponseLike {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

interface HTTPAdapter extends Adapter {
  createRequest(input: unknown): HTTPRequestLike;
  createResponse(input?: unknown): HTTPResponseLike;
  handle(input: unknown): Promise<void>;
  listen?(options?: HTTPListenOptions): Promise<void>;
  close?(): Promise<void>;
}
```

Key adapters:

- `HTTPRequestAdapter` — adapts a single platform request.
- `HTTPResponseAdapter` — translates a Zudojs response to platform output.
- `HTTPServerAdapter` — manages HTTP server lifecycle.

### 3.2 Messaging Adapter

The `MessageAdapter` handles message-based communication:

```ts
interface MessageAdapter extends Adapter {
  publish(topic: string, message: unknown): Promise<void> | void;
  subscribe(
    topic: string,
    handler: MessageHandler,
  ): Promise<Subscription> | void;
}

interface MessageHandler {
  (message: unknown): Promise<void> | void;
}

interface Subscription {
  readonly topic: string;
  unsubscribe(): Promise<void> | void;
}
```

### 3.3 Storage Adapter

The `StorageAdapter` provides database and object storage abstractions:

```ts
interface StorageAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities & {
    readonly keyValue?: boolean;
    readonly document?: boolean;
    readonly relational?: boolean;
    readonly blob?: boolean;
  };
}
```

### 3.4 Queue Adapter

The `QueueAdapter` handles background job processing:

```ts
interface QueueAdapter extends Adapter {
  enqueue(job: QueueJob): Promise<QueueJobId> | QueueJobId;
  dequeue(): Promise<QueueJob | null> | QueueJob | null;
  acknowledge(jobId: QueueJobId): Promise<void> | void;
  reject(jobId: QueueJobId, reason?: string): Promise<void> | void;
}

interface QueueStats {
  readonly pending: number;
  readonly processing: number;
  readonly completed: number;
  readonly failed: number;
  readonly deadLetter: number;
}
```

### 3.5 Runtime Adapter

The `RuntimeAdapter` abstracts platform-specific runtime features:

```ts
interface RuntimeAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities & {
    readonly signalHandling?: boolean;
    readonly gracefulShutdown?: boolean;
    readonly healthChecks?: boolean;
    readonly workerThreads?: boolean;
  };
}
```

### 3.6 WebSocket Adapter

The `WebSocketAdapter` manages WebSocket connections:

```ts
interface WebSocketAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities & {
    readonly websocket: true;
  };

  accept(input: unknown): Promise<WebSocketSession> | WebSocketSession;
}

interface WebSocketSession {
  readonly id: string;
  readonly readyState: WebSocketReadyState;
  send(data: unknown): Promise<void> | void;
  close(code?: number, reason?: string): Promise<void> | void;
}
```

### 3.7 CLI Adapter

The `CLIAdapter` handles command-line interfaces:

```ts
interface CLIAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities & {
    readonly cli: true;
  };

  parse(args: string[]): CLIOptions;
  execute(options: CLIOptions): Promise<CLIResult> | CLIResult;
}

interface CLIOptions {
  readonly command: string;
  readonly args: Record<string, unknown>;
}

interface CLIResult {
  readonly exitCode: number;
  readonly output: string;
  readonly error?: string;
}
```

### 3.8 Scheduler Adapter

The `SchedulerAdapter` handles job scheduling:

```ts
interface SchedulerAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities & {
    readonly scheduling: true;
  };

  schedule(task: ScheduledTask): Promise<ScheduledJob> | ScheduledJob;
  cancel(jobId: string): Promise<void> | void;
  list(): Promise<readonly ScheduledJob[]> | readonly ScheduledJob[];
}

interface ScheduledTask {
  readonly name: string;
  readonly cron?: string;
  readonly intervalMs?: number;
  readonly payload?: unknown;
}

interface ScheduledJob {
  readonly id: string;
  readonly task: ScheduledTask;
  readonly nextRun: Date;
  readonly lastRun?: Date;
}
```

---

## 4. Lifecycle Integration

Adapters participate in the Zudojs lifecycle through `@zudojs/lifecycle`:

```ts
interface LifecycleAdapter extends Adapter {
  readonly health: AdapterHealth;

  initialize(): Promise<void> | void;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  dispose(): Promise<void> | void;
}

type AdapterHealth = {
  status: "healthy" | "degraded" | "unhealthy";
  details?: Record<string, unknown>;
};
```

Health status is used by diagnostics and readiness checks.

---

## 5. Error Handling

Adapters define a dedicated error hierarchy rooted in `@zudojs/errors`:

| Error Class                     | Meaning                     |
| ------------------------------- | --------------------------- |
| `AdapterError`                  | Base adapter error          |
| `AdapterNotFoundError`          | Adapter not registered      |
| `AdapterAlreadyRegisteredError` | Duplicate registration      |
| `AdapterNotSupportedError`      | Capability not supported    |
| `AdapterCapabilityMissingError` | Required capability missing |
| `AdapterConnectionError`        | Connection failure          |
| `AdapterOperationError`         | Operation failure           |
| `AdapterTimeoutError`           | Operation timed out         |
| `AdapterDisposeError`           | Disposal failure            |
| `AdapterInitializationError`    | Initialization failure      |
| `AdapterConfigurationError`     | Invalid configuration       |

All errors carry:

- A machine-readable code.
- A human-readable message.
- The adapter name.
- Operational metadata.

---

## 6. Testing

`@zudojs/adapters` provides testing utilities for adapter implementations:

```ts
import {
  createMockAdapter,
  createMockAdapterRegistry,
  createMockHealth,
} from "@zudojs/adapters/testing";

const mockRegistry = createMockAdapterRegistry();
mockRegistry.register(createMockAdapter("http", { http: true }));
```

Mock adapters implement the base `Adapter` interface and can be configured with:

- Custom capabilities.
- Health status.
- Lifecycle behavior.

---

## 7. Package Dependencies

`@zudojs/adapters` depends on:

| Package             | Purpose                       |
| ------------------- | ----------------------------- |
| `@zudojs/errors`    | Error hierarchy               |
| `@zudojs/constants` | Branded types and constants   |
| `@zudojs/types`     | Type guards and utility types |
| `@zudojs/lifecycle` | Lifecycle contracts           |

Adapters do **not** depend on transport packages (`@zudojs/http`, `@zudojs/messaging`, etc.).
Transport packages depend on adapters, not the reverse.

---

## 8. When to Create an Adapter

Create a new adapter when:

- Zudojs must support a new platform or runtime.
- External behavior cannot be expressed through existing transport packages.
- Platform-specific APIs need a uniform interface for application code.
- Testing requires a mock or fake implementation of an external dependency.

Do **not** create adapters for:

- Internal Zudojs abstractions — use modules and plugins instead.
- Business logic — adapters only translate, never decide.
- One-off integrations — consider whether a transport package extension is sufficient.

---

## 9. Relationship to Transport Layer

Adapters sit below the transport layer:

```
Transport Layer (HTTP, RPC, CLI)
        │
        ▼
Application Layer (CQRS, Events, Modules)
        │
        ▼
Adapter Layer (HTTP, Messaging, Storage, Queue, WebSocket, CLI, Scheduler)
        │
        ▼
External Platform (Node.js, Edge Runtime, Serverless, etc.)
```

Transport packages use adapters to interact with platforms.
Application code never directly calls platform APIs.
