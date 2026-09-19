---
"@zudojs/middleware": patch
---

Round 10 fixes:

- MW-01: `rateLimitMiddleware` refreshes a key's recency when it rejects a request, so a throttled key is no longer the first one evicted once `maxKeys` is reached. One new key can no longer reset a throttled client's window.
- XP-01: `MiddlewareError`, `MiddlewareTimeoutError` and `MiddlewareNextCalledMultipleTimesError` are now re-exports of the `@zudojs/errors` classes, and the package-only errors (`MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`) extend the shared `MiddlewareError`. `instanceof` checks against either import path now match. Consequences: codes become `ERR_MIDDLEWARE_EXECUTION` / `ERR_MIDDLEWARE_TIMEOUT` (were `ERR_OPERATION_FAILED`), category becomes `middleware` (was `internal`), `middlewareName` is an own property instead of `metadata.middlewareName`, the timeout and next()-twice messages gain a trailing period, and `MiddlewareNextCalledMultipleTimesError` is non-operational.
- CONV-02: `loggingMiddleware()` without a logger and `withTiming()` without `options.logger` no longer write to `console.log` / `console.warn`; they write nothing. Pass a sink such as `(line) => log.info(line)` from `@zudojs/logger`.
- CV-02 (phase 2): `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError` and `MiddlewareAbortedError` are now re-exports of the `@zudojs/errors` classes (same constructors, messages and fields), so every middleware error class is the shared one.
