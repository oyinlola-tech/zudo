# @zudojs/testing

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
