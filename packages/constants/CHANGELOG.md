# @zudojs/constants

## 1.2.0

### Minor Changes

- Round 12 (academy findings) for the TYPES group.

  **Security default change — `@zudojs/errors` ([#38](https://github.com/oyinlola-tech/zudo/issues/38)).** `serializePublicError`, `ErrorSerializer.serializePublic` and `ErrorHandler.toPublicResult` no longer publish the metadata of an error just because it has `expose: true`. `expose` says the _message_ is safe for a client; the metadata of an exposed error (decline codes, upstream ids, internal state) was going out with it. Metadata is now published only for keys named in `publicMetadataKeys`, or, with the new opt-in `exposeMetadata: true` on `ErrorSerializerOptions` / `ErrorHandlerOptions`, for exposed errors as before (still redacted). If your API relied on exposed metadata reaching clients, set `publicMetadataKeys` (preferred) or `exposeMetadata: true`.

  - `@zudojs/errors` ([#111](https://github.com/oyinlola-tech/zudo/issues/111)): public serialization now carries `issues` for an exposable `ValidationError`, `SchemaError` or any exposed error with an `issues` array, with submitted values replaced by type descriptions (`PublicErrorResponse.issues`, `PublicErrorHandlerResult.issues`). Non-exposed errors never contribute issues.
  - `@zudojs/errors` ([#92](https://github.com/oyinlola-tech/zudo/issues/92)): `new ExternalServiceError("msg")` from JavaScript (or any call that omits the options object) constructs with `service: "unknown"` instead of throwing a `TypeError` from inside the error constructor. The TypeScript signature still requires `service`.
  - `@zudojs/errors` ([#133](https://github.com/oyinlola-tech/zudo/issues/133)): `ServiceUnavailableError` exposes its message by default, like `APIUnavailableError` and `RPCUnavailableError`; a 503 message is written for the client. Pass `expose: false` to keep it internal. Metadata is not exposed by this (see [#38](https://github.com/oyinlola-tech/zudo/issues/38)).
  - `@zudojs/errors` ([#39](https://github.com/oyinlola-tech/zudo/issues/39)): `BaseError.code` / `BaseErrorOptions.code` document that `ErrorCode | string` is a deliberately open set; narrow with `isErrorCode()` before an exhaustive `switch`.
  - `@zudojs/errors` ([#48](https://github.com/oyinlola-tech/zudo/issues/48), for `@zudojs/middleware` and `@zudojs/http`): `MiddlewareRateLimitError` is now a 429 with `ErrorCode.RATE_LIMITED` (was a 500 with `ERR_MIDDLEWARE_EXECUTION`), an exposed message, severity `WARNING`, `metadata { limit, windowMs, retryAfterMs }` and a `headers` property `{ "retry-after": "<whole seconds, at least 1>" }` that `@zudojs/http`'s error response copies onto the reply. `MiddlewareTimeoutError` is a 504 (code and `expose: false` unchanged). Anything matching the rate-limit error on `code === "ERR_MIDDLEWARE_EXECUTION"` must match `ERR_RATE_LIMITED` instead; nothing in the monorepo did.
  - `@zudojs/errors` (request from the HTTP group): `RouteConflictError(path, method, options?)` takes an optional third argument `{ message?, reason?, cause? }`. `reason` is recorded in `metadata.reason` and reported as "A route for METHOD /path conflicts with an existing route: <reason>"; `message` replaces the text entirely. Code and the two-argument form are unchanged.
  - `@zudojs/validation` ([#57](https://github.com/oyinlola-tech/zudo/issues/57)): `estimateSerializedSize` / `assertSizeWithinLimit` charge strings their UTF-8 size as JSON writes them (quotes and escapes included) instead of `length * 2`; a thousand "₦" estimated at 2,013 bytes against 3,002 on the wire, so a size limit let larger bodies through. Object keys are measured the same way. Estimates for non-ASCII payloads go up accordingly.
  - `@zudojs/validation` ([#58](https://github.com/oyinlola-tech/zudo/issues/58)): `validate()`, `isValid()`, `parse()` and the validators built from them throw `ConfigurationError` (not a bare `Error`) when the Zod schema has an async `refine`/`transform`, and the message names `validateAsync()`.
  - `@zudojs/validation` ([#59](https://github.com/oyinlola-tech/zudo/issues/59)): `ValidationRegistry` misuse (unknown rule, duplicate registration, empty name, rule without implementation) throws `ConfigurationError` with `component: "ValidationRegistry"`; message text is unchanged. `createValidationError()` defaults to `VALIDATION_INVALID_INPUT` instead of `VALIDATION_UNKNOWN` (the `ValidationError` constructor's default is unchanged). `not()` without a message says `Value must not satisfy the "one of" constraint.` rather than naming `one_of`; `combineConstraints()` lists the member messages; `everyItem()` says "Every item must satisfy: …"; `formatIssues()` prints a path-less issue without a leading colon.
  - `@zudojs/schema` ([#60](https://github.com/oyinlola-tech/zudo/issues/60)): `string().min()/max()/length()` count Unicode code points (an emoji is one character), matching `@zudojs/validation`'s `minLength`. The DoS ceiling on string length counts the same way. A string of astral characters that previously failed `min()` or passed `max()` by UTF-16 units may now be judged differently.
  - `@zudojs/schema` ([#61](https://github.com/oyinlola-tech/zudo/issues/61)): `isSchemaValidationError()` also recognises `@zudojs/validation`'s `SchemaValidationError` (any `BaseError` with `ERR_SCHEMA_VALIDATION` and an issue list), so an error mapper keyed on it keeps the `issues` of validation-package errors. Recognition uses `isBaseError`, so a second installed copy of `@zudojs/errors` is handled.
  - `@zudojs/schema` ([#72](https://github.com/oyinlola-tech/zudo/issues/72)): `schema.enum([...])` and `schema.literal(...)` use `const` type parameters, so their literal types survive when written inline inside `union([...])` or an object shape; `UnionSchema.parse()` now returns the literal union `Infer<>` promised instead of `string`.
  - `@zudojs/schema` ([#73](https://github.com/oyinlola-tech/zudo/issues/73)): `object()`, `array()`, `record()`, `map()`, `set()` and `intersection()` extend `ModifiableSchema`, so `.refine()`, `.optional()`, `.nullable()`, `.default()` and `.transform()` chain on them as on primitives.
  - `@zudojs/serialization` ([#74](https://github.com/oyinlola-tech/zudo/issues/74)): `SerializationMetadata.version` is documented as the envelope's wire-format version (`SERIALIZATION_SCHEMA_VERSION`), and `createEnvelope()` now throws `SerializationError` for a version this build cannot read back (previously `{ version: 2 }` was accepted and then refused by `unwrapEnvelope` in the same process). New optional `metadata.type` and `metadata.schemaVersion` carry the application's message name and shape version verbatim; `serializeToEnvelope()` takes them as a fifth argument, and `assertValidEnvelope()` checks their types.
  - `@zudojs/types`: new `characterLength(value)` (code points) and `jsonStringByteLength(value)` (UTF-8 bytes of `JSON.stringify(value)`), the shared helpers behind [#57](https://github.com/oyinlola-tech/zudo/issues/57) and [#60](https://github.com/oyinlola-tech/zudo/issues/60).
  - `@zudojs/constants` ([#36](https://github.com/oyinlola-tech/zudo/issues/36), [#40](https://github.com/oyinlola-tech/zudo/issues/40)): `createUserId`, `createEventId`, `createRequestId`, `createCorrelationId`, `createSessionId`, `createMessageId`, `createMessageCausationId` and `createTokenId` throw `InvalidConstantError` for an empty string or a non-string (the value is never echoed); new `assertIdentifier(id, label)`. `Brand<T, B>` documents that the brand is compile-time only and why the key is a string rather than a `unique symbol`.
  - `@zudojs/constants` ([#37](https://github.com/oyinlola-tech/zudo/issues/37)): `formatDuration(-90_000)` is "-1m 30s" instead of "-90000ms"; the two-unit truncation is documented.
  - `@zudojs/constants` ([#35](https://github.com/oyinlola-tech/zudo/issues/35)): the `Clock`/`Random`/`systemClock`/`systemRandom`/`createMockClock`/`createMockRandom` exports are marked `@deprecated` in favour of `@zudojs/types`, which owns them; nothing is removed.
  - `@zudojs/errors` ([#100](https://github.com/oyinlola-tech/zudo/issues/100)): `AdapterTimeoutError` answers `504` and `AdapterConnectionError` `503` (were `500`); both stay unexposed.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0

## 1.1.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.1.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.1.2

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.1.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - X-05 (behaviour change): `createTenantId` validates now. It NFKC-normalizes, trims and lowercases, then enforces `[a-z0-9][a-z0-9_-]*` and 64 characters (the `@zudojs/tenancy` rule), and throws `InvalidConstantError` otherwise. New exports: `TENANT_ID_PATTERN` and `MAX_TENANT_ID_LENGTH`.
  - LEAF-04 (behaviour change): `ValidationPattern.EMAIL` (and so `createEmailAddress` and `SCHEMA_STRING_FORMATS.EMAIL`) accepts the same set as `isEmail` in `@zudojs/types`. It now accepts `o'brien@example.com`, `user@host.123` and `a@b.c`, still rejects `..`, and has the 254-character bound built in.
  - LEAF-05 (type-level change): `Random` is branded. `createMockRandom` returns the new `MockRandom` type (`deterministic: true`), which is not assignable to `Random`. `RandomSource` holds the shared methods.
  - LEAF-06: `createTimestamp` rejects dates and times that do not exist (`2024-02-30`, `24:00`, minute 60, offset hour 24).
  - LEAF-12 (behaviour change): the immutable sets (`SCHEMA_FORBIDDEN_KEYS`, `HTTP_METHODS`, ...) keep their values in private storage, so `Set.prototype.clear.call(set)` throws. They implement `ReadonlySet` but are no longer `Set` instances.
  - CV-02: `InvalidConstantError` and `ConstantContextError` are now owned by `@zudojs/errors` and re-exported here.
  - SER-03 (phase 2, new API): `SerializationLimits.MAX_BIGINT_DIGITS` (4096), the shared bound on decimal digits accepted when decoding or coercing a BigInt from text. `@zudojs/serialization` and `@zudojs/schema` use it.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

> Note: this changelog was corrected. An earlier revision contained an
> erroneous `1.0.0` entry (describing a package rename) that never shipped —
> the package has never been published above `0.1.x`.

## Unreleased

Audit follow-up (behavioural fixes; no public export was removed):

- `formatDuration` now renders minutes correctly (`90_000` => `"1m 30s"`).
- `systemRandom` is fully `node:crypto`-backed (including `random()`);
  `createMockRandom` uses `Math.imul` and never returns `1.0`.
- `HTTP_METHODS`, `SAFE_HTTP_METHODS`, `IDEMPOTENT_HTTP_METHODS`,
  `ENVIRONMENTS`, and `SCHEMA_FORBIDDEN_KEYS` are immutable at runtime.
- `ValidationPattern` is the single source of truth for regexes;
  `SCHEMA_STRING_FORMATS` references it. `SEMVER` follows semver.org,
  `ISO_DATE_TIME`/`DATETIME` is anchored, `IPV6` accepts compressed forms,
  `PHONE` requires digits, `FILE_NAME` rejects `.`/`..`/Windows reserved
  names, `UUID` accepts any version (`UUID_V4` is strict).
- `resolveEnvironment` warns once per unrecognized `NODE_ENV` value
  (`{ silent: true }` to suppress, `{ strict: true }` to throw).
- `LifecycleState`, `LifecyclePhase`, and `SchemaIssueCode` are `as const`
  objects with same-named literal-union types instead of TS `enum`s.
- `HttpStatusCode`, `HttpHeaderName`, and `ContentType` are literal unions;
  `HttpStatus` covers the full IANA registry.
- `createMockClock` gains `advance(ms)` and `set(timestampOrDate)`.
- `buildCacheControl` validates durations and ignores them for `no-store`;
  `buildContentType` skips `charset` for `multipart/*`.
- Numeric constants are derived from a single source (`Limits`, `TimeMs`,
  `DefaultRetry`, `ContentTypes`); `Charset.ASCII` is `us-ascii`;
  `SerializationContentType.MSGPACK` is `application/x-msgpack`.
- Build cache no longer ships in the npm tarball.

## 0.1.0

Current release. Versions across the Zudojs monorepo were aligned to `0.1.0`
with exact dependency versions (`@zudojs/errors@0.1.0`).

Includes:

- HTTP methods, status codes, headers, and content types
- Environment detection utilities
- Time durations, timeouts, and retry defaults
- Branded domain identifier types and factories
- Validation patterns, lengths, and ranges
- Cache strategies and Cache-Control builder
- Priority levels and comparison
- Injectable Clock/Random runtime interfaces
- Package-specific error classes built on `@zudojs/errors`
