---
"@zudojs/types": minor
---

Round 10 fixes:

- LEAF-01: `systemRandom.int(max)` no longer hangs when `max > 2**32`. Bounds up to `Number.MAX_SAFE_INTEGER` draw 53 bits by rejection sampling. Non-safe-integer bounds throw a `RangeError`. New export: `MAX_RANDOM_INT_BOUND`.
- LEAF-07 (behaviour change): `SeededRandom` uses mulberry32. `uuid()` no longer cycles after 16 values, and `int(2)` no longer alternates. The value sequence for a given seed is different from before.
- LEAF-15 (behaviour change): `camelToSnake` / `camelToKebab` are Unicode-aware (`caféAuLait` becomes `café_au_lait`) and keep characters other than `_`, `-` and whitespace instead of deleting them.
- LEAF-17: `safeJsonParse` now documents that dropping `constructor` / `prototype` is a deliberate deny-list.
- LEAF-04 / LEAF-19: the `isEmail` doc comment and the README are corrected. Branded types live in `@zudojs/constants`.
