# @zudojs/constants

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
