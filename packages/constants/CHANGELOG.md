# @zudojs/constants

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
