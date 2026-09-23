# @zudojs/testing

## 1.2.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/http@1.4.1

## 1.2.0

### Minor Changes

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add `createHttpTestClient(target)`, a supertest-style client that drives a real app over HTTP. Targets: a base URL, a Node `http.Server` or `(req, res)` listener (started on an ephemeral port and closed afterwards), a web `(Request) => Response` handler or `{ fetch }` object (dispatched in-process), or an `@zudojs/http` `HttpServer`, `NodeHttpAdapter`, `HttpRouter`, `HttpMiddlewarePipeline` or handler (served through a real `NodeHttpAdapter` on an ephemeral port). Fluent `.get/.post/.put/.patch/.delete/.head/.options`, `.set`, `.query`, `.send`, `.auth`, `.timeout`, a per-client cookie jar, and chained `.expect(status)`, `.expect(header, value | RegExp)`, `.expectJson(partial)`, `.expectText()` that fail with readable `AssertionError`s. Responses are `TestHTTPResponse`s, so the existing response assertions accept them, and `client.request(createTestHTTPRequest()...build())` sends a built request. Also: `InMemoryTestStorage.set()` rejects a `NaN` TTL (it silently never expired) and `delete()` returns `false` for an already-expired key; `createHTTPRequest()` copies `query`/`params`. The cookie jar scopes cookies by the path the server saw, including a base URL's path prefix. Before, a cookie set with `Path=/api` by a client created for `http://host/api` was never sent back. A request timeout past Node's timer range no longer fires after 1 ms.

  The recording doubles now record every path, not only calls made through their own wrapper method. `createTestEventBus()` returns an `EventBus` that records `publish`, `publishEvent` and `emit`, whether they are called on the double or on `bus` (now the same instance). `publish` takes a full `Event`, as `EventBus.publish` does, or an `EventInput` as before. `createTestMessageBus()` is a `MessageBus` that records both `send` and `dispatch`. `createTestQueue()` is a `Queue` that records `add` on the double and on the underlying `queue`. Before, `createTestEventBus().bus.publishEvent(...)`, `createTestMessageBus().bus.send(...)` and `createTestQueue().queue.add(...)` ran but recorded nothing, so tests passed while asserting on empty lists. Each double can be passed where the real type is expected, and destructured methods keep working.

  **Behaviour change:** `createTestApplication()` is now quiet and deterministic by default. Its logger defaults to a silent recording `createSpyLogger(name)` (read `app.logger.calls`) instead of a real logger that printed, and its test clock is pinned at `DEFAULT_TEST_APPLICATION_TIME` (2026-01-01T00:00:00.000Z) instead of starting at the wall-clock time. To opt back in, pass `logger: createLogger({ name })`, `clock`, or the new `startTime` option (`startTime: Date.now()` for wall-clock time). `TestApplication` and `TestApplicationOptions` take an optional logger type parameter, so `app.logger` is typed as the logger you passed, or as a `SpyLogger` by default.

  `createTestQueue().queue` forwards `onJobReady`, so a Worker on a test queue is woken as soon as a job is added instead of waiting for its poll interval.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/storage@1.2.0
  - @zudojs/serialization@1.2.0
  - @zudojs/events@1.3.0
  - @zudojs/security@1.3.0
  - @zudojs/queue@1.4.0
  - @zudojs/messaging@1.2.0
  - @zudojs/config@1.3.0
  - @zudojs/container@1.2.0
  - @zudojs/constants@1.1.2
  - @zudojs/http@1.4.0
  - @zudojs/logger@1.4.0
  - @zudojs/middleware@1.1.0
  - @zudojs/types@1.2.0

## 1.1.2

### Patch Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.

  - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
  - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
  - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
  - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
  - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
  - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
  - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
  - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
  - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

- Updated dependencies [`c904687`, `c904687`, `c904687`, [`d63af51`](https://github.com/oyinlola-tech/zudo/commit/d63af511465e8d2c9e040f5282965e05766200df), `c904687`, `c904687`, `c904687`, `95c1d56`, `c904687`]:
  - @zudojs/container@1.1.2
  - @zudojs/errors@1.2.0
  - @zudojs/events@1.2.0
  - @zudojs/messaging@1.1.0
  - @zudojs/http@1.3.0
  - @zudojs/logger@1.3.0
  - @zudojs/config@1.2.0
  - @zudojs/queue@1.3.0
  - @zudojs/security@1.2.0
  - @zudojs/types@1.1.1
  - @zudojs/serialization@1.1.1
  - @zudojs/constants@1.1.1
  - @zudojs/middleware@1.0.3
  - @zudojs/storage@1.1.2

## 1.1.1

### Patch Changes

- Round 10 audit fixes.

  - `deepEqual` / `findDifference` (and every assertion built on them: `assertSerializesCorrectly`, `assertDeserializesTo`, `assertErrorMetadata`, spy-logger matchers) now compare type as well as keys (tooling/TEST-01):
    - objects must share a prototype, so a class instance no longer equals a plain object or an instance of another class (`{}` and `Object.create(null)` still count as the same);
    - Errors compare `name`, `message` and `cause`;
    - boxed primitives compare their value;
    - typed arrays must have the same constructor;
    - distinct Promises, WeakMaps, WeakSets and WeakRefs are never equal.
  - Set/Map comparison no longer lets an identity hit on an already-matched entry remove an unrelated unmatched entry (`splice(-1, 1)`), and a structurally matched Map key now prefers the key whose value also matches.

  Behaviour change: assertions that passed by accident (an Error serialized to `{}`, a class instance compared against a plain object) now fail.

- Updated dependencies [`5d6b957`, `d2b01bf`, `d2b01bf`, `d2b01bf`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `5d6b957`, `d2b01bf`]:
  - @zudojs/config@1.1.0
  - @zudojs/constants@1.1.0
  - @zudojs/container@1.1.1
  - @zudojs/errors@1.1.0
  - @zudojs/events@1.1.0
  - @zudojs/http@1.2.0
  - @zudojs/logger@1.2.0
  - @zudojs/messaging@1.0.2
  - @zudojs/middleware@1.0.2
  - @zudojs/queue@1.2.0
  - @zudojs/security@1.1.0
  - @zudojs/serialization@1.1.0
  - @zudojs/storage@1.1.1
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 fixes:

  - `SpyLogger.findByMetadata()` compares structurally (same walker as the assertions) instead of by `JSON.stringify`. It no longer matches any `Map`/`Set` against any other, no longer ignores `undefined` properties, and now matches objects regardless of key order.
  - `assertThrows()` given an async function (or any function returning a promise) now throws "returned a promise; use assertRejects" and handles the rejection, instead of reporting "did not throw" and leaking an unhandled rejection.
  - `CleanupManager.dispose()` called while a previous `dispose()` is still running now shares that run (and its `AggregateError`) instead of resolving immediately before the resources were released.
  - `SpyLogger.child({ metadata, level })` now records the child metadata on every call the child writes (call metadata still wins) and honours a child `level` override, matching the real logger.
  - `deepEqual` / `findDifference` / `assertResponseBody` and friends compare `Set` members and `Map` keys structurally, so `new Set([{ id: 1 }])` equals `new Set([{ id: 1 }])`.
  - `TestClock.add()` throws a `TypeError` for a non-finite duration instead of silently setting the clock to `Invalid Date`.
  - `MockFn.results` stays aligned with `calls` when the implementation throws (the slot holds `undefined`), and the new `MockFn.errors` array records the thrown values in call order.
  - `assertTypePreservesRoundTrip()` renders its failure message with `describeValue`, so a failing check on a `BigInt`, `Map` or circular value throws the assertion error rather than a `TypeError` from `JSON.stringify`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/config@1.0.1
  - @zudojs/container@1.1.0
  - @zudojs/errors@1.0.1
  - @zudojs/events@1.0.1
  - @zudojs/http@1.1.0
  - @zudojs/logger@1.1.0
  - @zudojs/messaging@1.0.1
  - @zudojs/middleware@1.0.1
  - @zudojs/queue@1.1.0
  - @zudojs/security@1.0.1
  - @zudojs/serialization@1.0.1
  - @zudojs/storage@1.1.0
  - @zudojs/validation@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Make the assertions capable of failing, and the doubles behave like what they double.

  Every change here can turn a currently-green test red. That is the intent:
  these helpers were reporting success on input they should have rejected, in the
  package other suites rely on to tell them the truth.

  **Deep-equality assertions compare structurally.** `assertResponseBody`,
  `assertEventPayload`, `assertSerializesCorrectly` and `assertDeserializesTo`
  compared `JSON.stringify(actual) !== JSON.stringify(expected)`, which is not
  equality in either direction: `Map`, `Set`, functions and `undefined` values
  all stringify to nothing, so structurally different values compared equal; key
  order was significant, so equal values compared different; and circular or
  `BigInt` input threw a `TypeError` out of the assertion. It bit hardest in
  `assertSerializesCorrectly`, whose job is verifying that `Map`, `Set`, `Date`
  and `BigInt` survive a round trip — it was blind to exactly those types, so a
  serializer that dropped every `Map` entry passed. Failures now name the path
  and the difference. `assertResponseBodyContains` is added for partial matches.

  **`createStub` can be awaited.** The proxy answered _every_ property with a
  function, including `then`, which made every stub a thenable: `await stub`, or
  returning one from an async factory, called `stub.then(resolve, reject)`, and
  the fake `then` never resolved. The test hung until it timed out with nothing
  pointing at the stub. `then`, `catch` and `finally` now answer `undefined`
  unless overridden. Override lookup uses `Object.hasOwn`, so a method named
  `toString` or `constructor` is stubbed rather than resolving to `undefined`.

  **`createStubClass` uses the class it is given.** The parameter was ignored, so
  instances failed `instanceof` and every non-overridden method was absent rather
  than stubbed. Instances now keep the original prototype and unspecified methods
  exist as no-ops.

  **Cleanup failures surface.** `dispose()` cleared `entries` before testing
  `errors.length === entries.length`, so the condition required
  `errors.length > 0 && errors.length === 0` and could never be true — every
  failure to close a connection, stop a server or clear a timer was discarded
  unless an `onError` callback was supplied. `dispose()` now rejects with an
  `AggregateError` when _any_ cleanup fails, after running them all.

  **Mock functions produce promises.** `mockResolvedValue(v)` returned `v`
  directly and `mockRejectedValue(e)` threw synchronously, so tests for error
  handling exercised a path the real code never takes. Both now return a promise.
  `undefined` is a legitimate configured value — `mockReturnValue(undefined)` was
  silently ignored — and `results` is now aligned index-for-index with `calls`,
  which it was not whenever a call fell through to the default.

  **Spies forward their receiver.** `createSpyMethod` invoked the original
  without `this`, so spying on any method that touches instance state threw
  immediately — including the one in its own docstring. `restore()` now deletes
  an inherited method instead of leaving a permanent own property, and both spies
  record thrown errors. `SpyFn.restore()` is renamed `reset()`: it only ever
  cleared the recorded calls, and there was nothing to restore.

  **`createTestClock(0)` pins to the epoch.** The falsy check treated it as "not
  supplied" and handed back the real clock, in the one place determinism was
  being asked for. An unparseable time now throws instead of yielding `NaN`.

  **The spy logger records derived loggers.** `child()` and `withContext()`
  returned a logger with its own array, so code doing `logger.child({ module })`
  — the normal pattern — logged where nobody was looking and assertions on the
  parent silently saw nothing. Derived loggers now share the parent's recording,
  and context is flattened onto each call's metadata. The logger also honours its
  level and `enable()`/`disable()`, which it previously ignored entirely, so a
  test can verify that debug logging is suppressed.

  **`assertErrorMetadata` and `findByMetadata` compare structurally,** so object
  and array metadata can match; strict identity made them impossible to satisfy
  while printing an "expected X, got X" message.

  **`createTestApplication` awaits container disposal** — the promise was dropped,
  racing teardown against the end of the test — and registers the logger first so
  it closes last, after anything that logs while the container disposes.

  **Other corrections.** `InMemoryTestStorage` distinguishes a stored `null` from
  a miss, and `keys()`/`size` exclude expired entries. Recorders and test buses
  return copies rather than their live backing arrays. Test bus ids use
  `randomUUID()` instead of `Date.now()` plus `Math.random()`.
  `assertEventNotPublished`, `assertMessageNotDispatched` and `assertErrorType`
  are added.

### Patch Changes

- Updated dependencies [[`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/queue@0.2.0
  - @zudojs/errors@0.2.0
  - @zudojs/http@0.2.0
  - @zudojs/messaging@0.2.0
  - @zudojs/security@0.2.0
  - @zudojs/serialization@0.2.0
  - @zudojs/storage@0.2.0
  - @zudojs/types@0.2.0
  - @zudojs/validation@0.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`6bec11b`](https://github.com/oyinlola-tech/zudo/commit/6bec11bcd56041d3590d5fea932d4ea99ad1861d)]:
  - @zudojs/http@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`641c4c5`](https://github.com/oyinlola-tech/zudo/commit/641c4c5f9616d73e150b1598ae1b4abf05de23e4)]:
  - @zudojs/http@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`8d91db6`](https://github.com/oyinlola-tech/zudo/commit/8d91db68f93219803db971f2f855ec55af6c8dbf)]:
  - @zudojs/http@0.0.2

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
  - @zudojs/config@1.0.0
  - @zudojs/constants@1.0.0
  - @zudojs/container@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/events@1.0.0
  - @zudojs/http@1.0.0
  - @zudojs/logger@1.0.0
  - @zudojs/messaging@1.0.0
  - @zudojs/middleware@1.0.0
  - @zudojs/queue@1.0.0
  - @zudojs/security@1.0.0
  - @zudojs/serialization@1.0.0
  - @zudojs/storage@1.0.0
  - @zudojs/types@1.0.0
  - @zudojs/validation@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/config@0.1.2
  - @zudojs/logger@0.1.2
  - @zudojs/container@0.1.2
  - @zudojs/events@0.1.2
  - @zudojs/messaging@0.1.2
  - @zudojs/middleware@0.1.2
  - @zudojs/validation@0.1.2
  - @zudojs/serialization@0.1.2
  - @zudojs/http@0.1.2
  - @zudojs/queue@0.1.2
  - @zudojs/security@0.1.2
  - @zudojs/storage@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/config@0.1.1
  - @zudojs/logger@0.1.1
  - @zudojs/container@0.1.1
  - @zudojs/events@0.1.1
  - @zudojs/messaging@0.1.1
  - @zudojs/middleware@0.1.1
  - @zudojs/validation@0.1.1
  - @zudojs/serialization@0.1.1
  - @zudojs/http@0.1.1
  - @zudojs/queue@0.1.1
  - @zudojs/security@0.1.1
  - @zudojs/storage@0.1.1
