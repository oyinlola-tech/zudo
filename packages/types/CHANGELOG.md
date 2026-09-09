# @zudojs/types

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
