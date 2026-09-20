# @zudojs/lifecycle

Application and component lifecycle orchestration with a state machine,
dependency ordering, graceful shutdown, rollback, and signal handling.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-lifecycle.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/lifecycle
```

## Quick Start

```typescript
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager();

manager.register(database, { id: "db" });
manager.register(queue, { id: "queue", dependsOn: ["db"] });
manager.register(server, { id: "server", dependsOn: ["queue"] });

await manager.start();
// ... application running ...
await manager.shutdown();
manager.dispose();
```

Components are plain objects implementing any subset of the hooks:

```typescript
const database = {
  name: "database",
  async initialize(context) {},
  async start(context) {},
  async ready(context) {},
  async stop(context) {},
  async dispose(context) {},
};
```

## Startup and rollback

Phases run in order: `initialize` → `start` → `ready`. Components with
no dependency relationship run in parallel (bounded by `concurrency`).

If a **critical** component (the default) fails any startup phase,
`start()` rolls the application back (`stop` → `dispose`) and then
**rejects** with a `LifecycleStartError`. Register a component with
`{ critical: false }` when its failure should not abort startup — the
component is marked `FAILED` and startup continues. A failed component
takes no further part in startup (its later hooks are not invoked), and
components that `dependsOn` it are not started either: they are marked
`FAILED` with a `LifecycleComponentError` naming the failed dependency,
and their own `critical` flag decides whether startup aborts.

Rollback only undoes phases that ran: `stop()` is called on components
whose `start` phase ran, and `dispose()` on components whose
`initialize` phase ran.

Calling `shutdown()` while `start()` is in flight waits for the
executing stage to settle, tears down, and makes `start()` reject with a
`LifecycleStartError` — later stages are never launched.

## Shutdown

`shutdown()` runs `stop` → `dispose` in reverse dependency order. It is
single-flight: concurrent callers, including the rollback triggered by a
failing startup and the process signal handler, all await the same run.

`shutdownTimeout` (default 30s) is a real wall-clock deadline for the
whole sequence. When it expires the lifecycle context's `AbortSignal` is
aborted so hooks that observe it can unwind, and shutdown completes
regardless. A component that ignores the signal is abandoned, not
awaited forever.

Failing `stop()`/`dispose()` hooks are recorded: the component is marked
`FAILED`, a `component:failed` event is emitted, and the result appears
in `getStatus()`.

## Cancellation

Every hook receives a `LifecycleContext` whose `signal` is shared by the
whole run and is aborted when the shutdown deadline expires. Long-running
hooks should honour it:

```typescript
async stop(context) {
  await drain({ signal: context.signal });
}
```

## Events

`manager.events.on(type, listener)` subscribes to:

- `component:registered`, `component:initializing`, `component:initialized`,
  `component:starting`, `component:started`, `component:ready`,
  `component:stopping`, `component:stopped`, `component:failed`
- `application:initializing`, `application:initialized`,
  `application:starting`, `application:ready`, `application:stopping`,
  `application:stopped`, `application:disposed`

Listener exceptions are swallowed so observability never breaks the
lifecycle.

## Options

```typescript
createLifecycleManager({
  concurrency: 10,        // parallel component operations per stage
  shutdownTimeout: 30_000, // global shutdown deadline (ms); Infinity = none
  handleSignals: true,     // install signal handlers on start()
  signals: ["SIGINT", "SIGTERM"], // defaults to DEFAULT_SHUTDOWN_SIGNALS
});
```

Per-component: `id`, `dependsOn`, `priority`, `critical`, `timeout`,
`retry: { attempts, delay, maxDelay, backoff }`.

`priority` orders components that share a dependency level, and it is a
barrier rather than a hint: every component at one priority completes the
phase before the next priority starts, so `priority: 10` really does start
before `priority: 0`. Components sharing a priority still run together, up
to `concurrency`. Shutdown mirrors it — within a level the lowest priority
stops first and the highest stops last.

`timeout` and `shutdownTimeout` accept `Infinity` for "no bound"; NaN and
negative values throw a `RangeError` when registered or constructed, and
finite values above 2^31-1 ms are clamped to the largest timer delay.
`retry` covers hooks that fail; a hook that times out is not retried,
because it is still running and a second call would overlap it.
`shutdown()` waits (within its deadline) for such an abandoned hook to
settle before calling `stop()`.

With `handleSignals`, SIGINT/SIGTERM listeners are installed by `start()`,
not by the constructor, and removed once shutdown finishes. A second
signal while shutdown is running exits the process with code 1.

## Use Cases

- Coordinating service startup and shutdown
- Managing component lifecycles
- Handling process signals
- Zero-downtime deployments
