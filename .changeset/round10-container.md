---
"@zudojs/container": patch
---

Round 10 fixes.

- **CONT-01:** `replace()` and `remove()` now cascade. Every cached singleton built on the replaced token, directly or through a transient, is evicted and disposed. Live scopes also drop and dispose their cached `SCOPED` copies of the token and its consumers. Previously consumers kept serving the old, disposed instance.
- **CONT-02:** Values registered with `registerValue()` or `{ useValue }` belong to the host and are no longer disposed by the container.
- Behaviour changes: replacing a dependency now rebuilds its consumers (and disposes the old ones); `registerValue()` instances are never disposed; use a factory if the container should own disposal.
