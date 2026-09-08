---
"@zudojs/messaging": minor
---

Add branded-id helpers and guard use of a disposed message bus.

**New helpers `toMessageId`, `toCorrelationId` and `toCausationId`** convert a
`string` into the corresponding branded id type. The branded types previously
had no public constructor, so callers had to reach for a cast to produce one.

**Using a disposed bus now throws `MessageBusDisposedError`** (from
`@zudojs/errors`) instead of proceeding against torn-down state. Code that
published or dispatched after `dispose()` previously got undefined behaviour and
will now get a clear error.
