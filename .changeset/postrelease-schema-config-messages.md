---
"@zudojs/schema": patch
"@zudojs/config": patch
---

- `@zudojs/schema`: a well-formed but impossible value now says so — `date()` on `"2026-02-30"` reports "Not a real calendar date" (likewise "Not a real date and time" / "Not a real time of day") instead of "Invalid date format", which sent people looking for a typo. The issue code is unchanged (`INVALID_FORMAT`).
- `@zudojs/config`: `ConfigManagerValidationError.issues` is typed `readonly ConfigValidationIssue[]` (it already held those objects), so reading it no longer needs a cast.
