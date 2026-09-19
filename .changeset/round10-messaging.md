---
"@zudojs/messaging": patch
---

Round 10 fixes:

- MSG-01: object-form middleware (`bus.use({ handle })`) and handlers resolved through `resolveMessageHandler` are now bound to their object, so class-based middleware and handlers that use `this` work.
- MSG-02: calling `next()` twice in message middleware now throws `MiddlewareNextCalledMultipleTimesError` from `@zudojs/errors` (a `MiddlewareError`) instead of a plain `Error`. The message text changes to `Middleware "message-middleware#<index>" called next() multiple times.`
