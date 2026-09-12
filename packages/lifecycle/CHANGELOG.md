# @zudojs/lifecycle

## 1.1.0

### Minor Changes

- Startup and rollback bookkeeping fixes (audit round 9). These are behavioural changes.

  - A component that fails a startup phase no longer has its later hooks invoked: a non-critical component whose `initialize()` threw used to have `start()` and `ready()` called anyway.
  - Dependents of a failed component are no longer started. They are marked `FAILED` with a `LifecycleComponentError` naming the failed dependency, emit `component:failed`, and their own `critical` flag decides whether startup aborts (a critical dependent of a failed non-critical dependency now rejects `start()`).
  - When a critical component fails, the results of its siblings in the same stage are still recorded and their state transitions and `component:*` events still fire; they used to be dropped, leaving successful siblings reported as `INITIALIZING`/`STARTING` forever after rollback.
  - Rollback and `shutdown()` only undo phases that actually ran: `stop()` is invoked only on components whose `start` phase ran, `dispose()` only on components whose `initialize` phase ran. Calling `stop()` on a never-started server used to throw and be recorded as a phantom component failure. `shutdown()` on a manager that was never started now runs no hooks.
  - `shutdown()` requested while `start()` is in flight now waits for the executing stage to settle, then stops launching further stages; `start()` rejects with a `LifecycleStartError` (componentId `"application"`). Previously later stages kept starting components after teardown had completed and those components were never stopped.
  - `withAbort()` removes its abort listener when the operation throws synchronously.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
