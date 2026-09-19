---
"@zudojs/runtime": minor
---

Round 10 fixes.

- **RT-01:** A startup timeout now abandons the startup. No further module hook starts, and a module whose `onInitialize` or `onReady` finishes after the timeout is shut down and destroyed when it settles. `stop()` waits for that teardown, bounded by `shutdownTimeout`. `LifecycleManager` gains `cancel()` and a `cancelled` getter.
- **RT-02:** A second `stop()` after a shutdown timeout joins the teardown that is still running instead of calling every `onShutdown` again. Modules leave `startedModules` as they are stopped.
- **RT-03 (fail-closed):** A configuration manager that fails to load now fails startup with `RuntimeStartError` (`phase: "initialize"`), and the startup rolls back. Previously the failure was logged as a warning and modules initialized against partial configuration.
- **RT-04:** Signal and fatal-error handlers are released after a failed, rolled-back `start()`.
- **RT-05:** `RuntimeOptions` now exposes `exitOnFatalError`, `forceExitOnSecondSignal` and `fatalExitTimeout` and passes them to the signal handler. The defaults are unchanged (true, true, 10000). `LifecycleManagerOptions.shutdownTimeout` is marked deprecated, since it has never had an effect.
- **X-01:** A module whose `onInitialize` threw now has its `onDestroy` run during rollback and teardown, matching `@zudojs/lifecycle` and `@zudojs/core`.
- Behaviour changes: `stop()` after a timed-out startup whose hook never settles rejects with a shutdown timeout instead of reporting a clean stop; config load failures fail startup; `onDestroy` runs for failed initializers.
