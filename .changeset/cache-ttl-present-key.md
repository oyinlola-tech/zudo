---
"@zudojs/cache": patch
---

`ttl()` never reports `0` for a key that is still present. Rounding the remaining time down to whole milliseconds (new in 1.2.0) made a key in its last fraction of a millisecond read as `0`, which callers use to mean "expired"; it now reads as `1`.
