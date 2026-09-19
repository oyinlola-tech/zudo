---
"@zudojs/database": minor
---

Round 10 fixes:

- INF-13: `withTransactionRetry` clamps its exponential backoff to a new `maxRetryDelayMs` option (default 30000 ms, never above the 2^31-1 ms timer limit) and accepts `jitter: "full"`. Large retry budgets used to overflow `setTimeout` into 1 ms retries.

Behaviour changes: a single retry delay never exceeds 30 s unless `maxRetryDelayMs` is raised.
- **infra/INF-18 (phase 2, behaviour change):** the fallback logger used when `DatabaseClient` gets no `logger` option now writes through `@zudojs/logger` (logger name `@zudojs/database`, console transport) instead of calling `console.*` directly. Entries are structured and secret-named metadata fields (`password`, `token`, ...) are redacted. `debug`/`info` are still dropped when `NODE_ENV` is `"production"`; an `Error` passed to `error()` becomes the entry's `error`, any other value is kept as `metadata.error`.
- **infra/LEAF-08 (phase 2):** `toPrismaWhere` uses `isPlainObject` from `@zudojs/types` instead of a local copy. The guard only inspects the operator objects the builder creates itself, so filter values (Prisma `Decimal`, `Date`, other class instances) are untouched; a non-plain existing value is now AND-ed instead of being spread.
