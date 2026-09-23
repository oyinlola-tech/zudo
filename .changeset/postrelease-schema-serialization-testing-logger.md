---
"@zudojs/schema": patch
"@zudojs/serialization": patch
"@zudojs/testing": patch
"@zudojs/logger": patch
---

**@zudojs/schema:** issue messages and the `received` field now name `null`, arrays and `NaN` correctly. `object().safeParse(null)` said "Expected object, received object". It now says "received null". `string().safeParse([])` says "received array", and `number().safeParse(NaN)` says "received NaN". One shared helper covers every schema, including the coercion schemas.

**@zudojs/serialization:** a deserialized `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `EvalError`, `URIError` or `AggregateError` is rebuilt with its own constructor, so `instanceof` holds. Any other name still falls back to `Error` with `name` set. A rebuilt error's `.stack` is now only its header line (`"TypeError: bad input"`). Before, it carried the deserializer's own frames, which made it look like the original stack. A wire stack sent with `includeStack` is still exposed as `originalStack`.

**@zudojs/testing:** the overrides passed to `createStub()` are now own, enumerable properties of the stub, so `Object.keys`, spreading and `expect.objectContaining` see them. A stub no longer answers `asymmetricMatch` with a function, which made Vitest treat it as a matcher. `createSpyMethod(...).restore()` no longer clears `calls`, `results` and `errors`. It only puts the original method back.

**@zudojs/logger:** `createLogger({ redact: false })` now turns off redaction. Before, `false` was spread into `{}` and redaction stayed on. `redact` accepts `true`, `false` or the existing options object, and `{ enabled: false }` still works.
