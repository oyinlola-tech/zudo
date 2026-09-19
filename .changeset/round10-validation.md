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
