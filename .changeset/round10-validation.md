---
"@zudojs/validation": patch
---

Round 10 fixes.

- **data/VAL-01:** sparse arrays no longer crash `hasCircularReference`, `assertDepthWithinLimit`, `getSerializationDepth`, `estimateSerializedSize` or `assertSizeWithinLimit` with a raw `TypeError`; a hole counts as `undefined`.
- **data/VAL-02 (DoS):** the cycle and depth guards no longer re-walk a shared subtree from the same or a shallower depth, so a DAG of shared nodes is linear instead of exponential. The size estimate still charges every occurrence (bounded by its budget).
- **data/VAL-03:** `estimateSerializedSize` / `assertSizeWithinLimit` measure what `toJSON()` returns (Dates and binary views keep their existing charges). New optional `resolve` hook on `TraversalVisitor`.
- **data/VAL-04:** a registry rule with both `schema` and `constraints` runs the schema, then the constraints on the parsed value. Behaviour change: such rules can now fail where they used to pass.
- **data/VAL-05 / cross/CV-02:** `ValidationError` and `ValidationResultError` now extend `@zudojs/errors`' `ValidationError`, so `instanceof` and `isValidationError()` from `@zudojs/errors` catch them. Public fields are unchanged.
- **data/VAL-06 (fail-closed):** `not(constraint)` carries the inner constraint's guard and treats a throw as a failure. Behaviour change: `not(matches(...))` now rejects non-strings.
- **data/VAL-07:** `everyItem` / `someItem` read every index, so holes in a sparse array are checked.
- **LEAF-10 (security):** `ValidationError.toJSON()` and `ValidationResultError.toJSON()` no longer overwrite the base class's redacted `issues` with the raw ones, and `ValidationError`'s `context` is serialized from the redacted metadata. Behaviour change: serialized issues carry `receivedType` (etc.) instead of the submitted value, and sensitive context keys are `[REDACTED]`. The raw values remain on the error instance.
- **data/VAL-05 / cross/CV-02 (phase 2):** the exported `TraversalLimitError` (thrown by `traverse()`, the bounded walker behind the depth, size and circular guards) is now re-exported from `@zudojs/errors`, together with `TraversalHalt`. Same name, constructor, `halt`/`path`/`observed` fields and message; it is now a `BaseError` (code `VALIDATION_FAILED`, status 400, `expose: false`, `toJSON()` includes halt/path/observed). The public guards translate it exactly as before.
- **leaf/LEAF-04 / data/CONV-02 (phase 2, behaviour change):** the `email` constraint now rejects addresses longer than 254 characters (checked before the pattern runs), so it accepts exactly what `ValidationPattern.EMAIL` in `@zudojs/constants` and `isEmail` in `@zudojs/types` accept. A shared corpus test pins the three together. The pattern is still a local copy because validation does not depend on `@zudojs/constants`.
