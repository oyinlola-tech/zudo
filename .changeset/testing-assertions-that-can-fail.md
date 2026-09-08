---
"@zudojs/testing": minor
---

Make the assertions capable of failing, and the doubles behave like what they double.

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

**`createStub` can be awaited.** The proxy answered *every* property with a
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
`AggregateError` when *any* cleanup fails, after running them all.

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
