# @zudojs/types

## 1.2.0

### Minor Changes

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - - `@zudojs/schema`: new `isSchemaValidationError(error)` guard narrows a caught error so `error.issues` is typed `readonly SchemaIssue[]` without a cast (it also checks each issue's shape at runtime). `parse()` and `unwrapSchemaResult()` now throw `SchemaError<SchemaIssue>`.
  - `@zudojs/errors`: `SchemaError` is generic (`SchemaError<TIssue = unknown>`, likewise `SchemaErrorOptions` and `createSchemaError`); the default keeps existing code unchanged.
  - `@zudojs/schema`, `@zudojs/validation`: length and count messages use the singular for one ("at least 1 character", "at least 1 item") instead of "1 characters".
  - `@zudojs/types`: new `formatCount(count, singular, plural?)`.
  - `@zudojs/logger`: the console transport prints the formatted line instead of a record object that repeated the timestamp and level; an `Error` passed as the second argument of a level method (`logger.error("failed", err)`, common in JavaScript) is now logged as the entry's error with its stack instead of being read as empty metadata and dropped (the typed form remains `logger.log(level, message, { error, metadata })`); no trailing space before a stack trace. The level methods' signatures are unchanged.
  - `@zudojs/schema`: `string().url()` still accepts only `http`/`https` by default (so `javascript:` and `data:` URLs stay invalid), and now takes `url({ protocols: ["postgres", "postgresql", "redis", "rediss"] })` or `{ protocols: "any" }`, parsed with the WHATWG `URL` parser; a `postgres://` `DATABASE_URL` was refused. The doc comment now states the default.
  - `@zudojs/schema`: `date()`, `datetime()` and `time()` validate real values: month 01-12, a day that exists in that month (leap years included), hours 00-23, minutes and seconds 00-59 and a `±hh:mm` offset up to 23:59. `"2026-02-30"`, `"2026-13-45"` and `"2026-02-30T25:61:00Z"` used to pass.
  - `@zudojs/schema`: an optional key absent from the input stays absent from the parsed object instead of coming back as an own key set to `undefined` (a repository then wrote it as `NULL`); a key sent as `undefined` is kept. The inferred object type makes such keys optional properties (`{ b?: string | undefined }`, new exported `ObjectShapeOutput`), matching `exactOptionalPropertyTypes`.
  - `@zudojs/schema`: `partial()` no longer applies `.default()` to absent keys, so an update schema built with `partial()` no longer resets every defaulted field the caller left out. Present values are still validated.
  - `@zudojs/schema`: every primitive has `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()`: `boolean()`, `bigint()`, `symbol()`, `literal()`, `enum()`, the sentinel schemas and all `coerce` schemas (through the new `ModifiableSchema` base class). `schema.boolean().optional()` was a type error.
  - `@zudojs/schema`: `SchemaInput<typeof string().transform(fn)>` is the input type (`string`), not the output type; `TransformSchema<TIn, TOut>` now extends `Schema<TOut, TIn>`. Object, tuple and union inference read only the output type, so a transformed field keeps its output type in `Infer<>`. Compatibility: code that annotated a chained transform as `Schema<TOut>` must use `Schema<TOut, TIn>` (or `Schema<TOut, unknown>`).
  - `@zudojs/logger`: `entry.message` is again the raw message a transport receives. The formatter's rendering is in the new `entry.formatted` (the text or JSON line, or the JSON line of a structured formatter's record); a string formatter's output used to replace `message`. **Custom transports that printed `entry.message` to get the formatted line should print `entry.formatted ?? entry.message`** (or use the new `formatTransportLine(entry)`); the console transport does.
  - `@zudojs/logger`: with `createStructuredLoggerFormatter()`, the console transport prints one JSON line per record (cycles become `"[Circular]"`, BigInt a string) instead of a multi-line object; new `toJsonLogLine(record)` helper.
  - `@zudojs/logger`: `level` accepts level names in any case wherever a level is configured: `createLogger({ level: "error" })`, `setLevel("DEBUG")`, `child({ level: "trace" })` (type `LoggerLevelLike = LoggerLevel | LoggerLevelName | Uppercase<LoggerLevelName>`, new `resolveLoggerLevel()`). An unknown level now throws instead of silently disabling output. `Logger.setLevel` takes `LoggerLevelLike` and `Logger.child` the new `ChildLoggerOptionsInput`; `ChildLoggerOptions` is unchanged, and an implementation declared with a `LoggerLevel` / `ChildLoggerOptions` parameter still satisfies the interface (it may now be handed a name, which `resolveLoggerLevel()` converts).
  - `@zudojs/logger`: `createTextLoggerFormatter({ includeStackTrace: false })` prints an error as its name and message only (`error={"name":...,"message":...}`), and an `Error` inside metadata loses its stack too; the fallback used to serialize the stack, absolute paths included. `serializeLoggerValue` and `serializeLoggerError` take an optional flag to omit stacks.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

## 1.1.1

### Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a
  handful of failure paths report the error a caller can actually act on.

  - `BaseError` no longer overflows the stack when a deeply nested object or
    array is attached as a `cause`. The redaction walk is now bounded at 32
    levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning
    already did, so `JSON.stringify`, `serializeError` with `includeCause` and
    `ErrorHandler.toLogObject` stay safe on a parsed request body.
    Attacker-controlled depth could previously raise a `RangeError` from inside
    the logging path.
  - `estimateSerializedSize(value)` now defaults to a finite budget
    (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every
    occurrence of a shared subtree is charged, an unbounded budget let a 1 KB
    payload of shared references burn minutes of CPU. Pass an explicit
    `Number.POSITIVE_INFINITY` if you need an exact measurement of input you
    trust; the returned value is otherwise capped at the budget.
  - `assertNoCircularReference` reports running out of depth as
    `SerializationDepthError` rather than dressing it up as
    `CircularReferenceError`, and `JSONSerializer.serialize` with
    `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly
    acyclic payload used to be rejected as a cycle on that path while the fast
    path reported a depth error for the same input; the two now agree.
    `hasCircularReference` returns `false` for such a graph instead of `true`.
  - `isArrayOfType` reads every index rather than relying on
    `Array.prototype.every`, which skips holes. A sparse array such as
    `new Array(3)` no longer satisfies an arbitrary element guard.
  - A `$type` tag arriving from the wire is checked against
    `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is
    clipped before being quoted into an error message, so an over-long tag can
    no longer flood a log line.
  - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`,
    `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a
    bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and
    `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues.
    Code that catches `Error` is unaffected; code that wants to turn hostile
    input into a 400 can now tell it apart from an internal bug.
  - `Schema.safeParse`'s documentation no longer claims it never throws: a
    callback defect or a `RangeError` from stack exhaustion is still
    deliberately allowed to escape rather than being laundered into a
    validation issue.

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - LEAF-01: `systemRandom.int(max)` no longer hangs when `max > 2**32`. Bounds up to `Number.MAX_SAFE_INTEGER` draw 53 bits by rejection sampling. Non-safe-integer bounds throw a `RangeError`. New export: `MAX_RANDOM_INT_BOUND`.
  - LEAF-07 (behaviour change): `SeededRandom` uses mulberry32. `uuid()` no longer cycles after 16 values, and `int(2)` no longer alternates. The value sequence for a given seed is different from before.
  - LEAF-15 (behaviour change): `camelToSnake` / `camelToKebab` are Unicode-aware (`caféAuLait` becomes `café_au_lait`) and keep characters other than `_`, `-` and whitespace instead of deleting them.
  - LEAF-17: `safeJsonParse` now documents that dropping `constructor` / `prototype` is a deliberate deny-list.
  - LEAF-04 / LEAF-19: the `isEmail` doc comment and the README are corrected. Branded types live in `@zudojs/constants`.

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close a prototype-pollution primitive, unbias the random generator, and reconcile the guards.

  **`mapToObject` cannot pollute a prototype.** It assigned into an object
  literal, so a `Map` built from request data — headers, form fields, query
  parameters — containing a `__proto__` key replaced the result's prototype with
  attacker-supplied values that `Object.keys` does not reveal. The result is now
  built on `Object.create(null)` with `defineProperty`, so it has a null
  prototype. `safeJsonParse` drops prototype-bearing keys through a reviver.

  **`Random.int()` is unbiased.** `buf[0] % max` over a uniform 32-bit draw is
  only uniform when `max` is a power of two; the interface is documented as
  cryptographically secure and `Random.string` is built on it. It now uses
  rejection sampling.

  **`SeededRandom` no longer satisfies `Random`.** It implements a new
  `PseudoRandom` interface, and `Random` carries a brand so a deterministic
  generator cannot be injected where unpredictability is the requirement — its
  output is fully predictable from the seed. Implement a secure generator through
  the new `defineSecureRandom()`. `SeededRandom.uuid()` also emits a structurally
  valid v4 UUID; it previously produced a string that failed this package's own
  `isUuid`.

  **`require()` removed** from the `node:crypto` fallbacks, which threw
  `ReferenceError` in this ESM-only package on exactly the runtimes the fallback
  existed to support.

  **Guards reconciled with `@zudojs/validation`.** `isUuid` accepts versions 1–8
  — UUIDv7 included — plus the nil and max UUIDs; use the new `isUuidV4` where
  the version matters. `isEmail` matches the validation package's acceptance set,
  which it previously disagreed with, so a value accepted at the edge could be
  rejected in a service. `isIsoDateString` validates the calendar date and
  accepts numeric UTC offsets: it previously admitted `2024-13-45T99:99:99Z` and
  rejected `2024-01-01T00:00:00+02:00`, and it now also accepts a date-only
  string — use the new `isIsoDateTimeString` where a time component is required.

  **`isPromise` narrows to `Promise` only.** It returned true for any thenable
  while claiming `Promise`, so narrowing and then calling `.catch()` threw. Use
  the new `isThenable` for awaitable values. `isPositiveNumber` excludes
  `Infinity`; `isFiniteNumber` is added.

  **Converters no longer lie about their return type.** `toString` returned the
  _value_ `undefined` for functions and symbols despite a `string` return type,
  because `JSON.stringify` returns `undefined` for them without throwing.
  `toBoolean(NaN)` returned `true`, which mattered because `NaN` is what
  `toNumber` produces on failure. `toNumber` now requires a finite number and
  refuses blank strings, hexadecimal literals and `1e999`, which previously
  became `0`, `16` and `Infinity`.

  **Case conversion handles capitals and acronyms.** `camelToSnake("HelloWorld")`
  produced `_hello_world` — not a valid column name — and `parseHTTPResponse`
  became `parse_h_t_t_p_response`. Both now split on word boundaries.

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

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
