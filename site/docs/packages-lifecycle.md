---
title: "@zudojs/lifecycle — Lifecycle Orchestration Documentation"
description: "@zudojs/lifecycle docs: state machine, component hooks, dependency ordering, graceful shutdown, signal handling and rollback for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-lifecycle
---

v1.2.0

# @zudojs/lifecycle

Application and component lifecycle orchestration — state machine, dependency ordering, graceful shutdown, signal handling, retry with backoff, rollback, and execution plans.

LIFECYCLE STATE MACHINE SHUTDOWN SIGNALS

## INSTALLATION

```ts
// npm
npm install @zudojs/lifecycle

// pnpm
pnpm add @zudojs/lifecycle

// yarn
yarn add @zudojs/lifecycle
```

> **Peer Dependencies:** @zudojs/lifecycle depends on @zudojs/errors (1.2.0) and @zudojs/constants (1.1.1).

## WHAT IT DOES

`@zudojs/lifecycle` is the lifecycle orchestration engine for Zudojs. It provides:

- A **LifecycleStateMachine** that validates and tracks state transitions (IDLE → INITIALIZING → INITIALIZED → STARTING → STARTED → READY → STOPPING → STOPPED → DISPOSED)
- **Component lifecycle hooks** — initialize, start, ready, stop, dispose — that components implement as needed
- **Dependency ordering** via topological sort and a directed acyclic graph
- **Graceful shutdown** with reverse-ordered teardown and configurable timeouts
- **Signal handling** — automatic SIGINT/SIGTERM interception to trigger shutdown
- A **LifecycleEventEmitter** that emits 16 typed events for observability integration
- **Retry with backoff** — configurable exponential or fixed retry for component operations
- **Concurrency control** — parallel execution of independent components at the same priority, with configurable limits
- **Rollback support** — components that fail during startup can be disposed in reverse order
- **Execution plans** — build ordered startup/shutdown stages from the dependency graph

> **Core Principle:** Components declare what they need. The lifecycle manager figures out the order, handles concurrency, manages timeouts, and ensures clean shutdown — all driven by a validated state machine.

## WHERE IT SITS

APPLICATION LAYER (Modules, CQRS, HTTP)

LIFECYCLE MANAGER (@zudojs/lifecycle)

RUNTIME (@zudojs/runtime, Orchestrator)

INFRASTRUCTURE (DI, Config, Events)

The lifecycle manager sits between the application layer and the runtime. Modules register themselves as components. The manager resolves their dependency order, executes their hooks during startup and shutdown, and integrates with the runtime for process-level coordination.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | 1.2.0 | Error hierarchy (LifecycleError, LifecycleStateError, LifecycleTimeoutError, etc.) |
| @zudojs/constants | 1.1.1 | LifecycleState, LifecyclePhase enums, valid transitions, and default values |

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

## LIFECYCLE STATES

The `LifecycleState` enum defines every state a component or application can be in. The state machine enforces valid transitions between them.

### Enum: LifecycleState

```ts
enum LifecycleState {
  IDLE = "idle",
  INITIALIZING = "initializing",
  INITIALIZED = "initialized",
  STARTING = "starting",
  STARTED = "started",
  READY = "ready",
  STOPPING = "stopping",
  STOPPED = "stopped",
  FAILED = "failed",
  DISPOSED = "disposed",
}
```

### Valid Transitions

| From | To (allowed) |
| --- | --- |
| IDLE | INITIALIZING, DISPOSED |
| INITIALIZING | INITIALIZED, FAILED |
| INITIALIZED | STARTING, STOPPING, DISPOSED |
| STARTING | STARTED, FAILED |
| STARTED | READY, STOPPING, FAILED |
| READY | STOPPING, FAILED |
| STOPPING | STOPPED, FAILED |
| STOPPED | DISPOSED |
| FAILED | STOPPING, DISPOSED |
| DISPOSED | — (terminal) |

### Startup Path

```ts
IDLE → INITIALIZING → INITIALIZED → STARTING → STARTED → READY
```

### Shutdown Path

```ts
READY → STOPPING → STOPPED → DISPOSED
```

> **FAILED State:** A component can enter FAILED from any active state. From FAILED, it can transition to STOPPING (for cleanup) or directly to DISPOSED.

## LIFECYCLE PHASES

Phases are the discrete hooks that components can implement. The manager executes these hooks in dependency order during startup and shutdown.

### Enum: LifecyclePhase

```ts
enum LifecyclePhase {
  INITIALIZE = "initialize",
  START = "start",
  READY = "ready",
  STOP = "stop",
  DISPOSE = "dispose",
}
```

### Ordered Phase Arrays

```ts
// Startup phases — executed in order
const STARTUP_PHASES = [
  LifecyclePhase.INITIALIZE,
  LifecyclePhase.START,
  LifecyclePhase.READY,
];

// Shutdown phases — executed in reverse dependency order
const SHUTDOWN_PHASES = [
  LifecyclePhase.STOP,
  LifecyclePhase.DISPOSE,
];
```

### Helper Functions

| Function | Returns |
| --- | --- |
| getPhaseHookName(phase) | String hook name for a phase (e.g. `"initialize"`) |
| getComponentMethod(phase) | Method name to call on a component (e.g. `"start"`) |

## COMPONENT INTERFACE

Components implement `LifecycleComponent` to participate in the lifecycle. All hook methods are optional — implement only what you need.

### Interface: LifecycleComponent

```ts
interface LifecycleComponent {
  /** Unique name identifying this component. */
  readonly name: string;

  /** Prepare configuration, create internal objects. */
  initialize?(context: LifecycleContext): Promise<void>;

  /** Connect to databases, start servers. */
  start?(context: LifecycleContext): Promise<void>;

  /** Confirm ready to serve (health check, warm-up). */
  ready?(context: LifecycleContext): Promise<void>;

  /** Stop accepting work, drain queues. */
  stop?(context: LifecycleContext): Promise<void>;

  /** Final resource cleanup. */
  dispose?(context: LifecycleContext): Promise<void>;
}
```

### Interface: LifecycleRegistrationOptions

```ts
interface LifecycleRegistrationOptions {
  readonly id?: string;
  readonly dependsOn?: readonly string[];
  readonly priority?: number;
  readonly critical?: boolean;
  readonly timeout?: number;
  readonly retry?: LifecycleRetryOptions;
}
```

`timeout`: `Infinity` means no bound; `NaN` or a negative value throws `RangeError` at registration; a timed-out hook is not retried.

`priority` (default `0`): orders components that share a dependency level, and since 1.2.0 it is a **barrier**, not a hint. Every component at one priority finishes the phase before the next priority begins, so `register(metrics, { priority: 100 })` genuinely starts before `register(server, { priority: 0 })`. Previously the whole level was launched concurrently up to `concurrency` (default 10) and the sorted order was observable only at `concurrency: 1` — whichever hook happened to finish first won. Components sharing a priority still run together, up to `concurrency`, so the default configuration (everything at priority 0) is unchanged. Shutdown mirrors startup within a level: the lowest priority stops first, the highest last.

Priority only orders components that are already in the same stage. A component with a `dependsOn` that puts it alone in its own stage gains nothing from a high priority — dependencies decide the stage, priority decides the order inside it.

### Interface: LifecycleRetryOptions

```ts
interface LifecycleRetryOptions {
  readonly attempts?: number;
  readonly delay?: number;
  readonly maxDelay?: number;
  readonly backoff?: "fixed" | "exponential";
}
```

### Interface: LifecycleRegistration

```ts
interface LifecycleRegistration {
  readonly id: string;
  readonly component: LifecycleComponent;
  readonly dependsOn: readonly string[];
  readonly priority: number;
  readonly critical: boolean;
  readonly timeout: number;
  readonly retry: LifecycleRetryOptions;
}
```

### Example: Implementing a Component

```ts
import type { LifecycleComponent, LifecycleContext } from "@zudojs/lifecycle";

const database: LifecycleComponent = {
  name: "database",

  async initialize(ctx: LifecycleContext) {
    // Load config, validate connection string
  },

  async start(ctx: LifecycleContext) {
    // Open connection pool
  },

  async ready(ctx: LifecycleContext) {
    // Run health check query
  },

  async stop(ctx: LifecycleContext) {
    // Drain connections
  },

  async dispose(ctx: LifecycleContext) {
    // Close connection pool
  },
};
```

## LIFECYCLE CONTEXT

Every component hook receives a `LifecycleContext` with cancellation support, phase info, and metadata.

### Interface: LifecycleContext

```ts
interface LifecycleContext {
  readonly signal: AbortSignal;
  readonly phase: LifecyclePhase;
  readonly startedAt: number;
  readonly metadata: ReadonlyMap<string, unknown>;
}
```

### Factory Function

```ts
function createLifecycleContext(
  phase: LifecyclePhase,
  startedAt: number,
  signal?: AbortSignal,
  metadata?: Record<string, unknown>,
): LifecycleContext
```

### Example: Using Context

```ts
async start(ctx: LifecycleContext) {
  // Check if operation was cancelled
  if (ctx.signal.aborted) return;

  // Long-running operation with abort support
  await connectToDatabase(ctx.signal);

  // Read metadata
  const env = ctx.metadata.get("environment");
}
```

## LIFECYCLE MANAGER

The `LifecycleManager` is the central orchestrator. It registers components, resolves dependency order, executes hooks, handles signals, and manages shutdown.

### Interface: LifecycleManagerOptions

```ts
interface LifecycleManagerOptions {
  readonly concurrency?: number;
  readonly shutdownTimeout?: number;
  readonly handleSignals?: boolean;
  readonly signals?: readonly NodeJS.Signals[];
}
```

`shutdownTimeout`: `Infinity` means no deadline. `handleSignals`: handlers are installed by `start()` (not the constructor) and removed after shutdown; a second signal during shutdown exits with code 1.

Since 1.2.0, `shutdown()` no longer disposes a component whose `stop()` is still running. A `stop()` hook that blows its own component `timeout` is abandoned rather than cancelled; shutdown used to wait for such hooks only *before* the stop phase, so one abandoned during it had `dispose()` run on top of it while `shutdown()` resolved and reported the application DISPOSED. Each shutdown phase now waits for abandoned hooks to settle before the next begins, still bounded by `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer cut a drain short.

### Class: LifecycleManager

| Member | Type / Signature | Description |
| --- | --- | --- |
| register() | register(component, options?): void | Register a component with optional config |
| start() | start(): Promise<void> | Execute startup phases (idempotent) |
| shutdown() | shutdown(): Promise<void> | Execute shutdown phases (idempotent) |
| state | LifecycleState (getter) | Current application state |
| events | LifecycleEventEmitter (getter) | Event emitter for observability |
| registry | LifecycleRegistry (getter) | The component registry |
| getStatus() | getStatus(): ReadonlyMap<string, { state, results }> | Per-component state and execution results |
| dispose() | dispose(): void | Clean up signal handlers and event listeners |

### Factory Function

```ts
function createLifecycleManager(
  options?: LifecycleManagerOptions,
): LifecycleManager
```

## LIFECYCLE REGISTRY

The `LifecycleRegistry` manages component registration, validates dependencies, and builds the dependency graph.

### Class: LifecycleRegistry

| Method | Signature | Description |
| --- | --- | --- |
| register() | register(component, options?): void | Register a component. Throws if frozen or duplicate. |
| validate() | validate(): void | Validate all dependencies exist and graph is acyclic. |
| freeze() | freeze(): void | Validate and lock — no more registrations allowed. |
| get() | get(id): LifecycleRegistration \| undefined | Look up a registration by ID. |
| getAll() | getAll(): readonly LifecycleRegistration[] | All registrations. |
| getIds() | getIds(): readonly string[] | All registration IDs. |
| graph | DependencyGraph (getter) | The dependency graph. |
| size | number (getter) | Number of registered components. |

### Example: Registration

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager();

manager.register(database, {
  id: "database",
  critical: true,
  timeout: 10_000,
});

manager.register(queue, {
  id: "queue",
  dependsOn: ["database"],
  retry: { attempts: 3, backoff: "exponential" },
});

manager.register(server, {
  id: "server",
  dependsOn: ["queue"],
  priority: 10,
});
```

## STATE MACHINE

The `LifecycleStateMachine` tracks and validates state transitions for a single entity (component or application).

### Class: LifecycleStateMachine

| Member | Type / Signature | Description |
| --- | --- | --- |
| state | LifecycleState (getter) | Current state |
| isTerminal | boolean (getter) | True if STOPPED or DISPOSED |
| isRunning | boolean (getter) | True if STARTED or READY |
| transition() | transition(to: LifecycleState): void | Validate and apply transition. Throws on invalid. |
| canTransition() | canTransition(to): boolean | Check if transition is valid. |
| forceState() | forceState(state): void | Set state without validation (recovery/init only). |

### Example

```ts
import { LifecycleStateMachine } from "@zudojs/lifecycle";

const sm = new LifecycleStateMachine("database");

sm.state;         // "idle"
sm.isTerminal;    // false
sm.isRunning;     // false

sm.transition(LifecycleState.INITIALIZING);
sm.state;         // "initializing"

sm.canTransition(LifecycleState.INITIALIZED); // true
sm.canTransition(LifecycleState.READY);         // false
```

## DEPENDENCY GRAPH

The `DependencyGraph` is a directed acyclic graph that tracks component dependencies, detects cycles, and enables topological ordering.

### Class: DependencyGraph

| Method | Signature | Description |
| --- | --- | --- |
| addNode() | addNode(id: string): void | Add a node to the graph. |
| addEdge() | addEdge(from, to): void | Add a directed edge: from depends on to. |
| getNodes() | getNodes(): readonly string[] | All nodes. |
| getDependencies() | getDependencies(id): readonly string[] | Nodes that id depends on. |
| getDependents() | getDependents(id): readonly string[] | Nodes that depend on id. |
| validate() | validate(): void | Throw LifecycleDependencyError if cycle detected. |

### Topological Sort Functions

```ts
// Forward order for startup: dependencies first
function topologicalSort(
  graph: DependencyGraph,
  priorities?: ReadonlyMap<string, number>,
): readonly TopologicalStage[]

// Reverse order for shutdown: dependents first
function reverseTopologicalSort(
  graph: DependencyGraph,
  priorities?: ReadonlyMap<string, number>,
): readonly TopologicalStage[]

// A stage is a group of components with no dependency between them,
// ordered by priority: descending for startup, ascending for shutdown
type TopologicalStage = readonly string[];
```

Within a stage, components are sorted by priority — highest first for `topologicalSort`, lowest first for `reverseTopologicalSort`. Since 1.2.0 `reverseTopologicalSort` reverses each stage’s contents as well as the stage list, so a shutdown is the exact mirror of the startup order; it used to reverse only the stage list, leaving every stage in descending-priority order. The executor treats each run of equal priority as a barrier, so a stage is fully parallel only where its components share a priority.

## EXECUTION PLANS

Execution plans translate the dependency graph into ordered stages for a specific lifecycle phase.

### Interface: ExecutionPlan

```ts
interface ExecutionPlan {
  readonly stages: readonly ExecutionStage[];
  readonly phase: LifecyclePhase;
}
```

### Interface: ExecutionStage

```ts
interface ExecutionStage {
  readonly components: readonly string[];
  readonly phase: LifecyclePhase;
}
```

### Factory Function

```ts
function buildExecutionPlan(
  registrations: readonly LifecycleRegistration[],
  phase: LifecyclePhase,
): ExecutionPlan
```

### Example

```ts
import { buildExecutionPlan } from "@zudojs/lifecycle";
import { LifecyclePhase } from "@zudojs/constants";

const plan = buildExecutionPlan(registrations, LifecyclePhase.START);

// plan.stages might be:
// [
//   { components: ["database"], phase: "start" },
//   { components: ["queue"], phase: "start" },
//   { components: ["server", "cache"], phase: "start" },
// ]
```

Components inside a stage are listed in execution order: priority descending for startup phases, ascending for shutdown phases. The executor runs each run of equal priority as one batch and waits for it before starting the next, so `["server", "cache"]` runs concurrently only if both were registered at the same priority.

## EXECUTOR

The `LifecycleExecutor` runs component hooks with timeout, retry, and concurrency support.

### Class: LifecycleExecutor

| Method | Signature | Description |
| --- | --- | --- |
| execute() | execute(registration, phase, context): Promise<ExecutionResult> | Run a single component hook with retry and timeout. |
| executeStage() | executeStage(registrations, phase, context, concurrency): Promise<ExecutionResult[]> | Run a stage one priority group at a time, each group limited by `concurrency`. The next group starts only once the previous has settled. |

### Interface: ExecutionResult

```ts
interface ExecutionResult {
  readonly id: string;
  readonly phase: LifecyclePhase;
  readonly duration: number;
  readonly error?: unknown;
  readonly success: boolean;
}
```

## EVENTS

The `LifecycleEventEmitter` emits typed events at each lifecycle phase, enabling observability integration without depending on @zudojs/events.

### Class: LifecycleEventEmitter

| Method | Signature | Description |
| --- | --- | --- |
| on() | on(type, listener): () => void | Subscribe to an event type. Returns unsubscribe function. |
| emit() | emit(type, data): void | Emit an event with timestamp. |
| clear() | clear(): void | Remove all listeners. |

### Enum: LifecycleEventType (16 event types)

```ts
type LifecycleEventType =
  | "component:registered"
  | "component:initializing"
  | "component:initialized"
  | "component:starting"
  | "component:started"
  | "component:ready"
  | "component:stopping"
  | "component:stopped"
  | "component:failed"
  | "application:initializing"
  | "application:initialized"
  | "application:starting"
  | "application:ready"
  | "application:stopping"
  | "application:stopped"
  | "application:disposed";
```

### Event Payloads

```ts
interface LifecycleEvent {
  readonly type: LifecycleEventType;
  readonly component?: LifecycleComponentEvent;
  readonly duration?: number;
  readonly error?: unknown;
  readonly timestamp: number;
}

interface LifecycleComponentEvent {
  readonly componentId: string;
  readonly duration?: number;
  readonly error?: unknown;
}

interface LifecycleApplicationEvent {
  readonly timestamp: number;
  readonly duration?: number;
}

type LifecycleEventListener = (event: LifecycleEvent) => void;
```

### Example: Observability Integration

```ts
manager.events.on("component:started", (event) => {
  logger.info("component started", {
    componentId: event.component?.componentId,
    duration: event.duration,
  });
});

manager.events.on("component:failed", (event) => {
  logger.error("component failed", {
    componentId: event.component?.componentId,
    error: event.error,
  });
});
```

## SIGNAL HANDLING

Automatic process signal interception for graceful shutdown. The lifecycle manager installs these by default.

### Function: installSignalHandlers

```ts
function installSignalHandlers(options: SignalHandlerOptions): () => void
```

### Interface: SignalHandlerOptions

```ts
interface SignalHandlerOptions {
  readonly signals?: readonly NodeJS.Signals[];
  readonly handler: () => void;
}
```

### Constant: DEFAULT_SHUTDOWN_SIGNALS

```ts
const DEFAULT_SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] =
  ["SIGINT", "SIGTERM"];
```

### Example: Custom Signal Handling

```ts
import { installSignalHandlers } from "@zudojs/lifecycle";

const cleanup = installSignalHandlers({
  signals: ["SIGINT", "SIGTERM", "SIGHUP"],
  handler: () => {
    console.log("Signal received, shutting down...");
    void manager.shutdown();
  },
});

// Later, remove handlers
cleanup();
```

## ASYNC UTILITIES

Helper functions for timeout, abort, and concurrency control used internally by the executor.

### Function: withTimeout

```ts
function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  componentId: string,
  phase: string,
): Promise<T>
```

Wraps an async function with a timeout. Throws LifecycleTimeoutError if exceeded.

### Function: withAbort

```ts
function withAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T>
```

Wraps an async function with abort signal support. Rejects when the signal is aborted.

### Function: withConcurrency

```ts
function withConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void>
```

Execute async operations on an array with a maximum concurrency limit.

## ERROR HIERARCHY

All error types are defined in `@zudojs/errors` and re-exported by this package.

| Error | When Thrown |
| --- | --- |
| LifecycleError | Base error for all lifecycle-related issues. Since 1.2.0 it also covers registry and abort failures — registering after `freeze()`, a duplicate id, an unregistered `dependsOn` target and a cancelled `withAbort` — which used to throw a bare `Error`. The messages are unchanged, but they now carry an `ErrorCode` and answer `instanceof LifecycleError`. |
| LifecycleStateError | Invalid state transition attempted |
| LifecycleTimeoutError | Component operation exceeded timeout |
| LifecycleDependencyError | Circular dependency or missing dependency detected |
| LifecycleComponentError | A component hook threw during execution |

## FULL INTEGRATION EXAMPLE

Complete working example: register components with dependencies, handle signals, observe events, and manage the full lifecycle.

```ts
import {
  createLifecycleManager,
  installSignalHandlers,
} from "@zudojs/lifecycle";
import type { LifecycleComponent, LifecycleContext } from "@zudojs/lifecycle";

// 1. Define components
const database: LifecycleComponent = {
  name: "database",
  async initialize(ctx: LifecycleContext) {
    console.log("Database: loading config...");
  },
  async start(ctx: LifecycleContext) {
    console.log("Database: connecting...");
    // await pool.connect(ctx.signal);
  },
  async stop(ctx: LifecycleContext) {
    console.log("Database: draining connections...");
  },
  async dispose(ctx: LifecycleContext) {
    console.log("Database: pool closed.");
  },
};

const cache: LifecycleComponent = {
  name: "cache",
  async start(ctx: LifecycleContext) {
    console.log("Cache: warming up...");
  },
  async stop(ctx: LifecycleContext) {
    console.log("Cache: clearing...");
  },
};

const server: LifecycleComponent = {
  name: "server",
  async start(ctx: LifecycleContext) {
    console.log("Server: listening on :3000");
  },
  async stop(ctx: LifecycleContext) {
    console.log("Server: closing connections...");
  },
};

// 2. Create manager with options
const manager = createLifecycleManager({
  concurrency: 5,
  shutdownTimeout: 30_000,
  handleSignals: true,
  signals: ["SIGINT", "SIGTERM"],
});

// 3. Register components with dependencies
manager.register(database, {
  id: "database",
  critical: true,
  timeout: 15_000,
});

manager.register(cache, {
  id: "cache",
  dependsOn: ["database"],
  critical: false,
});

manager.register(server, {
  id: "server",
  dependsOn: ["database", "cache"],
  priority: 10,
  timeout: 10_000,
  retry: {
    attempts: 2,
    delay: 1_000,
    backoff: "exponential",
  },
});

// 4. Observe lifecycle events
manager.events.on("component:started", (event) => {
  console.log(`✓ ${event.component?.componentId} started (${event.duration}ms)`);
});

manager.events.on("application:ready", (event) => {
  console.log(`🚀 Application ready in ${event.duration}ms`);
});

// 5. Start the application
await manager.start();

// Application is running. Check component status:
const status = manager.getStatus();
for (const [id, info] of status) {
  console.log(`${id}: ${info.state}`);
}

// 6. Graceful shutdown (triggered by SIGTERM or manually)
// start() installed the signal handlers; they are removed when shutdown finishes.
// Or trigger manually:
await manager.shutdown();
manager.dispose();
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/lifecycle` exports from its package root at v1.2.0 — **36** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 36 exports**

Classes (6)

`DependencyGraph` `LifecycleEventEmitter` `LifecycleExecutor` `LifecycleManager` `LifecycleRegistry` `LifecycleStateMachine`

Functions (11)

`buildExecutionPlan` `createLifecycleContext` `createLifecycleManager` `getComponentMethod` `getPhaseHookName` `installSignalHandlers` `reverseTopologicalSort` `topologicalSort` `withAbort` `withConcurrency` `withTimeout`

Interfaces (13)

`ExecutionPlan` `ExecutionResult` `ExecutionStage` `LifecycleApplicationEvent` `LifecycleComponent` `LifecycleComponentEvent` `LifecycleContext` `LifecycleEvent` `LifecycleManagerOptions` `LifecycleRegistration` `LifecycleRegistrationOptions` `LifecycleRetryOptions` `SignalHandlerOptions`

Type aliases (3)

`LifecycleEventListener` `LifecycleEventType` `TopologicalStage`

Constants (3)

`DEFAULT_SHUTDOWN_SIGNALS` `SHUTDOWN_PHASES` `STARTUP_PHASES`
