---
"@zudojs/messaging": patch
---

Round 10 fixes:

- MSG-01: object-form middleware (`bus.use({ handle })`) and handlers resolved through `resolveMessageHandler` are now bound to their object, so class-based middleware and handlers that use `this` work.
- MSG-02: calling `next()` twice in message middleware now throws `MiddlewareNextCalledMultipleTimesError` from `@zudojs/errors` (a `MiddlewareError`) instead of a plain `Error`. The message text changes to `Middleware "message-middleware#<index>" called next() multiple times.`
- MSG-02 (phase 2): the middleware pipeline is built on `compose` from `@zudojs/middleware` instead of a local copy. A double `next()` still throws `MiddlewareNextCalledMultipleTimesError`; its `middlewareName` is now `"middleware[<index>]"` (was `"message-middleware#<index>"`). Pipelines keep no depth ceiling.
