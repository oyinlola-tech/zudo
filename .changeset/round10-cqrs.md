---
"@zudojs/cqrs": minor
---

Round 10 fixes:

- CQRS-01: `timingMiddleware`'s `onTiming` observer is isolated. If it throws or rejects, a successful command or query stays successful and a failing one keeps its own error. Previously the observer's error replaced the outcome. New opt-in option `onTimingError(error, timing)` receives observer failures; a non-function value throws `InvalidMiddlewareError`.
- CONV-01 / H4 (phase 2): `CqrsError` is now the `@zudojs/errors` class, re-exported (same defaults). Every CQRS subclass extends it, so `instanceof CqrsError` matches across both import paths.
- MSG-02 (phase 2): `composeMiddleware` (and therefore the command and query bus pipelines) is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged: `next(request, context)` still replaces the request and context, a second `next()` still rejects with `MiddlewareExecutionError`, and there is no depth ceiling. It moved to `cqrsMiddleware/cqrsMiddleware.compose.ts` and is still exported from the package root.
