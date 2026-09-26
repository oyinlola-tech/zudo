---
title: "@zudojs/constants — Shared Constants, Enums & Type-Safe Literals"
description: "@zudojs/constants docs: branded ID types, HTTP constants, lifecycle states, validation patterns, cache strategies and serialization limits for ZudoJS."
source: https://zudojs.oyinlola.site/docs/packages-constants
---

v1.1.0

# @zudojs/constants

One place to import the fixed values every Zudo package agrees on: HTTP codes, time durations, environment names, validation patterns, and the branded id types that keep them apart.

SHARED VOCABULARY NO SIDE EFFECTS TypeScript

## OVERVIEW

A *constant* is a value that never changes while your program runs. `200` is always "OK", a minute is always 60000 milliseconds, and `"production"` is always spelled that way. `@zudojs/constants` collects those values so every package in the framework, and your own code, spells them identically.

It also ships a handful of small helper functions that go with those values — checking whether a status code is an error, turning hours into milliseconds, building a `Cache-Control` header — plus a set of *branded* id types that stop you from passing a user id where an event id belongs.

Nothing here talks to a network, a disk, or a clock you did not give it. The package is data and pure functions. Its only dependency is `@zudojs/errors`, which supplies the base class for the two errors it throws.

When you need it

- You are writing numbers like `200`, `3600000` or `"production"` by hand in more than one file.
- You want TypeScript to catch a typo such as `"prodution"` or `"aplication/json"`.
- Two id types are both strings and you keep mixing them up.
- A test needs time or randomness to be predictable.

When you don't

- The value belongs to your app alone (a route path, a feature name). Keep that in your own module.
- The value can change at run time. That is configuration, not a constant — use `@zudojs/config`.
- You need a full validation library. This package holds regexes and limits, not a validator; that is `@zudojs/validation`.

## INSTALLATION

Install the package. It pulls in `@zudojs/errors` on its own. It needs Node 24 or newer, and it is ESM only.

```bash
$ npm install @zudojs/constants
```

There is a single entry point. Every export on this page comes from `"@zudojs/constants"` — there are no per-module subpaths such as `"@zudojs/constants/http"`.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> WATCH OUT
>
>
>
> An earlier build of this package published an empty `dist` folder because of a stale TypeScript build cache. If `import { HttpStatus } from "@zudojs/constants"` gives you `undefined`, you are on that build. Update to the latest release.

## QUICK START

This reads the current environment, picks a timeout, and decides what a status code means.

```ts
import {
  resolveEnvironment,
  DefaultTimeout,
  TimeMs,
  HttpStatus,
  isErrorStatus,
  formatDuration,
} from "@zudojs/constants";

const env = resolveEnvironment();
console.log(env);
// "development"   (NODE_ENV is not set here)

const timeout = env === "production"
  ? DefaultTimeout.STANDARD
  : 5 * TimeMs.MINUTE;
console.log(formatDuration(timeout));
// "5m"

console.log(HttpStatus.NOT_FOUND, isErrorStatus(HttpStatus.NOT_FOUND));
// 404 true
```

Every constant object is frozen, so `HttpStatus.OK = 999` throws in strict mode instead of quietly corrupting the value for every other file that imported it.

## CONSTANT OR PLAIN LITERAL?

You do not have to import a constant to write `200`. The question is whether the name buys you something. It usually buys you one of three things.

- **The compiler checks your spelling.** Each constant map has a matching union type — `HttpMethod`, `Environment`, `CacheStrategy`, `Priority`, `LifecycleState`. Declare a parameter as that type and a typo stops the build.
- **The number is hard to read.** `TimeMs.DAY` says what `86400000` means, and you cannot lose a zero.
- **Other packages must agree with you.** If `@zudojs/cache` and your handler both mean the same 10 MB limit, both should read `Limits.MAX_FILE_SIZE`.

Where none of that applies — a one-off `if (code === 418)` in a single file — the literal is fine. Reach for the constant when the value crosses a file boundary.

The union types are the real payoff. Here a function accepts only the four environment names, so a typo is caught before the program runs.

```ts
import { type Environment, Environments } from "@zudojs/constants";

function bannerFor(env: Environment): string {
  return env === Environments.PRODUCTION ? "LIVE" : env.toUpperCase();
}

console.log(bannerFor("staging"));
// "STAGING"

bannerFor("prodution");
// Type error: "prodution" is not assignable to Environment
```

> TIP
>
>
>
> Names like `HttpMethods` (plural, a value you can read at run time) and `HttpMethod` (singular, a type that only exists at compile time) come in pairs. Import the plural with `import { }`, the singular with `import { type }`.

**Common mistake.** Writing `const method: HttpMethods = "GET"`. `HttpMethods` is a value, not a type, so TypeScript rejects it. The type is `HttpMethod`.

## HTTP: METHODS, STATUS, HEADERS, TYPES

Four maps cover the wire format of an HTTP message: `HttpMethods` (GET, POST, …), `HttpStatus` (the numeric codes), `HttpHeader` (header names, correctly capitalised), and `ContentTypes` (MIME types). Each is a frozen object whose keys are shouty and whose values are the real strings or numbers.

Alongside them sit five range checks — `isSuccessStatus`, `isRedirectStatus`, `isClientError`, `isServerError`, `isErrorStatus` — that take any number, so they work on codes a third-party server invented too.

This reads a few of the constants and runs two of the checks.

```ts
import {
  HttpMethods,
  HttpStatus,
  HttpHeader,
  ContentTypes,
  Charset,
  buildContentType,
  isSuccessStatus,
  isServerError,
  SAFE_HTTP_METHODS,
} from "@zudojs/constants";

console.log(HttpMethods.GET, HttpStatus.CREATED);
// "GET" 201

console.log(HttpHeader.CONTENT_TYPE, HttpHeader.X_REQUEST_ID);
// "Content-Type" "X-Request-Id"

console.log(buildContentType(ContentTypes.JSON, Charset.UTF_8));
// "application/json; charset=utf-8"

console.log(isSuccessStatus(204), isServerError(503));
// true true

console.log(SAFE_HTTP_METHODS.has("GET"), SAFE_HTTP_METHODS.has("POST"));
// true false
```

Three ready-made sets answer membership questions: `HTTP_METHODS` (all nine), `SAFE_HTTP_METHODS` (GET, HEAD, OPTIONS — the ones that must not change anything) and `IDEMPOTENT_HTTP_METHODS` (safe to send twice: GET, HEAD, PUT, DELETE, OPTIONS, TRACE). They are immutable at run time: `add`, `delete` and `clear` throw a `TypeError` rather than silently letting a caller widen the rules.

`buildContentType` skips the charset for `multipart/*` types, because a multipart body takes a `boundary` parameter instead. It throws `InvalidConstantError` on an empty MIME type or a blank charset.

```ts
import { buildContentType, ContentTypes } from "@zudojs/constants";

console.log(buildContentType(ContentTypes.MULTIPART_FORM_DATA, "utf-8"));
// "multipart/form-data"   (charset dropped on purpose)
```

**Common mistake.** Typing a value as `HttpStatusCode` when it came from another server. `HttpStatusCode` is only the codes listed in `HttpStatus`; for anything else use `AnyHttpStatusCode`, which is just `number`. The same pairing exists for headers (`AnyHttpHeaderName`) and MIME types (`AnyContentType`).

## ENVIRONMENT

An *environment* is which copy of your app is running: the one on your laptop, the one running tests, the staging clone, or the real thing. Node convention keeps that in the `NODE_ENV` environment variable, and `resolveEnvironment()` reads it for you.

It normalises case and accepts the common short forms `dev` and `prod`. Unset or empty means `"development"`. A value it does not recognise also falls back to `"development"`, but it warns once per distinct value so a typo in a deployment cannot pass unnoticed.

You can pass your own map of variables instead of reading `process.env`, which is what makes this testable.

```ts
import {
  resolveEnvironment,
  isValidEnvironment,
  isProduction,
  ENVIRONMENTS,
} from "@zudojs/constants";

console.log(resolveEnvironment({ NODE_ENV: "PROD" }));
// "production"

console.log(resolveEnvironment({ NODE_ENV: "prodution" }));
// "development"  + one console.warn about the unrecognised value

console.log(isValidEnvironment("staging"), isValidEnvironment("local"));
// true false

console.log(ENVIRONMENTS.size, isProduction({ NODE_ENV: "production" }));
// 4 true
```

In a deployment you usually want the typo to be loud rather than merely logged. Pass `{ strict: true }` and an unrecognised value throws an `InvalidConstantError`; pass `{ silent: true }` to drop the warning instead.

```ts
import { resolveEnvironment } from "@zudojs/constants";

resolveEnvironment({ NODE_ENV: "prodution" }, { strict: true });
// throws InvalidConstantError: Unrecognized NODE_ENV value: "prodution"
```

**Common mistake.** Calling `resolveEnvironment("staging")` to force a value. The first argument is a map of environment variables, not a name, so that call is a type error. Write `resolveEnvironment({ NODE_ENV: "staging" })`.

## TIME, TIMEOUTS AND RETRIES

Every duration in the framework is a number of milliseconds. `TimeMs` names the common ones so you multiply instead of counting zeros: `MILLISECOND`, `SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, `MONTH` (30 days) and `YEAR` (365 days).

`DefaultTimeout` and `DefaultRetry` are starting points for settings you have no strong opinion about yet. `toMilliseconds` converts from a unit, and `formatDuration` turns milliseconds back into something a human reads in a log line.

This builds a TTL, converts a duration, and formats two for display.

```ts
import {
  TimeMs,
  DefaultTimeout,
  DefaultRetry,
  toMilliseconds,
  formatDuration,
} from "@zudojs/constants";

const ttl = 5 * TimeMs.MINUTE;
console.log(ttl);
// 300000

console.log(toMilliseconds(2, "hours"));
// 7200000

console.log(formatDuration(90_000), formatDuration(4_500_000));
// "1m 30s" "1h 15m"

console.log(DefaultTimeout.DATABASE, DefaultRetry.MAX_ATTEMPTS);
// 15000 3
```

### DefaultTimeout

| Name | Value (ms) | Use it for |
| --- | --- | --- |
| `FAST` | 1000 | A quick in-memory operation, such as a cache lookup. |
| `STANDARD` | 10000 | An ordinary call out to another service. |
| `SLOW` | 30000 | Heavy work such as a file upload. |
| `BACKGROUND` | 60000 | A job nobody is waiting on. |
| `DATABASE` | 15000 | A database query. |
| `HTTP_REQUEST` | 10000 | An outbound HTTP request. |
| `WEBSOCKET` | 5000 | Opening a WebSocket connection. |

`DefaultRetry` holds `MAX_ATTEMPTS` (3), `BASE_DELAY_MS` (1000), `MAX_DELAY_MS` (30000) and `BACKOFF_MULTIPLIER` (2).

**Common mistake.** Confusing `DefaultRetry.MAX_ATTEMPTS` (3) with `Limits.MAX_RETRY_ATTEMPTS` (10). The first is what a caller gets when they configure nothing; the second is the highest number a caller is allowed to ask for.

## VALIDATION PATTERNS AND LIMITS

A *regular expression* (regex) is a pattern that says which strings are acceptable. Getting one right for email or IPv6 is fiddly, so `ValidationPattern` keeps a tested set in one place. These are the framework's single source of truth: `SCHEMA_STRING_FORMATS` points at the same objects rather than redefining them.

`ValidationLength` holds maximum character counts and `ValidationRange` holds numeric bounds, so a check like "is this a legal port?" reads the same everywhere.

This checks a few values against the shared patterns and limits.

```ts
import {
  ValidationPattern,
  ValidationLength,
  ValidationRange,
} from "@zudojs/constants";

console.log(ValidationPattern.SEMVER.test("1.0.0-alpha-1"));
// true

console.log(ValidationPattern.IPV6.test("::ffff:192.0.2.1"));
// true

console.log(ValidationPattern.FILE_NAME.test(".."));
// false   (path traversal is rejected)

console.log(ValidationLength.EMAIL, ValidationRange.MAX_PORT);
// 254 65535
```

| Pattern | Matches | Notes |
| --- | --- | --- |
| `EMAIL` | An email address. | Pragmatic subset of RFC 5322. Pair it with `ValidationLength.EMAIL` (254). The same acceptance set as `isEmail` in @zudojs/types. |
| `UUID` / `UUID_V4` | Any UUID / strictly a version 4 UUID. | Use `UUID_V4` when the version matters. |
| `IPV4` / `IPV6` | IP addresses. | `IPV6` covers compressed and IPv4-mapped forms. |
| `ISO_DATE_TIME` / `ISO_DATE` | `2026-01-15T10:30:00.000Z` / `2026-01-15`. | `createTimestamp` uses the first one. |
| `ALPHANUMERIC` / `SLUG` | Letters and digits / lowercase words joined by hyphens. | Good for url segments and identifiers. |
| `STRONG_PASSWORD` | 8+ characters with upper, lower, digit and symbol. | A floor, not a whole policy. |
| `URL` / `HEX_COLOR` / `PHONE` | http(s) URLs / `#abc` or `#aabbcc` / E.164 numbers. | — |
| `SEMVER` | `1.2.3`, `2.0.0-rc.1+build.5`. | No leading `v`; leading zeros rejected. |
| `FILE_NAME` | A file name with no path in it. | Rejects `.`, `..`, and Windows device names such as `CON`. |

**Common mistake.** Copying a pattern into your own file and editing it. The copy drifts from the one `@zudojs/schema` and `@zudojs/validation` use, so the same string passes in one layer and fails in the next. Import it instead.

## CACHE HEADERS AND PRIORITY

`Cache-Control` is the HTTP header that tells browsers and proxies whether they may keep a copy of a response, and for how long. `CacheStrategies` names the directives, `CacheDuration` holds sensible lifetimes **in seconds** (the unit that header uses), and `buildCacheControl` assembles the string.

This builds a header for a page that may be cached publicly for an hour.

```ts
import {
  CacheStrategies,
  CacheDuration,
  buildCacheControl,
} from "@zudojs/constants";

console.log(buildCacheControl({
  strategy: CacheStrategies.PUBLIC,
  maxAge: CacheDuration.LONG,
  staleWhileRevalidate: CacheDuration.SHORT,
}));
// "public, max-age=3600, stale-while-revalidate=10"

console.log(buildCacheControl({ strategy: CacheStrategies.NO_STORE, maxAge: 60 }));
// "no-store"   (durations are dropped: they are invalid with no-store)
```

Durations must be whole, non-negative numbers; anything else throws `InvalidConstantError`. `CacheDuration` runs `NONE` 0, `SHORT` 10, `MEDIUM` 300, `LONG` 3600, `VERY_LONG` 86400, `WEEK` 604800. There is also `sharedMaxAge`, which emits `s-maxage` for proxies.

### Priority

When several jobs or events are waiting, priority decides which runs first. `Priorities` names five levels, `PriorityWeight` gives each a number, and `comparePriority` is a comparator you hand straight to `Array.prototype.sort`. It returns a negative number when the first argument is the more urgent one, so sorting puts urgent items first.

```ts
import { type Priority, comparePriority } from "@zudojs/constants";

const jobs: { name: string; priority: Priority }[] = [
  { name: "cleanup", priority: "background" },
  { name: "page-oncall", priority: "critical" },
  { name: "send-email", priority: "normal" },
];

jobs.sort((a, b) => comparePriority(a.priority, b.priority));
console.log(jobs.map((j) => j.name));
// [ "page-oncall", "send-email", "cleanup" ]
```

**Common mistake.** Passing `CacheDuration` values where milliseconds are expected. These are seconds, because `Cache-Control` counts in seconds. `TimeMs` is the millisecond family.

## BRANDED IDENTIFIERS

A user id and an event id are both strings, so nothing stops you passing one where the other belongs. A *branded type* fixes that: it is the same string at run time, but TypeScript attaches an invisible label to it and refuses to swap one label for another.

You attach the label with a `createX` factory. Eight of them are plain relabelling — `createUserId`, `createEventId`, `createRequestId`, `createCorrelationId`, `createSessionId`, `createMessageId`, `createMessageCausationId`, `createTokenId`. Seven also validate, and throw `InvalidConstantError` if the string is wrong: `createTimestamp` (which also rejects impossible dates such as 30 February), `createUrl`, `createEmailAddress`, `createHexString`, `createBase64String`, `createJsonString`, and `createTenantId` (normalizes, then enforces `[a-z0-9][a-z0-9_-]*`, max 64 — `TENANT_ID_PATTERN`, `MAX_TENANT_ID_LENGTH`).

This labels two ids and shows the compiler catching a swap.

```ts
import {
  type UserId,
  createUserId,
  createEventId,
  createEmailAddress,
} from "@zudojs/constants";

const userId = createUserId("usr_abc123");
const eventId = createEventId("evt_xyz789");

function loadUser(id: UserId): string {
  return "loading " + id;
}

console.log(loadUser(userId));
// "loading usr_abc123"

loadUser(eventId);      // Type error: EventId is not UserId
loadUser("usr_abc123"); // Type error: string is not UserId

createEmailAddress("not-an-email");
// throws InvalidConstantError: Invalid email address: "not-an-email"
```

> IN PLAIN WORDS
>
>
>
> The brand exists only while TypeScript is compiling. After the build, `createUserId("x")` is just the string `"x"`, so branding costs nothing at run time and adds no field to your data.

The labelled types are `UserId`, `EventId`, `RequestId`, `CorrelationId`, `SessionId`, `TenantId`, `MessageId`, `MessageCausationId`, `TokenId`, `Timestamp`, `Url`, `EmailAddress`, `HexString`, `Base64String` and `JsonString`. `EntityId` is a plain unbranded string, and `Brand<T, B extends string>` is the helper you use to make your own.

**Common mistake.** Writing `someString as UserId` instead of calling the factory. It compiles, but for the six validating types you skip the check and a malformed value travels on as if it had been verified.

## SHARED FRAMEWORK VOCABULARY

The rest of the package exists so that separate packages agree with each other. You will mostly read these values rather than write them, and you need them when you implement or extend a framework piece yourself.

### Limits, Defaults and sentinels

`Limits` holds ceilings such as `MAX_PAGE_SIZE` (100), `DEFAULT_PAGE_SIZE` (20), `MAX_FILE_SIZE` (10485760) and `MAX_RETRY_ATTEMPTS` (10). `Defaults` holds fallbacks such as `PORT` (3000), `TIMEZONE` (`"UTC"`) and `CONTENT_TYPE` (`"application/json"`).

A *sentinel* is a stand-in value that means "nothing here" without using `null` everywhere. `Sentinel` carries `NULL`, `DELETED` (`"__DELETED__"`), `PLACEHOLDER` and `WILDCARD` (`"*"`), and the loose constants `NONE`, `UNINITIALIZED` and `EMPTY` cover the same need for plain strings.

### Lifecycle states

A *lifecycle* is the sequence a component moves through from created to shut down. `LifecycleState` names the ten states, `LifecyclePhase` names the five hooks you can implement, and `LIFECYCLE_VALID_TRANSITIONS` maps each state to the states it may move to next.

```ts
import { LifecycleState, LIFECYCLE_VALID_TRANSITIONS } from "@zudojs/constants";

console.log(LIFECYCLE_VALID_TRANSITIONS[LifecycleState.IDLE]);
// [ "initializing", "disposed" ]

console.log(LIFECYCLE_VALID_TRANSITIONS[LifecycleState.DISPOSED]);
// []   (disposed is the end of the road)
```

The defaults that go with it are `LIFECYCLE_DEFAULT_TIMEOUT`, `LIFECYCLE_DEFAULT_START_TIMEOUT`, `LIFECYCLE_DEFAULT_STOP_TIMEOUT`, `LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT`, `LIFECYCLE_DEFAULT_CONCURRENCY`, `LIFECYCLE_DEFAULT_RETRY_ATTEMPTS`, `LIFECYCLE_DEFAULT_RETRY_DELAY` and `LIFECYCLE_DEFAULT_RETRY_MAX_DELAY`.

### Schema and serialization

`SchemaIssueCode` is the stable list of reasons validation can fail (`"invalid_type"`, `"required"`, `"too_small"`, and so on), which lets you branch on a code instead of matching a message. It ships alongside depth and size defaults and `SCHEMA_FORBIDDEN_KEYS`, an immutable set (not a `Set` instance; `Set.prototype` methods cannot mutate it) of the keys that must never be copied into an object.

```ts
import { SCHEMA_FORBIDDEN_KEYS, SchemaIssueCode } from "@zudojs/constants";

console.log(SCHEMA_FORBIDDEN_KEYS.has("__proto__"), SchemaIssueCode.TOO_SMALL);
// true "too_small"

SCHEMA_FORBIDDEN_KEYS.add("safe");
// throws TypeError: Cannot add to an immutable Set
```

The serialization group (`SerializationFormat`, `SerializationContentType`, `SerializationLimits`, `SerializationTags`, `SERIALIZATION_SCHEMA_VERSION`) does the same job for `@zudojs/serialization`: format names, MIME types, size guards, and the `$type` / `$value` / `$encoding` keys it writes into tagged JSON.

> WATCH OUT
>
>
>
> Three depth limits look alike. `Limits.MAX_NESTING_DEPTH` (10) bounds how deeply nested user data may be; `SCHEMA_DEFAULT_MAX_DEPTH` (100) guards schema validation from runaway recursion; `SerializationLimits.MAX_DEPTH` (128) does the same for the serializer. They are not interchangeable.

## CLOCK AND RANDOM FOR TESTS

Code that calls `Date.now()` or `Math.random()` directly is hard to test, because the answer changes every run. The fix is to take the clock or the random source as a parameter. `Clock` and `Random` are those two small interfaces.

In production you pass `systemClock` and `systemRandom`. In a test you pass `createMockClock()`, whose time only moves when you move it, and `createMockRandom(seed)`, which produces the same sequence for the same seed.

This function takes a clock, so a test can decide what time it is.

```ts
import { type Clock, systemClock, createMockClock } from "@zudojs/constants";

function isExpired(expiresAt: number, clock: Clock = systemClock): boolean {
  return clock.now() >= expiresAt;
}

const clock = createMockClock(0);
console.log(isExpired(1000, clock));
// false

clock.advance(1000);
console.log(clock.now(), isExpired(1000, clock));
// 1000 true

clock.set(new Date("2026-01-01T00:00:00.000Z"));
console.log(clock.Date().toISOString());
// "2026-01-01T00:00:00.000Z"
```

`systemRandom` is backed by `node:crypto` all the way through, including `random()`, so it is safe for tokens, session ids and salts. `createMockRandom` is a seeded generator for tests only — never use it for anything security related.

```ts
import { systemRandom, createMockRandom } from "@zudojs/constants";

console.log(systemRandom.randomString(8).length);
// 8   (the characters differ every run)

const rng = createMockRandom(42);
console.log(rng.randomInt(1, 6));
// 2   (always 2 as the first call for seed 42)
```

**Common mistake.** Reading `randomInt(1, 100)` as excluding 100. Both ends are included, so it can return 100.

## API REFERENCE

Everything below is exported from `"@zudojs/constants"`. Constant maps are listed by group rather than key by key.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `buildContentType(mimeType, charset?)` | Joins a MIME type and charset into a `Content-Type` value. | Charset dropped for `multipart/*`. Throws `InvalidConstantError` on empty input. |
| `isSuccessStatus(code)`, `isRedirectStatus(code)`, `isClientError(code)`, `isServerError(code)`, `isErrorStatus(code)` | Range checks on an HTTP status code. | Accept any `number`, not just known codes. |
| `resolveEnvironment(envOverride?, options?)` | Reads `NODE_ENV` and returns an `Environment`. | Options: `strict` (throw on unknown), `silent` (no warning). |
| `isProduction(envOverride?)`, `isDevelopment(envOverride?)`, `isTest(envOverride?)` | Shorthand for comparing the resolved environment. | There is no `isStaging`; compare `resolveEnvironment()` yourself. |
| `isValidEnvironment(value)` | Type guard for the four environment names. | Rejects the aliases `dev` and `prod`. |
| `toMilliseconds(value, unit)` | Converts a duration to milliseconds. | Unit is one of the `TimeUnit` strings. |
| `formatDuration(ms)` | Turns milliseconds into `"500ms"`, `"1m 30s"`, `"1d 1h"`. | For logs and UI, not for parsing back. |
| `buildCacheControl(options)` | Builds a `Cache-Control` header value. | Options: `strategy`, `maxAge`, `staleWhileRevalidate`, `sharedMaxAge` (all seconds). |
| `comparePriority(a, b)` | Comparator that sorts urgent first. | Negative when `a` is the more urgent. |
| `createUserId`, `createEventId`, `createRequestId`, `createCorrelationId`, `createSessionId`, `createMessageId`, `createMessageCausationId`, `createTokenId` | Attach a brand to a string. | No validation — relabelling only. |
| `createTimestamp`, `createUrl`, `createEmailAddress`, `createHexString`, `createBase64String`, `createJsonString`, `createTenantId` | Validate, then attach a brand. | Throw `InvalidConstantError` on bad input. |
| `createMockClock(fixedTime?)`, `createMockRandom(seed?)` | Deterministic `Clock` / `MockRandom` for tests; `MockRandom` is not assignable to `Random`. | `MockClock` adds `advance(ms)` and `set(timeOrDate)`. |

### Values and constant maps

| Name | What it holds | Notes |
| --- | --- | --- |
| `HttpMethods`, `HttpStatus`, `HttpHeader`, `ContentTypes`, `Charset` | HTTP methods, status codes, header names, MIME types, charset labels. | Frozen objects; values are the real strings and numbers. |
| `HTTP_METHODS`, `SAFE_HTTP_METHODS`, `IDEMPOTENT_HTTP_METHODS`, `ENVIRONMENTS`, `SCHEMA_FORBIDDEN_KEYS` | Read-only sets for membership checks. | Immutable: `add`/`delete`/`clear` throw. |
| `Environments`, `NODE_ENV_KEY` | The four environment names and the variable they come from. | — |
| `TimeMs`, `TimeUnits`, `DefaultTimeout`, `DefaultRetry` | Durations in ms, unit names, timeout and retry defaults. | All milliseconds. |
| `ValidationPattern`, `ValidationLength`, `ValidationRange` | Regexes, maximum lengths, numeric bounds. | The source of truth for framework regexes. |
| `CacheStrategies`, `CacheDuration` | Cache directives and lifetimes. | `CacheDuration` is in **seconds**. |
| `Priorities`, `PriorityWeight` | Five levels and their numeric weights. | Higher weight is more urgent. |
| `Limits`, `Defaults`, `Sentinel`, `NONE`, `UNINITIALIZED`, `EMPTY` | Ceilings, fallbacks, and stand-in values. | — |
| `LifecycleState`, `LifecyclePhase`, `LIFECYCLE_VALID_TRANSITIONS`, `LIFECYCLE_DEFAULT_*` | The lifecycle state machine and its defaults. | Eight `LIFECYCLE_DEFAULT_*` constants. |
| `SchemaIssueCode`, `SCHEMA_DEFAULT_MAX_DEPTH`, `SCHEMA_DEFAULT_MAX_STRING_LENGTH`, `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH`, `SCHEMA_DEFAULT_MAX_OBJECT_KEYS`, `SCHEMA_STRING_FORMATS` | Validation failure codes, size guards, format regexes. | `SCHEMA_STRING_FORMATS` reuses `ValidationPattern`. |
| `SerializationFormat`, `SerializationContentType`, `SerializationLimits`, `SerializationTags`, `SERIALIZATION_SCHEMA_VERSION` | Serializer formats, MIME types, limits and tag keys. | `SerializationContentType.MSGPACK` is `"application/x-msgpack"`. `SerializationLimits.MAX_BIGINT_DIGITS` (4096) bounds BigInt text for `@zudojs/serialization` and `@zudojs/schema`'s `coerce.bigint()`. |
| `systemClock`, `systemRandom` | Real time and CSPRNG-backed randomness. | `systemRandom` is safe for secrets. |

### Types

| Name | What it is | Notes |
| --- | --- | --- |
| `HttpMethod`, `HttpStatusCode`, `HttpHeaderName`, `ContentType` | Unions of the values in the matching maps. | Use the `Any*` variants for values from elsewhere. |
| `AnyHttpStatusCode`, `AnyHttpHeaderName`, `AnyContentType` | Open versions that still autocomplete the known values. | `AnyHttpStatusCode` is `number`. |
| `Environment`, `TimeUnit`, `CacheStrategy`, `Priority` | String unions for the matching maps. | Use them as parameter types. |
| `LifecycleState`, `LifecyclePhase`, `SchemaIssueCode` | Both a value and a union type of the same name. | Import with `type` to use the type side. |
| `Brand<T, B extends string>`, `EntityId` | The branding helper and the unbranded id string. | Use `Brand` for your own labelled types. |
| `UserId`, `EventId`, `RequestId`, `CorrelationId`, `SessionId`, `TenantId`, `MessageId`, `MessageCausationId`, `TokenId`, `Timestamp`, `Url`, `EmailAddress`, `HexString`, `Base64String`, `JsonString` | The branded identifier types. | Build them with the matching `createX`. |
| `Clock`, `MockClock`, `Random` | Interfaces for injectable time and randomness. | `Clock` has `now()` and `Date()`. |
| `ResolveEnvironmentOptions`, `CacheControlOptions` | Option shapes for the two functions that take one. | — |

### Errors

| Name | Thrown when | Notes |
| --- | --- | --- |
| `InvalidConstantError` | A value handed to a factory or builder is not valid. | Extends `BaseError` from `@zudojs/errors`. Takes `{ code?, metadata? }`. |
| `ConstantContextError` | A constant is used outside the context it belongs to. | Extends `BaseError`. Takes `{ metadata? }`. |

## COMMON MISTAKES

- **Importing from a subpath.** `import { HttpMethod } from "@zudojs/constants/http"` fails to resolve, because the package declares a single entry point. Import everything from `"@zudojs/constants"`.
- **Passing a name to `resolveEnvironment`.** `resolveEnvironment("staging")` is a type error; the argument is a map of environment variables. Write `resolveEnvironment({ NODE_ENV: "staging" })`.
- **Mixing seconds and milliseconds.** `CacheDuration.LONG` is 3600 seconds; `TimeMs.HOUR` is 3600000 milliseconds. Passing the first where milliseconds are expected gives you a 3.6 second timeout.
- **Casting instead of calling the factory.** `value as EmailAddress` skips the check that `createEmailAddress(value)` performs, so an invalid address gets the branded type anyway.
- **Using the plural map as a type.** `const m: HttpMethods = "GET"` does not compile. `HttpMethods` is the value; `HttpMethod` is the type.
- **Assuming an unknown `NODE_ENV` is fatal.** By default it warns once and falls back to `"development"`, which in production is the wrong behaviour to discover late. Pass `{ strict: true }` at start-up so a typo fails immediately.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the only dependency; supplies `BaseError` and the codes the two errors here use.
- [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) — when you need to actually run checks rather than just hold the patterns and limits.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — consumes `SchemaIssueCode` and the schema limits to describe and parse data shapes.
- [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md) — for values that change per deployment; constants are for values that never change.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — runs the state machine that `LifecycleState` and `LIFECYCLE_VALID_TRANSITIONS` describe.

## COMPLETE EXPORT INDEX

Every name `@zudojs/constants` exports from its package root at v1.2.0 — **125** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 125 exports**

Classes (2)

`ConstantContextError` `InvalidConstantError`

Functions (33)

`assertIdentifier` `buildCacheControl` `buildContentType` `comparePriority` `createBase64String` `createCorrelationId` `createEmailAddress` `createEventId` `createHexString` `createJsonString` `createMessageCausationId` `createMessageId` `createMockClock` `createMockRandom` `createRequestId` `createSessionId` `createTenantId` `createTimestamp` `createTokenId` `createUrl` `createUserId` `formatDuration` `isClientError` `isDevelopment` `isErrorStatus` `isProduction` `isRedirectStatus` `isServerError` `isSuccessStatus` `isTest` `isValidEnvironment` `resolveEnvironment` `toMilliseconds`

Interfaces (7)

`CacheControlOptions` `Clock` `MockClock` `MockRandom` `Random` `RandomSource` `ResolveEnvironmentOptions`

Type aliases (28)

`AnyContentType` `AnyHttpHeaderName` `AnyHttpStatusCode` `Base64String` `Brand` `CacheStrategy` `ContentType` `CorrelationId` `EmailAddress` `EntityId` `Environment` `EventId` `HexString` `HttpHeaderName` `HttpMethod` `HttpStatusCode` `JsonString` `MessageCausationId` `MessageId` `Priority` `RequestId` `SessionId` `TenantId` `Timestamp` `TimeUnit` `TokenId` `Url` `UserId`

Constants (55)

`CacheDuration` `CacheStrategies` `Charset` `ContentTypes` `DefaultRetry` `Defaults` `DefaultTimeout` `EMPTY` `Environments` `ENVIRONMENTS` `HTTP_METHODS` `HttpHeader` `HttpMethods` `HttpStatus` `IDEMPOTENT_HTTP_METHODS` `LIFECYCLE_DEFAULT_CONCURRENCY` `LIFECYCLE_DEFAULT_RETRY_ATTEMPTS` `LIFECYCLE_DEFAULT_RETRY_DELAY` `LIFECYCLE_DEFAULT_RETRY_MAX_DELAY` `LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT` `LIFECYCLE_DEFAULT_START_TIMEOUT` `LIFECYCLE_DEFAULT_STOP_TIMEOUT` `LIFECYCLE_DEFAULT_TIMEOUT` `LIFECYCLE_VALID_TRANSITIONS` `LifecyclePhase` `LifecycleState` `Limits` `MAX_TENANT_ID_LENGTH` `NODE_ENV_KEY` `NONE` `Priorities` `PriorityWeight` `SAFE_HTTP_METHODS` `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH` `SCHEMA_DEFAULT_MAX_DEPTH` `SCHEMA_DEFAULT_MAX_OBJECT_KEYS` `SCHEMA_DEFAULT_MAX_STRING_LENGTH` `SCHEMA_FORBIDDEN_KEYS` `SCHEMA_STRING_FORMATS` `SchemaIssueCode` `Sentinel` `SERIALIZATION_SCHEMA_VERSION` `SerializationContentType` `SerializationFormat` `SerializationLimits` `SerializationTags` `systemClock` `systemRandom` `TENANT_ID_PATTERN` `TimeMs` `TimeUnits` `UNINITIALIZED` `ValidationLength` `ValidationPattern` `ValidationRange`
