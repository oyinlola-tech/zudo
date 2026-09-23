---
"@zudojs/messaging": patch
"@zudojs/runtime": patch
"@zudojs/rpc": patch
"@zudojs/plugins": patch
"@zudojs/events": patch
---

Post-release fixes.

- **messaging:** aborting a dispatch in a browser threw `ReferenceError: setImmediate is not defined`. The abort rejection is now scheduled with `setTimeout(…, 0)`, which keeps the same ordering (a handler that aborts and returns still has its result recorded first) and works in every runtime.
- **runtime:** with `handleSignals: true`, a `SIGTERM`/`SIGINT` under plain `node` could exit the process at once with code 0 — the runtime still `running` or `stopping` and `onShutdown` never finished — whenever nothing else kept the event loop alive (tsx masked this by keeping the loop alive). The signal handler now holds the loop open for the whole graceful shutdown, gives a signal delivered just before the loop drained one turn to be dispatched, and sets `process.exitCode = 1` when the shutdown fails (`stop()` rejects or a module's shutdown hook fails). A clean shutdown leaves the exit code alone, and the process still exits on its own rather than through `process.exit()`. A failed signal-triggered shutdown is now logged as the documented `RuntimeSignalError` ("Shutdown handler failed.") instead of "Shutdown failed.".
- **rpc:** a non-exposed `RPCError` hid its message but sent its custom code: `new RPCError("secret", { code: "TASK_SECRET" })` went out as `{ code: "TASK_SECRET", … }`. It now goes out as `RPC_INTERNAL_ERROR`. A non-exposed error whose code is a standard wire code (a key of `RPC_HTTP_STATUS`, such as `RPC_UNAVAILABLE`) keeps that code with the generic message, and exposed errors keep their code and message as before.
- **plugins:** `dependencies: [{ name: "metrics", optional: true }]` made `start()` throw `PluginDependencyError` when "metrics" was not registered, because only `optionalDependencies` was honoured. `optional: true` inside `dependencies` is now equivalent: skipped when missing, ordered before the dependent (and version-checked) when present.
- **events:** documentation only. A namespace wildcard is multi-level — `"task.*"` matches `task`, `task.created` and `task.sub.created` — which the README and JSDoc now say, along with the fact that there is no single-level wildcard.
