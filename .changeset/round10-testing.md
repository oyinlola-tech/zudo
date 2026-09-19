---
"@zudojs/testing": patch
---

Round 10 audit fixes.

- `deepEqual` / `findDifference` (and every assertion built on them: `assertSerializesCorrectly`, `assertDeserializesTo`, `assertErrorMetadata`, spy-logger matchers) now compare type as well as keys (tooling/TEST-01):
  - objects must share a prototype, so a class instance no longer equals a plain object or an instance of another class (`{}` and `Object.create(null)` still count as the same);
  - Errors compare `name`, `message` and `cause`;
  - boxed primitives compare their value;
  - typed arrays must have the same constructor;
  - distinct Promises, WeakMaps, WeakSets and WeakRefs are never equal.
- Set/Map comparison no longer lets an identity hit on an already-matched entry remove an unrelated unmatched entry (`splice(-1, 1)`), and a structurally matched Map key now prefers the key whose value also matches.

Behaviour change: assertions that passed by accident (an Error serialized to `{}`, a class instance compared against a plain object) now fail.
