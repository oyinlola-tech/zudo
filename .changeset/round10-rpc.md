---
"@zudojs/rpc": minor
---

Round 10 fixes.

- **edge/RPC-01 (security):** `RPCServer.handle(request, { auth })` and `RPCDispatcher.dispatch(request, { auth })` accept trusted, transport-derived identity, exposed frozen as `context.auth`. Frame `metadata` is documented as caller-controlled; the README no longer teaches authenticating on `context.metadata.userId`.
- **edge/RPC-02:** `context.input` now carries the schema-parsed input (stripped, defaulted, coerced), so middleware can authorise on the value the handler receives. `context.request.payload` stays raw. README corrected.
- New exports: `RPCAuthContext`, `RPCContextOptions`; `createRPCContext` takes an optional third `options` argument. All additions are optional; existing calls are unchanged.
