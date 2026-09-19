---
"@zudojs/adapters": minor
---

Round 10 audit fixes (tooling/ADP-01).

- New `AdapterRegistry.healthAll(options?)`: runs `health()` on every adapter that implements it and returns an `AdapterHealthReport` (`status` is the worst per-adapter status). Checks that throw, reject, exceed `options.timeout` or are aborted via `options.signal` are reported as `"unhealthy"` instead of thrown.
- New `AdapterRegistry.configure(name, options)`: forwards to the adapter's `configure()` hook; throws `AdapterConfigurationError` if it has none.
- `createMockAdapter` accepts `Partial<LifecycleAdapter>` and keeps `health` and `configure`.
