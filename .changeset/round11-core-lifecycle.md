---
"@zudojs/lifecycle": minor
"@zudojs/container": patch
"@zudojs/runtime": patch
---

**@zudojs/lifecycle**

- `priority` is now a real ordering barrier instead of a hint. Components
  registered at one priority all complete a phase before the next priority
  starts, so `register(metrics, { priority: 100 })` genuinely starts before
  `register(server, { priority: 0 })`. Previously the whole dependency level
  was launched concurrently (up to `concurrency`, default 10) and the sorted
  order was observable only at `concurrency: 1`, so whichever hook happened
  to finish first won. Components sharing a priority still run together, so
  the default configuration — every component at priority 0 — is unchanged.
  Shutdown now mirrors startup within a level: the lowest priority stops
  first, the highest last. The same reversal applies to the exported
  `reverseTopologicalSort`, which now reverses each stage's contents as well
  as the stage list.
- `shutdown()` no longer disposes a component whose `stop()` is still
  running. A `stop()` hook that blows its own component `timeout` is
  abandoned rather than cancelled; shutdown only waited for such hooks
  *before* the stop phase, so one abandoned during it had `dispose()` run on
  top of it while `shutdown()` resolved and reported the application
  DISPOSED. Each shutdown phase now waits for abandoned hooks to settle
  before the next one begins, still bounded by the global
  `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer
  cut a drain short.
- Registry and abort failures (`Cannot register components after registry is
  frozen`, `Component "x" is already registered`, an unregistered
  `dependsOn` target, and a cancelled `withAbort`) now throw
  `LifecycleError` from `@zudojs/errors` rather than a bare `Error`, so they
  carry an `ErrorCode` and answer `instanceof LifecycleError`. Messages are
  unchanged.

**@zudojs/container**

- `clearRegistrations()` and `restoreSnapshot()` now invalidate live scopes.
  Both already evicted and disposed cached singletons, but scopes were never
  told, so a scope went on serving the SCOPED instance built from a
  registration that had just been discarded — for the rest of its life, and
  without ever disposing it. A test harness that snapshotted, installed a
  SCOPED fake and then restored kept the fake. Every token that was cached
  when the registry is cleared or restored is now reported as invalidated,
  so live scopes drop and dispose their copies and the next `resolve()`
  rebuilds from the current registration.
- `Container "x" has already been disposed`, `Registrations for container
  "x" are frozen`, `Container scopes are disabled`, the three disposed-scope
  guards, an unregistered `useExisting` target and an unsupported provider
  now throw `ContainerError` / `ContainerLifecycleError` from
  `@zudojs/errors` rather than a bare `Error`. Messages are unchanged.

**@zudojs/runtime**

- `LifecycleManager` with `continueOnFailure: true` no longer initializes or
  readies a module whose declared dependency failed. It previously consulted
  only the failure count, so `api` with `dependencies: ["db"]` had both
  `onInitialize` and `onReady` invoked — and appeared in `start().succeeded`
  — after `db` failed to come up. Such a module is now skipped, reported in
  `initialize().failed` with the blocking dependency named, and the skip
  cascades to its own dependents. Modules independent of the failure still
  continue, and `continueOnFailure: false` (the default, and what
  `createRuntime()` uses) is unaffected.
- Runtime option validation and `RuntimeRegistry.register()` /
  `require()` now throw `RuntimeError` / `RuntimeStateError` rather than a
  bare `Error`. Messages are unchanged.
