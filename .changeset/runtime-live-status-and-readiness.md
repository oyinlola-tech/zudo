---
"@zudojs/runtime": minor
---

Make runtime status and readiness actually live, add a health surface, and give modules a real context.

**`RuntimeStatus` and `RuntimeContext` were frozen snapshots.** Both were built
once at construction, so `state`, `ready`, `health`, `startedAt`, `stoppedAt`
and `error` never changed for the lifetime of the process — a runtime that had
started, become healthy and then stopped still reported the values it had at
construction. They are now derived getters that reflect current state. Code that
captured a status object and read it later will now observe it changing; code
that (correctly) expected live values now gets them.

**`ReadinessTracker.registerCheck` discarded the check function.** It kept the
name and threw the function away, so `initialChecks` never ran and a registered
check could never be re-evaluated. Checks are now retained and executed, and
each result carries a `durationMs`.

**New readiness API on `Runtime`:** `registerReadinessCheck`,
`removeReadinessCheck`, `runReadinessChecks` and a `readiness` getter.
Registering a check on an already-running runtime moves it back to not-ready
until the check passes.

**New health surface.** `src/health/` derives a `RuntimeHealth` from lifecycle
state plus readiness and emits a `runtime.health.changed` event when the derived
health moves. Subscribe to it for liveness/readiness probes instead of polling.

**`LifecycleManager` now builds a real `ModuleContext`.** It previously passed
`{} as ModuleContext` stubs whose `getConfig` always returned `undefined` and
whose `hasModule` always returned `false`. It is now backed by a
`ConfigurationManager`, with a cached per-module context and a throwing getter
for `application`. Modules that silently received `undefined` config will now
receive their actual configuration — check any module that worked around the
old stub behaviour.

Note: `ApplicationContext` is not reachable from `@zudojs/core@0.1.0` (no
`application` barrel export and no `./application` subpath in its `exports`
map), so the runtime cannot construct one. It must be supplied by the host.
