---
"@zudojs/schema": minor
---

Round 10 fixes.

- **data/SCHEMA-01 (security):** `maxIssues` caps how many issues are collected, never whether parsing fails. The first issue is always kept (`maxIssues: 0` behaves like `1`) and dropped issues are counted, so object, array and union schemas no longer accept anything under `maxIssues: 0`. New export `countIssues(ctx)` for custom schemas.
- **data/SCHEMA-02:** `refine` and `transform` callbacks (`schema.refine`, `schema.transform`, `StringSchema/NumberSchema.transform`) are skipped when the inner schema recorded an issue, so they never see a partially valid object.
- **data/SCHEMA-03 (DoS):** `SCHEMA_DEFAULT_MAX_OBJECT_KEYS` (100) is now enforced on `record()` and on objects in `.strict()` / `.passthrough()` mode (never below the shape's own key count). New opt-in `.maxKeys(n)` on `RecordSchema` and `ObjectSchema`. Behaviour change: records with more than 100 keys now fail unless `.maxKeys()` raises the limit.
- **data/SCHEMA-04:** `intersection` deep-merges nested plain-object results instead of letting the right side replace the left's nested object.
- **data/SCHEMA-05:** `array().max(n)` reports `too_large` once instead of twice.
