---
"@zudojs/feature-flags": minor
---

Round 10 fixes.

- **FF-01 (bug):** a dependency is satisfied only when the prerequisite *evaluates* on for the same context (not disabled/draft/archived/expired, not `false`/`null`/`undefined`, its own dependencies satisfied). `resolveDependencies` takes an optional fifth `context` argument.
- **FF-02 (bug):** attribute rules gain an optional `result` (the value served on a match, default `true`). An attribute rule without `result` on a non-boolean flag is skipped instead of serving `true`.
- **FF-03 (security):** `matches` refuses patterns that can backtrack catastrophically (a repeated group that itself repeats or alternates, or a backreference) and tests only values up to 1,024 characters.
- **FF-04 (bug):** `createFeatureFlags` remembers unknown keys for `missingFlagTtlMs` (new option, default 30 s, at most 1,000 keys, cleared on reload). `createCachedProvider` gains `maxEntries` (default 1,000).
- **FF-05 (convention):** `isPlainObject` now matches `@zudojs/types` semantics (false for `Date`, `Map`, class instances) and is deprecated in favour of `@zudojs/types`.

Behaviour changes: dependents turn off where their prerequisite is archived, expired or not rolled out for the subject; non-boolean flags no longer serve `true` from an attribute rule without `result`; nested-quantifier `matches` patterns never match; a missing key is not re-fetched for 30 s; `isPlainObject(new Date())` is `false`.
