---
"@zudojs/errors": minor
---

Round 10 fixes:

- LEAF-02: `ErrorSerializer` and `ErrorHandler.toLogObject` redact array causes, and redact every field of a plain-object cause that only looks like a serialized BaseError. Only objects that a BaseError's `toJSON` really produced get BaseError treatment now.
- LEAF-03: the cause depth limit (8) is counted across the whole chain, BaseError causes included. A 20 000-deep wrapper chain no longer overflows the stack in `toJSON`, `toLogObject`, `ErrorSerializer.serialize` or `ErrorHandler.toLogObject`.
- LEAF-09 (behaviour change): `BaseError.toJSON()` / `toLogObject()` (and therefore `JSON.stringify(error)`) redact metadata values under sensitive keys and sensitive keys inside plain-object causes. The raw values stay on `error.metadata` / `error.cause`. `ErrorSerializer({ redactSensitiveData: false })` still returns raw values.
- LEAF-10 (behaviour change): `ValidationError` / `SchemaError` `toJSON()` always replace issue values with a type description, including when `expose` is false. Raw values stay on `error.issues`.
- LEAF-11: `redactIssueValues` drops `__proto__` / `constructor` / `prototype` keys, so a JSON-parsed issue cannot swap the output's prototype.
- LEAF-13: `safeStringify` tracks the ancestor path, so a shared, non-cyclic sub-object is no longer printed as `[Circular]`.
- LEAF-14: `sanitizeFragment` strips U+2028/U+2029 and the bidi marks, embeddings, overrides and isolates.
- New classes that other packages defined locally (additive; consumers not switched yet): `TransactionError` and its 10 subclasses, `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`, `TraversalLimitError`, `HttpMiddlewareError`, `HttpMiddlewarePipelineError`, `HttpRequestGuardError`, `OpenAPIError`, `AuthError`, `OAuthError`, `CqrsError`, `ObservabilityError`, `InvalidConstantError`, `ConstantContextError`. Also new: `ErrorCode.OAUTH_*` (the values equal `@zudojs/auth-oauth`'s code strings).
