---
"@zudojs/rpc": minor
"@zudojs/openapi": minor
"@zudojs/observability": patch
---

Tightened three places where caller-controlled input was not bounded, and one
where a generated document did not match the contract it described.

- **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled
  part of the frame, not just `payload`. `request.id` is capped at the new
  `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with
  `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured
  alongside `payload` against `limits.maxPayloadBytes`. Previously an
  unbounded `metadata` object reached middleware and handlers as
  `context.metadata` however large it was, and an unbounded `id` was echoed
  verbatim into both the success and the error response. `RPCServer.handle`
  no longer reflects an id that exceeds the limit. Frames that were already
  inside the limits are unaffected; a frame whose `payload` and `metadata`
  together now exceed `maxPayloadBytes` is rejected with
  `RPCInvalidRequestError` where it used to be accepted.

- **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path
  template rather than the source path, so `GET /users/:id` and
  `GET /users/{id}` are recognised as the same route and the second is
  rejected. Both used to register, and generation then silently replaced the
  first with the second: one operation disappeared from the published
  document with `validate()` reporting no errors. `hasRoute`, `setRoute` and
  `removeRoute` accept either spelling for the same route.

- **`@zudojs/openapi`** — an object schema that strips unknown keys no longer
  emits `additionalProperties: false`. That keyword means "reject the
  payload", while `strip` accepts it and discards the extra key, so a client
  generated from such a document refused requests the service accepts. Only
  `.strict()` emits it now. This also removes a difference between
  `s.object({…})` and `s.object({…}).strip()`, which validate identically but
  used to document differently. **Regenerate any checked-in spec**: objects
  that are not `.strict()` lose their `additionalProperties: false`.

- **`@zudojs/observability`** — queue-overflow reports from the batch log and
  span processors are rate limited. A stalled exporter used to make every
  subsequent `logger.info()` synchronously allocate an `Error` and re-enter
  the configured `onError` — usually writing to the sink that was already
  failing. The first drop is still reported immediately; after that, at most
  one report per minute, each carrying the running total.

- **`@zudojs/observability`** — a span attribute named `__proto__` is now
  recorded instead of silently vanishing, on both span attributes and event
  attributes. Storing it by plain assignment invoked the prototype setter,
  which dropped the attribute and replaced the bag's prototype; the injected
  prototype then let unlimited further attributes past the `maxAttributes`
  cap. Inherited names such as `toString` are counted against the cap too.
