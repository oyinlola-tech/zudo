# @zudojs/errors

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
