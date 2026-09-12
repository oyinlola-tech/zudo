# @zudojs/errors

## 1.0.1

### Patch Changes

- - A `sensitiveKeyPattern` carrying the `g` or `y` flag (passed to `redactErrorMetadata`, `sanitizeErrorMetadata`, `isSensitiveMetadataKey`, `ErrorSerializer` or `ErrorHandler`) no longer redacts on one call and leaks the same key on the next.
  - `ErrorSerializer` (and therefore `serializeError`/`ErrorHandler.toLogObject`) now applies `redactSensitiveData` to plain-object causes, which were previously copied verbatim into the serialized cause chain; the cause's shape (dates, arrays, class instances) is preserved and cycles stop at `"[Circular]"`.

## 0.2.0

### Minor Changes

- [`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Harden error classification, public serialization and metadata handling.

  These are behavioural changes. Code that compiles unchanged may now produce
  different HTTP status codes and different response bodies.

  **Native errors are no longer treated as client input.** `mapNativeError` (and
  `mapError` falling through to it) previously classified native `TypeError`,
  `RangeError` and `SyntaxError` as 400 client errors. They are overwhelmingly
  programmer bugs, not bad input, so they are now non-operational internal errors:
  **500, not exposed**. If your handler relied on a thrown `TypeError` surfacing to
  the client as a 400, register an explicit mapping rule with `mapErrorType` to
  restore that behaviour for the specific error type you mean.

  **Public 500 bodies no longer carry metadata.** The public serializers emitted
  `metadata` for non-exposed errors, leaking internal detail to clients. Metadata
  is now included only for exposed errors, or when the serializer is explicitly
  configured to include it. Clients that read `metadata` off a 500 response will
  now see it absent.

  **Corrected HTTP status codes.** Several errors returned a status that did not
  match their semantics and now map to the correct one: **412** (precondition
  failed), **413** (payload too large), **415** (unsupported media type), **423**
  (locked) and **502** (bad gateway). Assertions pinned to the previous codes will
  need updating.

  **Server-side registry errors are 500 and non-exposed.** Failures originating in
  the error registry itself are internal faults and are no longer reported as
  client errors.

  **`BaseError.withMetadata` no longer re-runs the constructor.** It previously
  rebuilt the error by invoking the subclass constructor, which re-ran any
  constructor side effects and discarded fields a subclass had set outside the
  constructor's argument path. It now clones the existing instance and merges
  metadata. Subclasses that depended on constructor re-execution to derive fields
  will see those fields preserved from the original instance instead of recomputed.

## 0.1.1

### Patch Changes

- Audit hardening (round 6):
  - `BaseError.withMetadata` clones the instance instead of re-running the constructor, so it works for every subclass regardless of constructor signature and preserves message, code, status, cause and own fields.
  - Public serialization (`serializePublicError`, `ErrorSerializer.serializePublic`, `ErrorHandler.toPublicResult` / `handlePublic`) never emits metadata for non-exposed errors unless keys are allow-listed via `publicMetadataKeys`; redaction is recursive, case-insensitive and pattern-based and is applied to cause chains. `ErrorHandler.toResult` is documented as the internal representation and `serialize` never includes a stack.
  - Native `TypeError` / `RangeError` / other `Error`s map to `ERR_INTERNAL_ERROR` (500, not exposed, non-operational) instead of exposed 400 validation errors. All normalizers (`toBaseError`, `normalizeToBaseError`, `normalizeUnknownError`, `ErrorHandler.normalize`) share one implementation (`normalizeUnknownToBaseError`) and keep the thrown value as `cause`.
  - Metadata is deep-cloned and deep-frozen; `__proto__` / `constructor` / `prototype` keys are dropped; cycles and excessive depth are guarded. New `redactErrorMetadata` (plus `SENSITIVE_METADATA_KEY_PATTERN`, `isSensitiveMetadataKey`) removes secrets; `sanitizeErrorMetadata` only removes unsupported values unless `{ redact: true }`.
  - `toJSON` is cycle-safe, depth-limited and includes nested native `cause.cause`; `getErrorCategory` / `getErrorSeverity` return real enum members; `isBaseError` and the other guards recognise instances from another installed copy of the package via a `Symbol.for` brand.
  - `HttpClientAbortError(request?, cause?, options?)` / `HttpClientNetworkError(message, request?, cause?, options?)` always treat the cause argument as the cause; `HttpClientError` defaults to category `network`, maps upstream status to 502 (429 passed through) and strips credentials/query from `url`.
  - `RequestBodyTooLargeError` is a 413; `TimeoutError` is only exposed by default for request timeouts; `ExternalServiceError` maps upstream 4xx to 502 (except 429); container/adapter registry errors and `RoutePatternError` are 500, not exposed and non-operational (`InvalidRoutePatternError` now extends `RoutePatternError`).
  - All HTTP status error classes use `ErrorCode.HTTP_*` members; new codes `CACHE`, `DATABASE_MIGRATION`, `RUNTIME`, `HTTP_CLIENT*`, `MESSAGE_BUS_DISPOSED` (the mis-cased `MESSAGE_BUSDisposed` member is deprecated). `storageNotFoundError` uses `STORAGE_NOT_FOUND`; `databaseMigrationError` uses `DATABASE_MIGRATION`.
  - `ErrorHandler` isolates reporter failures (`onReporterError` hook); `mapErrorType` accepts any error constructor; `createErrorMappingRule` / `mapErrorType` accept a declarative `ErrorMapping`; timeout factories accept an options object; `externalServiceUnavailableError` creates an `ExternalServiceError` (the `NetworkError` variant is `networkServiceUnavailableError`); `MethodNotAllowedError` serializes its methods; `cryptoSignatureError` picks its default message from the operation; enum guards use precomputed sets.
  - Packaging: `test` script, `vitest.config.ts`, `tsconfig.test.json` (tests are type-checked), `sideEffects: false`, source maps excluded from the tarball, stray self-referencing `errors` symlink removed.

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
