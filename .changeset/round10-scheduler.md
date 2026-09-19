---
"@zudojs/scheduler": patch
---

Round 10 fixes:

- INF-01: a schedule added after `start()` (`every`, `after`, `at`, `cron`) now re-arms the timer immediately. It used to wait for an unrelated timer, up to about 24.8 days on an empty scheduler.
- INF-05: `timezone: "UTC"` cron no longer skips minutes 0-29 of a restricted hour on hosts with a half-hour offset (Asia/Kolkata, Newfoundland and similar). Hour skips and second-clearing now use UTC arithmetic in UTC mode.
- INF-06: a `cron` (or `interval`) trigger with no next fire time, such as `0 0 30 2 *`, is rejected at registration with `InvalidScheduleError`. It used to be treated as a misfire, run once immediately and then retire silently. One-shot (`at`/`after`) misfire behaviour is unchanged.

Behaviour changes: `cron()` throws `InvalidScheduleError` for an expression that can never fire.
