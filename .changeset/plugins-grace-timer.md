---
"@zudojs/plugins": patch
---

#104 follow-up: after a lifecycle hook times out, the manager waits a short grace period to see whether the abandoned hook settles. That wait used an unref'd timer, so when `start()` never settled, Node could exit mid-await (code 13, "unsettled top-level await") instead of rejecting with `PluginTimeoutError`. The grace timer now holds the event loop and is cleared as soon as the wait is decided. A child-process regression test covers it.
