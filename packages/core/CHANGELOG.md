# @zudojs/core

## 1.2.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.2.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.2.2

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **CORE-01 (security):** `Container` rejects captive dependencies. When a singleton's construction resolves a `"scoped"` provider, directly or through a transient, the container throws a `DependencyResolutionError` ("Captive dependency: …"). Previously the singleton captured one request's instance and served it to every later request. Resolving a `"scoped"` provider with no active scope now throws, where it used to behave as transient. This matches `@zudojs/container`.
  - **CORE-02:** A bootstrap that hits `startup.timeoutMs` starts no further phase or module hook. `ModuleLifecyclePhaseOptions` gains `signal`. The runtime queues a teardown right away, so a module that comes up late is stopped and destroyed, and `stop()` waits for that teardown.
  - **CORE-03:** An `uncaughtException` or `unhandledRejection` now ends in `exit(1)` after the runtime stops. New `signals.exitOnFatalError` (default true) and `signals.fatalExitTimeout` (default 10000 ms, bounds a hanging shutdown).
  - **CORE-04 (security):** `ContextStorage.run(ctx)` no longer inherits the enclosing execution's `ContextValues` unless it re-enters the current context. `runDerived` still inherits them.
  - **CORE-05:** A failed `Lifecycle.start()` rolls back (stops) the participants that had started. `dispose()` only reaches participants whose `initialize()` ran.
  - **X-01:** `signals.forceExitOnSecondSignal` now defaults to `true`, matching `@zudojs/runtime` and `@zudojs/lifecycle`.
  - Behaviour changes: the captive and no-scope scoped resolutions now throw; the process exits 1 after a fatal error (opt out with `exitOnFatalError: false`); a second signal force-exits (opt out with `forceExitOnSecondSignal: false`); a failed start rolls back, so a retry restarts from the first participant; `dispose()` skips participants that were never initialized.
  - LEAF-16 (phase 2, behaviour change): when `RuntimeOptions.mode` is omitted, the runtime mode is derived from `NODE_ENV` (or `environment.variables.NODE_ENV`) through `resolveEnvironment()` from `@zudojs/constants` instead of always being `"development"`. `prod`/`Production` give `"production"`, `staging` runs as `"production"`, `test` gives `"test"`, unset stays `"development"`. An explicit `mode` still wins.
  - CV-05 (phase 2): the "provider does not implement setConfiguration()" notice is a `process.emitWarning` (type `ZudojsCoreWarning`, code `ZUDOJS_CONFIG_PROVIDER_NO_SET`) instead of `console.warn`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

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
