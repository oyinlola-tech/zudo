# @zudojs/core

## 1.1.0

### Minor Changes

- Audit round 9 fixes:

  - `createRuntime()` / `createApplication()` / `resolveRuntimeOptions()` now reject an unknown runtime `mode` or `role` with a `TypeError`. Previously `mode: "prod"` was accepted silently and the environment reported neither production, development, nor test.
  - A runtime's `startup.continueOnInitializeError` / `continueOnStartError` (and the shutdown equivalents) are now passed to the `ModuleLifecycleManager` for each phase. With a hand-assembled graph whose manager kept its strict defaults, the manager rolled every module back and the runtime still reported `READY` with zero modules running. `ModuleLifecycleManager.initialize()/start()/stop()/destroy()` accept an optional `{ continueOnError }` (`ModuleLifecyclePhaseOptions`) for the same purpose.
  - Dependencies declared on a module instance (`Module.dependencies`, e.g. `super({ dependencies: ["users"] })` in a `BaseModule` subclass) are now honoured: they order initialization/shutdown, are visible through `context.hasModule()` / `getModuleContext()`, pull in `autoLoad: false` modules, block `unloadModule()`, and fail loading with `MissingModuleDependencyError` when unregistered. They were previously ignored entirely.
  - `ModuleLifecycleManager` builds its dependency graph from loaded modules only. A registered but unloaded definition (`autoLoad: false`) with a missing or circular dependency no longer makes `initialize()`, `start()`, `stop()` or `destroy()` throw for the modules that are loaded.
  - `ApplicationContext.getConfiguration()` reflects `ConfigurationManager.reload()`: `createApplication` now passes a configuration accessor, and `ApplicationContextOptions.configuration` accepts `Configuration | () => Configuration`.
  - `ConfigurationManager.reload()` serialises overlapping calls by sharing the in-flight reload instead of failing the second call with `InvalidStateError`.
  - `Container` keeps "scoped" instances per provider registration, so `unregister()` / `clear()` followed by a new registration for the same token no longer resolves the stale instance in an existing scope.
  - `sanitizeLogValue()` keeps an own `__proto__` key (as produced by `JSON.parse` on untrusted input) as data instead of turning it into the result's prototype and dropping it from structured log output.
  - README: `runWithValues` takes `(context, values, fn)`; configuration events are named `configuration.*`.

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
  - @zudojs/messaging@1.0.0

## 0.1.3

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/messaging@0.1.2

## 0.1.2

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/messaging@0.1.1
