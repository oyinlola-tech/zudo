---
"@zudojs/events": minor
---

Round 10 fixes:

- EVT-01: with `freezeEvents` (the default) handlers now receive a deeply frozen COPY of the event instead of the publisher's objects being frozen in place, and nothing is copied or frozen when no handler is subscribed. Map, Set and Date values (including `event.timestamp`) are copied into `FrozenEventMap` / `FrozenEventSet` / `FrozenEventDate`, which still pass `instanceof` but throw on mutation. New export: `createFrozenEventSnapshot` (plus the three frozen classes).
- EVT-02: every handler (not only once-handlers) is checked for registration immediately before it runs, so a handler unsubscribed by an earlier handler in the same dispatch, or remaining after the bus was disposed inside a handler, no longer runs.
- CONV-02: the default leak warning is emitted through `process.emitWarning` (type `ZudojsEventsWarning`, code `ZUDOJS_EVENTS_HANDLER_LIMIT`) instead of `console.warn`.

Behaviour changes: publishers can mutate their payload objects after publishing; handlers see a copy (so `e.payload.obj !== originalObj`), and instances of user classes inside a payload are passed by reference and are no longer frozen; mutating a Map/Set/Date in a dispatched event now throws a TypeError; the leak warning no longer prints via `console.warn` (it appears as a Node process warning).
- MSG-02 (phase 2): `executeEventMiddlewarePipeline` is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged (descending priority, abort checks before every stage and the terminal, `EventMiddlewareError` for a double `next()` and for a middleware's own errors, downstream errors passed through untouched, no depth ceiling). The pipeline file also drops below 150 lines.
