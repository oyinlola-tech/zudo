# @zudojs/observability

## 1.1.0

### Minor Changes

- Round 10 audit fixes.

  - OBS-01: `tracer.startSpan()` without an explicit `parent` now joins the active propagation context, so logs and spans in one request share a `traceId`. New `withSpan(tracer, name, fn, options?)` and `DefaultTracer.startActiveSpan(name, fn, options?)` run a callback with the span as the active context and end it (recording a throw or rejection).
  - OBS-02: `createSpanContext`, `createChildSpanContext`, `createPropagationContext` and `startSpan` now validate trace and span IDs. An invalid `traceId`/`parentSpanId` (or an invalid parent) starts a fresh trace and drops its trace flags; an invalid `spanId` is replaced. New `parseTraceparent`, `formatTraceparent`, `TRACEPARENT_HEADER` and `isValidSpanContext`.
  - OBS-03: redaction rebuilds objects with `Object.defineProperty`, so an own `__proto__` key stays a data property instead of replacing the output's prototype.
  - OBS-04: `onCardinalityLimit` fires once per rejected series (tracked in a bounded seen-set, separate from the overflow cache); the facade raises `onError` once per over-cardinality metric name.
  - XP-02: new `toLoggerLevel` / `fromLoggerLevel` convert between this package's `LogLevel` (higher = more severe) and `@zudojs/logger`'s inverted `LoggerLevel` numbers.

  Behaviour changes: spans started inside `propagation.run()` are now children of the ambient context (previously a new trace); non-W3C trace/span IDs passed to the context factories are no longer kept verbatim; the facade's `onError` reports cardinality once per metric name instead of once per rejected series.
  - CONV-01 / H5 (phase 2): `ObservabilityError` is now the `@zudojs/errors` class, re-exported (same constructor and defaults). `ExporterError`, `ObservabilityConfigError` and `MetricValueError` stay as thin subclasses, so `instanceof ObservabilityError` matches across both import paths.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - Redaction now covers instances of user-defined classes (DTOs, request models) nested in log contexts and span attributes. Their own enumerable fields are what exporters serialize, so a `password` field on a class instance previously reached the exporter unredacted. Built-ins (`Date`, `Error`, `Map`, `Set`, typed arrays, `URL`) are still left intact, and redacted instances keep their prototype.
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
