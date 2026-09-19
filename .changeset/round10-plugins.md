---
"@zudojs/plugins": minor
---

Round 10 fixes.

- **PLUG-01:** When a hook exceeds `hookTimeout`, the manager now waits up to another `hookTimeout` for that hook to settle before disposing the plugin. It calls `stop()` if the timed-out `start()` went on to succeed. If `start()` finishes even later, `stop()` runs as soon as it does.
- **CONV-02:** Teardown and event-listener failures no longer go to `console.error`. They go to `onError`, then to the new `PluginManagerOptions.logger`, then to the context logger. With none of these they become a `ZudoPluginWarning` process warning.
