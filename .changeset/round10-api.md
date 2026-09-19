---
"@zudojs/api": minor
---

Round 10 fixes.

- **edge/API-01 (security, fail-closed):** `APIExecutor` now validates `input` / `output` against `@zudojs/schema` schemas (and any schema with a `safeParse` method returning `{ success, data | issues }`, including Zod-style `error.issues`), in addition to Standard Schema. Previously a `@zudojs/schema` schema was silently skipped: invalid input reached the handler and output was neither checked nor stripped.
- Behaviour change: a declared `input` / `output` that is neither a Standard Schema nor a `safeParse` schema is no longer treated as documentation. `defineOperation` and `APIOperationRegistry.register` throw a `TypeError`, and the executor answers a hand-rolled operation carrying one with an `APIInternalError` (500) without running the handler. A schema result in an unrecognised shape also fails closed (500).
- New export: `isAPISchema(value)` and the `APISchemaIssue` / `APISchemaResult` types.
