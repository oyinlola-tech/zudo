---
"@zudojs/cqrs": minor
---

Round 10 fixes:

- CQRS-01: `timingMiddleware`'s `onTiming` observer is isolated. If it throws or rejects, a successful command or query stays successful and a failing one keeps its own error. Previously the observer's error replaced the outcome. New opt-in option `onTimingError(error, timing)` receives observer failures; a non-function value throws `InvalidMiddlewareError`.
