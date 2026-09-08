---
"@zudojs/errors": minor
---

Harden error classification, public serialization and metadata handling.

These are behavioural changes. Code that compiles unchanged may now produce
different HTTP status codes and different response bodies.

**Native errors are no longer treated as client input.** `mapNativeError` (and
`mapError` falling through to it) previously classified native `TypeError`,
`RangeError` and `SyntaxError` as 400 client errors. They are overwhelmingly
programmer bugs, not bad input, so they are now non-operational internal errors:
**500, not exposed**. If your handler relied on a thrown `TypeError` surfacing to
the client as a 400, register an explicit mapping rule with `mapErrorType` to
restore that behaviour for the specific error type you mean.

**Public 500 bodies no longer carry metadata.** The public serializers emitted
`metadata` for non-exposed errors, leaking internal detail to clients. Metadata
is now included only for exposed errors, or when the serializer is explicitly
configured to include it. Clients that read `metadata` off a 500 response will
now see it absent.

**Corrected HTTP status codes.** Several errors returned a status that did not
match their semantics and now map to the correct one: **412** (precondition
failed), **413** (payload too large), **415** (unsupported media type), **423**
(locked) and **502** (bad gateway). Assertions pinned to the previous codes will
need updating.

**Server-side registry errors are 500 and non-exposed.** Failures originating in
the error registry itself are internal faults and are no longer reported as
client errors.

**`BaseError.withMetadata` no longer re-runs the constructor.** It previously
rebuilt the error by invoking the subclass constructor, which re-ran any
constructor side effects and discarded fields a subclass had set outside the
constructor's argument path. It now clones the existing instance and merges
metadata. Subclasses that depended on constructor re-execution to derive fields
will see those fields preserved from the original instance instead of recomputed.
