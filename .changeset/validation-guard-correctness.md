---
"@zudojs/validation": minor
---

Fix both resource guards, stop echoing rejected input, and close a prototype hole.

**The depth guard no longer overflows the stack it protects.**
`assertDepthWithinLimit` computed the full depth of the input by unbounded
recursion and only then compared it to the limit, so deeply nested JSON
exhausted the stack inside the check — with a limit of 32, a 20,000-deep array
still recursed 20,000 frames. The walk is now iterative and aborts the moment
the limit is passed, so the cost is bounded by `maxDepth` rather than by the
size of the input. `getSerializationDepth` takes an optional limit and returns
it when reached, and no longer follows cycles.

**The size guard no longer undercounts shared references.**
`estimateSerializedSize` returned `0` for any object it had already seen, which
is right for a cycle and wrong for every DAG: a payload that references one
subtree repeatedly was counted once, but `JSON.stringify` expands each
occurrence. A 358-byte estimate corresponded to 356 MB of actual JSON, so a
"billion laughs" payload passed a 10 KB limit and then exhausted memory in the
code the guard protects. Occurrences are now counted individually and counting
aborts once the budget is passed. Numbers are charged their worst-case JSON
width rather than a flat 8 bytes, so estimates rise for numeric payloads.

**Circular detection no longer rejects every DAG.**
`assertNoCircularReference` never unmarked a node on the way back up, so it
could not tell "appears twice" from "refers to itself" — one config object
referenced by two fields was reported as a cycle. It now tracks the current
path. `@zudojs/serialization` calls this on every `serialize`, so payloads it
was refusing will now serialize.

**Rejected values are no longer attached to issues.** `checkConstraint` and
`checkConstraints` set `issue.received` to the raw failing value;
`ValidationError` carries `expose: true` and spreads `issues` into `toJSON()`,
so a password below the minimum length came back in the 400 body and into any
log that serialized the error. `received` is no longer populated by the
constraint, normalizer or transformer paths. Code reading `issue.received` from
a constraint failure will find it absent.

**`parseRecord` cannot hijack its result's prototype.** Results accumulated
into an object literal, so a `__proto__` key — which `JSON.parse` produces as a
real own property — went through the prototype setter and the "validated"
object silently inherited attacker-supplied fields. Results now build on
`Object.create(null)`, and `__proto__`, `constructor` and `prototype` keys are
reported as issues. `toFieldErrors` is built the same way, which also fixes
fields named `constructor` or `toString` being silently dropped.

**`matches()` strips `g` and `y` from the pattern.** Those flags make `test()`
stateful through `lastIndex`, so a shared constraint alternated between
accepting and rejecting the very same value.

**Constraints no longer throw on wrong-typed input.** Constraints receive
whatever the caller passed, which at a trust boundary is arbitrary JSON;
`everyItem(...)` on a number escaped as a raw `TypeError`, turning a 400 into a
500. Constraints now carry an optional `guard`, applied by `validate` itself,
and a wrong-typed value reports as a validation failure.

**`ValidationError.code` is a real `ErrorCode`.** It was a double cast of
`ValidationErrorCode`, so `error.code` held a value the errors package does not
recognise and any status mapping keyed on it missed. `validationCode` still
carries the package-specific code.

**Composers halt at the first failing step by default.** Running on meant later
steps validated the value an earlier coercion was supposed to replace; pass
`stopOnFirstError: false` for pipelines of independent checks. `mapValidated`
now returns the mapped value instead of discarding it — use the new
`tapValidated` for the previous side-effect-only behaviour. `first()` reports
only the last alternative's issues, which is what distinguishes it from `any()`.

**Constraint corrections.** `ascii` rejects control characters including CR and
LF; `uuid` accepts versions 1–8 (UUIDv7 included) plus the nil and max UUIDs;
`email` rejects consecutive dots and bare hostnames; `isoDate` validates the
calendar date and accepts numeric UTC offsets; `minLength`/`maxLength` count
code points, so an emoji costs one character rather than two; `slug`'s message
describes what it actually accepts.

**Identifier normalization uses NFKC and case folding.** NFC plus `toLowerCase`
left ligatures and fullwidth forms distinct from their ASCII spellings, so two
visually identical identifiers normalized to two values. `normalizeEmail` now
lowercases only the domain, since the local part is case-sensitive per RFC 5321.

**`normalizeArray` and `transformArray` no longer leak `map`'s extra
arguments** to the callback, which silently overrode the optional second
parameter of functions like `parseInt`.

**The `validationFactory` singleton is gone.** It shared one mutable registry
process-wide, where one module's `clear()` removed another's rules. Call
`createValidationFactory()`, or `createScopedValidationFactory(parent)` to share
a registry deliberately.

Constraint modules moved into `scalar/`, `collection/` and `structure/`
subfolders. The package barrel is unchanged.
