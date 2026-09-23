# @zudojs/validation

## 1.1.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.1.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.1.0

### Minor Changes

- Fix bugs that lesson writers reproduced in config, validation, container and runtime.

  **`@zudojs/config`**

  - NUMBER and BOOLEAN schemas now accept values from environment variables. Env values are always strings, so `manager.validate({ properties: { port: { type: ConfigValueType.NUMBER } } })` rejected `PORT=8080` as `TYPE_MISMATCH`. A `transform` could not help, because transforms run after the type check. String input is now coerced before the type check when the schema's type includes `NUMBER` or `BOOLEAN` and does not also accept `STRING` or `ANY`. Numbers are parsed strictly and in decimal only: `"8080"` passes, but `"80a"`, `"0x1F90"` and `""` are still rejected. Booleans use the existing `boolean()` convention: `true`/`false`, `1`/`0`, `yes`/`no`, `y`/`n` and `on`/`off`. `validate` and `transform` receive the coerced value. This applies to `validate()`, `resolve()` and the standalone `validateConfigValue`/`validateConfigObject`. **Behaviour change:** these functions used to reject a numeric or boolean string for a NUMBER/BOOLEAN schema and now accept it. Set the new schema option `coerce: false` to keep the old strict behaviour.
  - A typed getter called with a fallback now returns `T` instead of `T | undefined`. This covers `string`, `number`, `boolean`, `bigint`, `date`, `object` and `array` on `ConfigManager`, `ConfigResolver` and `ScopedConfigResolver`. `get(key, fallback)` is a new overload. It returns the stored value, or the fallback when the key is missing. Its literal fallback is widened through the new `ConfigWiden<T>` type, so `get("mode", "dev")` is typed `string`, not `"dev"`. Calls without a fallback keep their old types.
  - `store.getByPrefix()` and `store.getObjectByPrefix()` now ignore a trailing dot in the prefix. Before, `getByPrefix("db.")` returned `[]` and `getObjectByPrefix("db.")` returned `{}`. Now `"db"` and `"db."` select the same entries.
  - `ScopedConfigResolver` and `ConfigManager` gain the typed required accessors that the root resolver already had: `requiredString`, `requiredNumber`, `requiredBoolean` and `requiredDate`. Each one parses the value, checks it, and throws when the value is missing or does not parse. For example, with `DB__PORT=5432`, `scoped("db").requiredNumber("port")` returns `5432`. `required<T>()` still performs no conversion, because `T` is erased at runtime and cannot be checked safely. It now documents this and points to the typed variants.
  - `resolve()` and `resolveResult()` now take a `TypedConfigSchema<T>`. This union is keyed on `type`, so each value type accepts exactly the constraints the validator enforces: `{ type: NUMBER, min: 1 }` compiles, and `{ type: NUMBER, minLength: 1 }` is a compile error. The constraint shapes are exported as `ConfigStringConstraints`, `ConfigNumberConstraints`, `ConfigArrayConstraints` and `ConfigObjectConstraints`. `ConfigStringSchema` and `ConfigNumberSchema` are now built from them, with the same fields as before.
  - `validate` now receives the final value. The order is: coerce, type check, constraints, `transform`, then `validate` on the transformed value, which matches its `(value: T)` signature. A string that does not have the schema's type is passed to `transform` as a parser, and the transform's output must then have the type and pass the constraints. This lets `{ type: ARRAY, transform: (s) => String(s).split(",") }` accept `"a,b"`, and a hex parser accept `"1F90"` for a NUMBER. A non-string of the wrong type is still rejected without calling `transform`. **Behaviour change:** `validate` used to see the value before `transform` ran. A transform can now run on a string that fails the type check, but a result without the right type is still never returned.

  **`@zudojs/validation` / `@zudojs/errors`**

  - `assertDepthWithinLimit` and `assertNoCircularReference` now throw `SerializationDepthError` with `statusCode: 400` and `expose: true`. Before, the error was an unexposed 500, so a request body nested too deep surfaced as a hidden server error. The message contains only the observed depth and the limit. The error class is unchanged, so `instanceof` checks still match. **Behaviour change:** `@zudojs/serialization` calls these guards, so a depth failure from `JSONSerializer` (serialize or deserialize) is now a 400 as well.
  - `SerializationDepthError` takes an optional third constructor argument, `{ statusCode?, expose? }`. Without it, the error is still an unexposed 500. The new `UNTRUSTED_DEPTH_ERROR` constant holds the options the validation guards pass.

  **`@zudojs/container`**

  - `registerFactory`, `factoryProvider` and `provideFactory` now infer the factory's parameter types from the `inject` list. Each `Token<T>` or class token maps to `T`, so the README example `registerFactory(API, (db) => new Api(db), [DB])` compiles under strict mode, and a factory whose parameters do not match the tokens is a compile error. String and symbol tokens give `unknown`, as before. A factory typed `(...deps: unknown[]) => T` and a non-tuple `readonly ProviderToken[]` inject list still compile. The new types are `InjectedDependencies<Deps>` and `InjectedFactory<T, Deps>`. **Behaviour change:** a factory that declares more parameters than its inject list supplies is now a compile error.
  - Error messages and default registration names now show a symbol token by its description: `MissingService` instead of `Symbol(MissingService)`. `describeToken` returns the same string.
  - `autoRegisterClasses` only auto-registers a class whose constructor declares no required parameters (`Class.length === 0`). Before, `resolve(NeedsDep)` for `constructor(dep: Dep)` silently built the class with `dep = undefined`. It now throws `RegistrationNotFoundError`, naming the class and explaining how to register it with an `inject` list. `canResolve` and `resolveOptional` agree with this rule. Parameters with default values are not counted. **Behaviour change** for code that relied on the old silent construction.

  **`@zudojs/runtime`**

  - `start()` now passes through every state in order: `created → initializing → initialized → starting → running`. `initialized` and `starting` were declared but never entered, and `onReady` ran while the state was still `initializing`. `onInitialize` hooks now see `initializing` and `onReady` hooks see `starting`. The runtime publishes `runtime.initialized` and `runtime.starting` between the two phases, and both are back in `RuntimeEventMap`. **Behaviour change:** `RUNTIME_STATE_TRANSITIONS` no longer allows `initializing → running` or `initialized → running`.
  - `RuntimeInitializationError`, `RuntimeRollbackError` and `RuntimeSignalError` were exported but never thrown. They are now used:
    - `RuntimeInitializationError` now extends `RuntimeStartError` with `phase: "initialize"`, so existing `instanceof RuntimeStartError` checks still match. It is thrown when an `onInitialize` hook fails or the configuration manager fails to load. It also accepts a `failedModuleId`.
    - `RuntimeRollbackError` now extends `RuntimeStartError`. It is thrown when startup fails and the rollback that follows also fails, which used to be only logged. `phase`, `failedModuleId` and `cause` describe the startup failure. `originalError` keeps the error `start()` would otherwise have thrown, and `rollbackError` holds what failed during rollback, or an `AggregateError` when several modules failed. The message names both failures.
    - When a shutdown triggered by `SIGTERM`, `SIGINT` or a fatal error fails, the signal handler has no caller to throw to. It now logs a `RuntimeSignalError` with the failure as `cause`. `RuntimeSignalError` accepts an optional `{ cause }`.
  - `failed` is no longer a terminal state. `TERMINAL_STATES` is now `["stopped"]`, and `isTerminalState("failed")` is `false`, which is consistent with `stop()` being allowed from `failed` to clean up. **Behaviour change** for callers of `isTerminalState` and `TERMINAL_STATES`.
  - A failed start still rejects with `RuntimeStartError` that wraps the module's error. It does not re-throw the original. The README now documents this, including `error.cause` (the original error), `error.phase` and `error.failedModuleId`.
  - Container ownership is now documented and configurable. The container is passed in, so by default the caller owns it and `stop()` leaves it alone. The new option `disposeContainerOnStop: true` makes `stop()` dispose the container after every module has shut down. This also covers `stop()` on a runtime that never started. A disposal failure is recorded in `status.shutdownFailures` under the id `"(container)"` (exported as `CONTAINER_SHUTDOWN_ID`) and does not fail the stop. `createTestRuntime` creates its own container and now disposes it on stop. Pass `disposeContainerOnStop: false` to keep it.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

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
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2
  - @zudojs/types@1.2.0

## 1.0.3

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

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.0.2

### Patch Changes

- Round 10 fixes.

  - **data/VAL-01:** sparse arrays no longer crash `hasCircularReference`, `assertDepthWithinLimit`, `getSerializationDepth`, `estimateSerializedSize` or `assertSizeWithinLimit` with a raw `TypeError`; a hole counts as `undefined`.
  - **data/VAL-02 (DoS):** the cycle and depth guards no longer re-walk a shared subtree from the same or a shallower depth, so a DAG of shared nodes is linear instead of exponential. The size estimate still charges every occurrence (bounded by its budget).
  - **data/VAL-03:** `estimateSerializedSize` / `assertSizeWithinLimit` measure what `toJSON()` returns (Dates and binary views keep their existing charges). New optional `resolve` hook on `TraversalVisitor`.
  - **data/VAL-04:** a registry rule with both `schema` and `constraints` runs the schema, then the constraints on the parsed value. Behaviour change: such rules can now fail where they used to pass.
  - **data/VAL-05 / cross/CV-02:** `ValidationError` and `ValidationResultError` now extend `@zudojs/errors`' `ValidationError`, so `instanceof` and `isValidationError()` from `@zudojs/errors` catch them. Public fields are unchanged.
  - **data/VAL-06 (fail-closed):** `not(constraint)` carries the inner constraint's guard and treats a throw as a failure. Behaviour change: `not(matches(...))` now rejects non-strings.
  - **data/VAL-07:** `everyItem` / `someItem` read every index, so holes in a sparse array are checked.
  - **LEAF-10 (security):** `ValidationError.toJSON()` and `ValidationResultError.toJSON()` no longer overwrite the base class's redacted `issues` with the raw ones, and `ValidationError`'s `context` is serialized from the redacted metadata. Behaviour change: serialized issues carry `receivedType` (etc.) instead of the submitted value, and sensitive context keys are `[REDACTED]`. The raw values remain on the error instance.
  - **data/VAL-05 / cross/CV-02 (phase 2):** the exported `TraversalLimitError` (thrown by `traverse()`, the bounded walker behind the depth, size and circular guards) is now re-exported from `@zudojs/errors`, together with `TraversalHalt`. Same name, constructor, `halt`/`path`/`observed` fields and message; it is now a `BaseError` (code `VALIDATION_FAILED`, status 400, `expose: false`, `toJSON()` includes halt/path/observed). The public guards translate it exactly as before.
  - **leaf/LEAF-04 / data/CONV-02 (phase 2, behaviour change):** the `email` constraint now rejects addresses longer than 254 characters (checked before the pattern runs), so it accepts exactly what `ValidationPattern.EMAIL` in `@zudojs/constants` and `isEmail` in `@zudojs/types` accept. A shared corpus test pins the three together. The pattern is still a local copy because validation does not depend on `@zudojs/constants`.
  - The `email` constraint now uses `ValidationPattern.EMAIL` from `@zudojs/constants` (new dependency), so it accepts exactly what `isEmail` in `@zudojs/types` accepts.

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `any()` with no validators no longer echoes the rejected value in its `received` field, matching `first()` and the package's rule that issues never carry the input.
  - `getSerializationDepth` counts an empty object or array as one level, so it agrees with `assertDepthWithinLimit`: a value now always passes the depth guard at exactly its measured depth (`getSerializationDepth({})` is `1`, not `0`).
- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix both resource guards, stop echoing rejected input, and close a prototype hole.

  **The depth guard no longer overflows the stack it protects.**
  `assertDepthWithinLimit` computed the full depth of the input by unbounded
  recursion and only then compared it to the limit, so deeply nested JSON
  exhausted the stack inside the check — with a limit of 32, a 20,000-deep array
  still recursed 20,000 frames. The walk is now iterative and aborts the moment
  the limit is passed, so the cost is bounded by `maxDepth` rather than by the
  size of the input. `getSerializationDepth` takes an optional limit and returns
  it when reached, and no longer follows cycles.

  **The size guard no longer undercounts shared references.**
  `estimateSerializedSize` returned `0` for any object it had already seen, which
  is right for a cycle and wrong for every DAG: a payload that references one
  subtree repeatedly was counted once, but `JSON.stringify` expands each
  occurrence. A 358-byte estimate corresponded to 356 MB of actual JSON, so a
  "billion laughs" payload passed a 10 KB limit and then exhausted memory in the
  code the guard protects. Occurrences are now counted individually and counting
  aborts once the budget is passed. Numbers are charged their worst-case JSON
  width rather than a flat 8 bytes, so estimates rise for numeric payloads.

  **Circular detection no longer rejects every DAG.**
  `assertNoCircularReference` never unmarked a node on the way back up, so it
  could not tell "appears twice" from "refers to itself" — one config object
  referenced by two fields was reported as a cycle. It now tracks the current
  path. `@zudojs/serialization` calls this on every `serialize`, so payloads it
  was refusing will now serialize.

  **Rejected values are no longer attached to issues.** `checkConstraint` and
  `checkConstraints` set `issue.received` to the raw failing value;
  `ValidationError` carries `expose: true` and spreads `issues` into `toJSON()`,
  so a password below the minimum length came back in the 400 body and into any
  log that serialized the error. `received` is no longer populated by the
  constraint, normalizer or transformer paths. Code reading `issue.received` from
  a constraint failure will find it absent.

  **`parseRecord` cannot hijack its result's prototype.** Results accumulated
  into an object literal, so a `__proto__` key — which `JSON.parse` produces as a
  real own property — went through the prototype setter and the "validated"
  object silently inherited attacker-supplied fields. Results now build on
  `Object.create(null)`, and `__proto__`, `constructor` and `prototype` keys are
  reported as issues. `toFieldErrors` is built the same way, which also fixes
  fields named `constructor` or `toString` being silently dropped.

  **`matches()` strips `g` and `y` from the pattern.** Those flags make `test()`
  stateful through `lastIndex`, so a shared constraint alternated between
  accepting and rejecting the very same value.

  **Constraints no longer throw on wrong-typed input.** Constraints receive
  whatever the caller passed, which at a trust boundary is arbitrary JSON;
  `everyItem(...)` on a number escaped as a raw `TypeError`, turning a 400 into a 500. Constraints now carry an optional `guard`, applied by `validate` itself,
  and a wrong-typed value reports as a validation failure.

  **`ValidationError.code` is a real `ErrorCode`.** It was a double cast of
  `ValidationErrorCode`, so `error.code` held a value the errors package does not
  recognise and any status mapping keyed on it missed. `validationCode` still
  carries the package-specific code.

  **Composers halt at the first failing step by default.** Running on meant later
  steps validated the value an earlier coercion was supposed to replace; pass
  `stopOnFirstError: false` for pipelines of independent checks. `mapValidated`
  now returns the mapped value instead of discarding it — use the new
  `tapValidated` for the previous side-effect-only behaviour. `first()` reports
  only the last alternative's issues, which is what distinguishes it from `any()`.

  **Constraint corrections.** `ascii` rejects control characters including CR and
  LF; `uuid` accepts versions 1–8 (UUIDv7 included) plus the nil and max UUIDs;
  `email` rejects consecutive dots and bare hostnames; `isoDate` validates the
  calendar date and accepts numeric UTC offsets; `minLength`/`maxLength` count
  code points, so an emoji costs one character rather than two; `slug`'s message
  describes what it actually accepts.

  **Identifier normalization uses NFKC and case folding.** NFC plus `toLowerCase`
  left ligatures and fullwidth forms distinct from their ASCII spellings, so two
  visually identical identifiers normalized to two values. `normalizeEmail` now
  lowercases only the domain, since the local part is case-sensitive per RFC 5321.

  **`normalizeArray` and `transformArray` no longer leak `map`'s extra
  arguments** to the callback, which silently overrode the optional second
  parameter of functions like `parseInt`.

  **The `validationFactory` singleton is gone.** It shared one mutable registry
  process-wide, where one module's `clear()` removed another's rules. Call
  `createValidationFactory()`, or `createScopedValidationFactory(parent)` to share
  a registry deliberately.

  Constraint modules moved into `scalar/`, `collection/` and `structure/`
  subfolders. The package barrel is unchanged.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5)]:
  - @zudojs/errors@0.2.0

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

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
