---
"@zudojs/security": minor
---

New `findUnsafeKey(value)`: returns the first `__proto__`, `constructor` or `prototype` key anywhere in decoded, untrusted data (plain objects and arrays, iterative and cycle-safe), or `undefined`. `@zudojs/rpc` and `@zudojs/api` use it to refuse prototype-polluting request bodies, queue jobs and RPC frames; `containsPrototypePollution` remains the string check.
