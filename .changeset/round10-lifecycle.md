---
"@zudojs/lifecycle": patch
---

Round 10 fixes.

- **LC-01:** A component `timeout` of NaN or a negative value throws a `RangeError` at `register()`. `Infinity` means unbounded, and finite values above 2^31-1 ms are clamped. Previously these values armed a 1 ms timer, and its callback crashed the process with an uncaught `RangeError`. `withTimeout` validates the same way.
- **LC-02:** A hook that times out is not retried while it is still running. Shutdown waits, within its deadline, for the abandoned hook to settle before calling `stop()`. `LifecycleExecutor.settleAbandoned()` was added.
- **LC-03:** `shutdownTimeout: Infinity` means no deadline, where it used to abort after 1 ms. NaN and negative values throw a `RangeError` from the constructor, and large finite values are clamped.
- **LC-04:** Signal handlers are installed by `start()`, not the constructor, and removed when shutdown finishes. A second signal during shutdown exits with code 1. `installSignalHandlers` gains `forceExitOnSecondSignal` (default true) and `exit`.
- Behaviour changes: a timed-out hook is never retried; constructing a manager no longer touches process signals; invalid timeouts throw at registration or construction.
