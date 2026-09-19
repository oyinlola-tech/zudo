---
"@zudojs/constants": minor
---

Round 10 fixes:

- X-05 (behaviour change): `createTenantId` validates now. It NFKC-normalizes, trims and lowercases, then enforces `[a-z0-9][a-z0-9_-]*` and 64 characters (the `@zudojs/tenancy` rule), and throws `InvalidConstantError` otherwise. New exports: `TENANT_ID_PATTERN` and `MAX_TENANT_ID_LENGTH`.
- LEAF-04 (behaviour change): `ValidationPattern.EMAIL` (and so `createEmailAddress` and `SCHEMA_STRING_FORMATS.EMAIL`) accepts the same set as `isEmail` in `@zudojs/types`. It now accepts `o'brien@example.com`, `user@host.123` and `a@b.c`, still rejects `..`, and has the 254-character bound built in.
- LEAF-05 (type-level change): `Random` is branded. `createMockRandom` returns the new `MockRandom` type (`deterministic: true`), which is not assignable to `Random`. `RandomSource` holds the shared methods.
- LEAF-06: `createTimestamp` rejects dates and times that do not exist (`2024-02-30`, `24:00`, minute 60, offset hour 24).
- LEAF-12 (behaviour change): the immutable sets (`SCHEMA_FORBIDDEN_KEYS`, `HTTP_METHODS`, ...) keep their values in private storage, so `Set.prototype.clear.call(set)` throws. They implement `ReadonlySet` but are no longer `Set` instances.
- CV-02: `InvalidConstantError` and `ConstantContextError` are now owned by `@zudojs/errors` and re-exported here.
- SER-03 (phase 2, new API): `SerializationLimits.MAX_BIGINT_DIGITS` (4096), the shared bound on decimal digits accepted when decoding or coercing a BigInt from text. `@zudojs/serialization` and `@zudojs/schema` use it.
