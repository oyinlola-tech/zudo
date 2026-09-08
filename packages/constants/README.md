# @zudojs/constants

Shared constants, enums, branded types, and type-safe literals for the Zudojs framework.

## Installation

```bash
npm install @zudojs/constants
```

## Quick Start

```typescript
import type { UserId, Timestamp } from "@zudojs/constants";
import {
  HttpStatus,
  HttpMethods,
  createUserId,
  createTimestamp,
  resolveEnvironment,
  formatDuration,
} from "@zudojs/constants";

const id: UserId = createUserId("user_123");
const now: Timestamp = createTimestamp(new Date().toISOString());
const status = HttpStatus.OK; // 200
const env = resolveEnvironment(); // "development" | "test" | "staging" | "production"
formatDuration(150_000); // "2m 30s"
```

All constant objects are `Object.freeze`d `as const` maps, and every map has a
matching literal-union type (`HttpStatusCode`, `HttpMethod`, `Environment`,
`LifecycleState`, `SchemaIssueCode`, ...). Sets such as `HTTP_METHODS` and
`SCHEMA_FORBIDDEN_KEYS` are immutable at runtime: `add`/`delete`/`clear` throw.

## Modules

### `http`

- `HttpMethods`, `HTTP_METHODS`, `SAFE_HTTP_METHODS`, `IDEMPOTENT_HTTP_METHODS`
- `HttpStatus` plus range helpers (`isSuccessStatus`, `isClientError`, ...)
- `HttpHeader` common header names
- `ContentTypes`, `Charset` (MIME charset labels), `buildContentType()`

### `environment`

- `Environments`, `ENVIRONMENTS`, `isValidEnvironment()`
- `resolveEnvironment(env?, options?)`, `isProduction()`, `isDevelopment()`, `isTest()`

`resolveEnvironment` reads `NODE_ENV` (case-insensitively, accepting the
aliases `dev`/`prod`). An unrecognized value falls back to `"development"` but
logs a `console.warn` once per distinct value, so a typo such as
`NODE_ENV=prodution` is never silent. Use `{ strict: true }` to throw an
`InvalidConstantError` instead, or `{ silent: true }` to suppress the warning.

```typescript
import { resolveEnvironment, isProduction } from "@zudojs/constants";

resolveEnvironment({ NODE_ENV: "PROD" }); // "production"
resolveEnvironment({ NODE_ENV: "prodution" }); // "development" + one-time warning
resolveEnvironment({ NODE_ENV: "prodution" }, { strict: true }); // throws InvalidConstantError
isProduction(); // reads process.env
```

### `time`

- `TimeMs` durations (SECOND ... YEAR), `DefaultTimeout`, `DefaultRetry`
- `TimeUnits` / `TimeUnit`, `toMilliseconds(value, unit)`, `formatDuration(ms)`

```typescript
import { TimeMs, toMilliseconds, formatDuration } from "@zudojs/constants";

const ttl = 5 * TimeMs.MINUTE; // 300_000
toMilliseconds(2, "hours"); // 7_200_000
formatDuration(90_000); // "1m 30s"
formatDuration(4_500_000); // "1h 15m"
```

### `common`

- Branded types (`UserId`, `EventId`, `Timestamp`, `Url`, `EmailAddress`, ...)
  with `createX` factories — the validating ones (`createTimestamp`,
  `createUrl`, `createEmailAddress`, `createHexString`, `createBase64String`,
  `createJsonString`) throw `InvalidConstantError` on bad input
- `Limits`, `Defaults`, `Sentinel` and sentinels `NONE`, `UNINITIALIZED`, `EMPTY`
- Lifecycle state machine: `LifecycleState`, `LifecyclePhase`, `LIFECYCLE_VALID_TRANSITIONS`, timeouts/retries
- Schema constants: `SchemaIssueCode`, `SCHEMA_FORBIDDEN_KEYS` (immutable at runtime), `SCHEMA_STRING_FORMATS`
- Serialization constants: `SerializationFormat`, `SerializationContentType`, `SerializationLimits`, `SerializationTags`

### `validation`

- `ValidationPattern` — the single source of truth for regexes (EMAIL, UUID,
  UUID_V4, IPV4, IPV6, ISO_DATE_TIME, URL, SEMVER, PHONE, FILE_NAME, ...).
  `SCHEMA_STRING_FORMATS` re-exports these rather than redefining them.
- `ValidationLength`, `ValidationRange`

```typescript
import { ValidationPattern, ValidationLength } from "@zudojs/constants";

ValidationPattern.SEMVER.test("1.0.0-alpha-1"); // true (semver.org grammar)
ValidationPattern.IPV6.test("::ffff:192.0.2.1"); // true
ValidationPattern.FILE_NAME.test(".."); // false (path traversal)
ValidationLength.EMAIL; // 254
```

### `cache`

- `CacheStrategies`, `CacheDuration`, `buildCacheControl()`

### `priority`

- `Priorities`, `PriorityWeight`, `comparePriority()`

### `runtime`

- Injectable `Clock` / `Random` interfaces with `systemClock` / `systemRandom`
  (fully `node:crypto`-backed, safe for tokens and salts) and deterministic
  `createMockClock()` / `createMockRandom(seed)` for tests
- `MockClock` adds `advance(ms)` and `set(timestampOrDate)`

```typescript
import {
  createMockClock,
  createMockRandom,
  systemRandom,
} from "@zudojs/constants";

const clock = createMockClock(0);
clock.advance(1_000);
clock.set(new Date("2024-01-01T00:00:00Z"));
clock.now(); // 1704067200000

const rng = createMockRandom(42); // same seed => same sequence
rng.randomInt(1, 6);

systemRandom.randomString(32); // CSPRNG-backed
```

### Errors

- `InvalidConstantError`, `ConstantContextError` (built on `@zudojs/errors`;
  error codes themselves live in `@zudojs/errors`)
