---
"@zudojs/serialization": minor
---

Round 10 fixes.

- **data/SER-01 / cross/X-04 (security):** with `preserveTypes`, a plain object that has its own string `$type` key is written escaped as `{"$type":"Object","$value":{...}}` and read back as that plain object, so user data can no longer be revived as a `Map`, `Error`, `BigInt`, `Date` or `Buffer`. New export `ESCAPED_OBJECT_TAG` (`"Object"`), which `registerTransformer` refuses. Payloads written before this change remain readable (unescaped tags are revived as before). A tag whose transformer rejects it (for example `{"$type":"Date","$value":"nope"}`) now reads back as a plain object instead of making the record unreadable; with `strict: true` it throws `TransformerError` / `InvalidSerializedDataError`.
- **data/SER-03 (DoS):** BigInt tags are limited to 4096 decimal digits and validated before `BigInt()` runs; serializing a larger BigInt throws `SerializeError`.
- **data/SER-04:** failures throw `@zudojs/errors` classes: `SerializationPayloadTooLargeError`, `SerializationDepthError`, `InvalidSerializedDataError` (invalid JSON — now also outside strict mode, where a raw `SyntaxError` used to escape — and unknown or malformed tags under `strict`), `TransformerError`, and `SerializeError` for an invalid `Date` (previously a raw `RangeError`). Messages are unchanged.
- **data/SER-05:** `createSerializer` accepts every serialize/deserialize option (`maxSize`, `maxDepth`, `strict`, `allowUnsafeKeys`, `includeStack`, ...) as an instance default.
- **data/VAL-01:** `serialize({ preserveTypes: true })` handles sparse arrays (via the `@zudojs/validation` fix and an index loop).
