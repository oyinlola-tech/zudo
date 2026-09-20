# @zudojs/types

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
