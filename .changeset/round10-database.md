---
"@zudojs/database": minor
---

Round 10 fixes:

- INF-13: `withTransactionRetry` clamps its exponential backoff to a new `maxRetryDelayMs` option (default 30000 ms, never above the 2^31-1 ms timer limit) and accepts `jitter: "full"`. Large retry budgets used to overflow `setTimeout` into 1 ms retries.

Behaviour changes: a single retry delay never exceeds 30 s unless `maxRetryDelayMs` is raised.
