---
"@zudojs/core": minor
---

Round 10 fixes.

- **CORE-01 (security):** `Container` rejects captive dependencies. When a singleton's construction resolves a `"scoped"` provider, directly or through a transient, the container throws a `DependencyResolutionError` ("Captive dependency: …"). Previously the singleton captured one request's instance and served it to every later request. Resolving a `"scoped"` provider with no active scope now throws, where it used to behave as transient. This matches `@zudojs/container`.
- **CORE-02:** A bootstrap that hits `startup.timeoutMs` starts no further phase or module hook. `ModuleLifecyclePhaseOptions` gains `signal`. The runtime queues a teardown right away, so a module that comes up late is stopped and destroyed, and `stop()` waits for that teardown.
- **CORE-03:** An `uncaughtException` or `unhandledRejection` now ends in `exit(1)` after the runtime stops. New `signals.exitOnFatalError` (default true) and `signals.fatalExitTimeout` (default 10000 ms, bounds a hanging shutdown).
- **CORE-04 (security):** `ContextStorage.run(ctx)` no longer inherits the enclosing execution's `ContextValues` unless it re-enters the current context. `runDerived` still inherits them.
- **CORE-05:** A failed `Lifecycle.start()` rolls back (stops) the participants that had started. `dispose()` only reaches participants whose `initialize()` ran.
- **X-01:** `signals.forceExitOnSecondSignal` now defaults to `true`, matching `@zudojs/runtime` and `@zudojs/lifecycle`.
- Behaviour changes: the captive and no-scope scoped resolutions now throw; the process exits 1 after a fatal error (opt out with `exitOnFatalError: false`); a second signal force-exits (opt out with `forceExitOnSecondSignal: false`); a failed start rolls back, so a retry restarts from the first participant; `dispose()` skips participants that were never initialized.
- LEAF-16 (phase 2, behaviour change): when `RuntimeOptions.mode` is omitted, the runtime mode is derived from `NODE_ENV` (or `environment.variables.NODE_ENV`) through `resolveEnvironment()` from `@zudojs/constants` instead of always being `"development"`. `prod`/`Production` give `"production"`, `staging` runs as `"production"`, `test` gives `"test"`, unset stays `"development"`. An explicit `mode` still wins.
- CV-05 (phase 2): the "provider does not implement setConfiguration()" notice is a `process.emitWarning` (type `ZudojsCoreWarning`, code `ZUDOJS_CONFIG_PROVIDER_NO_SET`) instead of `console.warn`.
