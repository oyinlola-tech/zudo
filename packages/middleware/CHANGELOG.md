# @zudojs/middleware

## 1.0.2

### Patch Changes

- Round 10 fixes:

  - MW-01: `rateLimitMiddleware` refreshes a key's recency when it rejects a request, so a throttled key is no longer the first one evicted once `maxKeys` is reached. One new key can no longer reset a throttled client's window.
  - XP-01: `MiddlewareError`, `MiddlewareTimeoutError` and `MiddlewareNextCalledMultipleTimesError` are now re-exports of the `@zudojs/errors` classes, and the package-only errors (`MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`) extend the shared `MiddlewareError`. `instanceof` checks against either import path now match. Consequences: codes become `ERR_MIDDLEWARE_EXECUTION` / `ERR_MIDDLEWARE_TIMEOUT` (were `ERR_OPERATION_FAILED`), category becomes `middleware` (was `internal`), `middlewareName` is an own property instead of `metadata.middlewareName`, the timeout and next()-twice messages gain a trailing period, and `MiddlewareNextCalledMultipleTimesError` is non-operational.
  - CONV-02: `loggingMiddleware()` without a logger and `withTiming()` without `options.logger` no longer write to `console.log` / `console.warn`; they write nothing. Pass a sink such as `(line) => log.info(line)` from `@zudojs/logger`.
  - CV-02 (phase 2): `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError` and `MiddlewareAbortedError` are now re-exports of the `@zudojs/errors` classes (same constructors, messages and fields), so every middleware error class is the shared one.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `sanitizeLogValue()` (used by `loggingMiddleware`) now escapes the Unicode line separator (U+2028), paragraph separator (U+2029), next-line (U+0085) and the C1 control range, so a request path containing them can no longer split a log line.
- Updated dependencies []:
  - @zudojs/errors@1.0.1

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
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
