---
"@zudojs/errors": patch
"@zudojs/validation": patch
"@zudojs/types": patch
"@zudojs/serialization": patch
"@zudojs/schema": patch
---

Hardens the type and error primitives against untrusted input, and makes a
handful of failure paths report the error a caller can actually act on.

- `BaseError` no longer overflows the stack when a deeply nested object or
  array is attached as a `cause`. The redaction walk is now bounded at 32
  levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning
  already did, so `JSON.stringify(err)`, `serializeError(err, { includeCause:
  true })` and `ErrorHandler.toLogObject(err)` stay safe on a parsed request
  body. Attacker-controlled depth could previously raise a `RangeError` from
  inside the logging path.
- `estimateSerializedSize(value)` now defaults to a finite budget
  (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every
  occurrence of a shared subtree is charged, an unbounded budget let a 1 KB
  payload of shared references burn minutes of CPU. Pass an explicit
  `Number.POSITIVE_INFINITY` if you need an exact measurement of input you
  trust; the returned value is otherwise capped at the budget.
- `assertNoCircularReference` reports running out of depth as
  `SerializationDepthError` rather than dressing it up as
  `CircularReferenceError`, and `JSONSerializer.serialize(…, { preserveTypes:
  true })` passes the caller's `maxDepth` into it. A deep but perfectly
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
