# @zudojs/rpc

Type-safe RPC — define procedures, apply middleware, dispatch calls, and serve them in-process or over HTTP with the built-in transports, or over your own.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-rpc](https://zudojs.oyinlola.site/docs/packages-rpc) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-rpc.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## When to use

Import this when you need:

- a typed RPC layer between services (gateway ↔ microservice, frontend ↔ backend)
- procedure-level middleware (auth, tracing, rate limit)
- a server that validates frames and maps every failure to a wire code
- structured RPC errors

The package is transport-agnostic: `RPCServer.handle` takes a request frame
and returns a response frame, and `RPCClient` sends through any object
implementing `RPCTransport`. Two transports ship with it: an in-memory one
(`createRPCMemoryTransport`) and HTTP on the web-standard Fetch API
(`createRPCHttpTransport` for the client, `createRPCFetchHandler` for the
server). There is no WebSocket transport.

To expose `@zudojs/api` operations as procedures, use
`registerApiRpcProcedures` from `@zudojs/api`.

## Installation

```bash
npm install @zudojs/rpc
```

## Public API

```typescript
import {
  createRPCProcedure,
  createRPCRequest,
  RPCServer,
  RPCClient,
  RPCDispatcher,
  RPCProcedureRegistry,
  RPCMiddlewareStack,
  createRPCContext,
  type RPCContext,
  type RPCMiddleware,
  type RPCProcedure,
  type RPCRequest,
  type RPCResponse,
  type RPCTransport,
  type RPCErrorOptions,
  // transports
  createRPCMemoryTransport,
  createRPCHttpTransport,
  createRPCFetchHandler,
  createRPCJsonSerializer,
  readBoundedBody,
  isRPCResponseFrame,
  RPC_HTTP_STATUS,
  rpcHttpStatus,
  // errors on the wire
  mapRPCError,
  rpcErrorFromWire,
  DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
  MAX_RPC_FRAME_DEPTH,
} from "@zudojs/rpc";
```

## Usage

A procedure is `createRPCProcedure(name, handler, options?)`. Names are
dot-separated identifiers (`"math.sum"`); the handler is positional,
`(input, context)`; `options.input` / `options.output` are `@zudojs/schema`
schemas (anything with `safeParse`) the payload and result are checked
against.

```typescript
import { createRPCProcedure, createRPCRequest, RPCServer } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";

const sum = createRPCProcedure(
  "math.sum",
  async (input: { a: number; b: number }) => input.a + input.b,
  { input: schema.object({ a: schema.number(), b: schema.number() }) },
);

const server = new RPCServer();
server.register(sum);

const response = await server.handle(
  createRPCRequest({
    id: "req-1",
    procedure: "math.sum",
    payload: { a: 1, b: 2 },
  }),
);
// { id: "req-1", success: true, result: 3 }
```

`handle` never throws for a bad request: a malformed frame, an unknown
procedure, a payload the input schema rejects, a timeout or a handler error
each come back as `{ success: false, error: { code, message, details? } }`.
The frame's `metadata` is optional.

### Calling through a transport

`RPCClient` sends through an `RPCTransport`: an object whose `send(request, options)`
delivers the frame and resolves with the response. `options.signal` aborts the
call and `options.timeout` is the deadline in milliseconds.

**In memory**, for tests and modular monoliths:

```typescript
import { RPCClient, createRPCMemoryTransport } from "@zudojs/rpc";

const client = new RPCClient(
  createRPCMemoryTransport(server, { auth: { userId: "u1" } }),
  { timeout: 5_000 },
);

const total = await client.call<{ a: number; b: number }, number>("math.sum", {
  a: 1,
  b: 2,
});
// 3
```

Frames are round-tripped through JSON by default, so the server never shares
objects with the caller, and a value that could not cross a network (a
`BigInt` result, a cycle) fails in memory too. Pass `serializer: false` to hand
frames over by reference. `auth` (a value, or a function of the request) is
handed to the server as the trusted `context.auth`.

**Over HTTP.** Mount the server's fetch handler on any Fetch API server at one
POST endpoint, and point the client transport at it:

```typescript
import { createRPCFetchHandler, createRPCHttpTransport } from "@zudojs/rpc";

// Server: (request: Request) => Promise<Response>
const handle = createRPCFetchHandler(server, {
  auth: async (request) => verifyBearer(request.headers.get("authorization")),
  onInternalError: (error, requestId) => logger.error({ requestId, error }),
});
Bun.serve({ port: 3000, fetch: handle }); // or Deno.serve, an edge runtime, …
// On @zudojs/http, no glue code: mountFetchHandler(router, "/rpc", handle);

// Client: uses the global fetch.
const remote = new RPCClient(
  createRPCHttpTransport({
    url: "https://math.internal/rpc",
    headers: () => ({ authorization: `Bearer ${currentToken()}` }),
  }),
  { timeout: 5_000 },
);
await remote.call("math.sum", { a: 1, b: 2 });
```

On `@zudojs/http`, mount it with `mountFetchHandler(router, "/rpc", handle)`. The handler answers every path it is mounted on, so the prefix that `mountFetchHandler` strips does not matter. It reads at most `maxBodyBytes` (default
`DEFAULT_RPC_HTTP_MAX_BODY_BYTES`, 1 MiB plus envelope headroom) without
buffering more, and decodes with a size- and depth-limited
`@zudojs/serialization` JSON serializer. Every reply, including one to a bad
HTTP request (wrong method, wrong content type, oversized or invalid body), is
an RPC frame with a status from `RPC_HTTP_STATUS` (404 unknown procedure, 422
validation, 401, 403, 429, 504 timeout, 500 internal, and so on). The status is
advisory; `error.code` is authoritative. An `auth` hook that throws an
`RPCAuthenticationError` refuses the call. Any other error it throws is
answered as an internal error. The call runs under `request.signal`, so a
client that disconnects cancels the procedure (`context.signal` aborts); the
memory transport passes the caller's signal to the server the same way.

The server refuses (`RPC_INVALID_REQUEST`) a frame whose `payload` or
`metadata` holds a `__proto__`, `constructor` or `prototype` key at any
depth: `JSON.parse` keeps such a key as an own property, and a handler that
merges its input into another object would have that object's prototype
replaced. `limits: { allowUnsafeKeys: true }` turns the check off, and
`findUnsafeKey(value)` runs it on anything else you decode.

The client transport aborts the underlying `fetch` when the call's signal or
deadline fires. It reports a network failure, or a reply that is not an RPC
frame for this request (a proxy's HTML page, a truncated or oversized body), as
an `RPCTransportError`. An expired deadline is an `RPCTimeoutError`, and a caller
abort is an `RPCCancelledError`. Use the same serializer on both ends:
`createRPCJsonSerializer({ preserveTypes: true })` carries `Date`, `BigInt`,
`Map` and `Set`.

A failed call rejects with a typed error rebuilt from the wire code
(`rpcErrorFromWire`): `RPCProcedureNotFoundError`, `RPCValidationError` (with
`issues`), `RPCInvalidRequestError`, `RPCAuthenticationError`,
`RPCForbiddenError`, `RPCRateLimitedError`, `RPCTimeoutError`,
`RPCCancelledError` or `RPCUnavailableError`, or else an `RPCError`. The
server's `details` are kept on the error as `error.details`.

`error.code` is always the wire code — `"RPC_TIMEOUT"`, `"RPC_CANCELLED"`,
`"RPC_UNAVAILABLE"`, `"RPC_VALIDATION_ERROR"`, `"RPC_NOT_FOUND"` … — whether
the server reported the failure or the client raised it itself (its own
deadline, a cancelled signal, a closed client, `"RPC_TRANSPORT_ERROR"` for a
network failure). Branch on `instanceof` or on those strings; the class
codes (`ErrorCode.RPC_TIMEOUT`, `"ERR_RPC_TIMEOUT"`) are not what a client
error carries.

A pending call's deadline and a `retry()` backoff hold a normal (ref'd)
timer, cleared as soon as the call settles, so a plain script awaiting a call
stays alive until it resolves or times out.

### Middleware and trusted identity

Everything in a frame, `metadata` included, is written by the caller: any
client can send `metadata: { userId: "admin" }`. Never authorise on it.
Identity your transport has verified (a checked bearer token, an mTLS peer,
a server-side session) goes in the second argument of `handle`, and reaches
middleware and handlers as the frozen `context.auth`:

```typescript
import { RPCMiddlewareStack, RPCAuthenticationError } from "@zudojs/rpc";

const stack = new RPCMiddlewareStack([
  async (context, next) => {
    if (typeof context.auth?.userId !== "string") {
      throw new RPCAuthenticationError("Sign in first.");
    }
    context.set("actor", context.auth.userId);
    return next();
  },
]);

const server = new RPCServer(undefined, stack);

// In the transport, after verifying the caller's credentials yourself:
await server.handle(frame, { auth: { userId: verifiedUserId } });
```

Each middleware may call `next()` once. Input validation runs before the
stack. `context.input` holds the payload as the procedure's schema parsed
it (unknown keys stripped, defaults applied, values coerced), so authorise
on `context.input`, not on `context.request.payload`, which stays the raw
frame value.

## Errors

Every error class from `@zudojs/errors`' RPC family is re-exported. The
server maps them to wire codes (`RPC_PROCEDURE_NOT_FOUND`,
`RPC_VALIDATION_ERROR`, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`,
`RPC_RATE_LIMITED`, `RPC_TIMEOUT`, …). A custom `RPCError` subclass keeps its
own `code` only when it is built with `expose: true` (see below).

`mapRPCError(error)` is the mapping the server and the fetch handler share. Use it in a custom transport to produce the same wire payloads.

What reaches the caller follows the error's `expose` flag. A
`@zudojs/errors` error built with `expose: true` keeps its message and maps
to the matching code by status: `NotFoundError` → `RPC_NOT_FOUND`,
`ConflictError` → `RPC_CONFLICT`, `ValidationError` → `RPC_VALIDATION_ERROR`
(with its issues, minus the received values, as `details`),
`AuthenticationError` → `RPC_UNAUTHENTICATED`, `AuthorizationError` →
`RPC_FORBIDDEN`, `RateLimitError` → `RPC_RATE_LIMITED` (with
`{ retryAfter }`); an unlisted status keeps the error's own code. Anything
thrown with `expose: false` — an `RPCInternalError`, an
`RPCSerializationError`, a plain `new RPCError(...)` (whose default is
`expose: false`), a non-exposed `BaseError`, or any other error — is
answered with the fixed `INTERNAL_ERROR_MESSAGE`; the
original error is handed to `onInternalError(error, requestId)` so it can be
logged against the request id.

A non-exposed error's code is withheld as well: `new RPCError("…", { code:
"TASK_SECRET" })` goes out as `{ code: "RPC_INTERNAL_ERROR", message:
INTERNAL_ERROR_MESSAGE }`, because a custom code is server detail just as the
message is. The one exception is a standard wire code — a key of
`RPC_HTTP_STATUS`, such as `RPC_UNAVAILABLE` or `RPC_TIMEOUT` — which is
public vocabulary a client acts on (retries, status), so it travels with the
generic message. To send a custom code, build the error with `expose: true`. A handler result that fails the procedure's
`output` schema is treated the same way: it is the server's fault, not the
caller's.

```typescript
const server = new RPCServer(undefined, undefined, {
  limits: { maxPayloadBytes: 256 * 1024, maxRequestIdLength: 128 },
  dispatch: { defaultTimeout: 10_000 },
  onInternalError: (error, requestId) => logger.error({ requestId, error }),
});
```

`maxPayloadBytes` bounds `payload` and `metadata` together, because both are
caller-controlled and both reach the handler. `maxRequestIdLength` bounds
`request.id`, which every response echoes back; an id over the limit is
refused before a response is built, so it is never reflected. Both default to
`MAX_RPC_PAYLOAD_SIZE` (1 MiB) and `MAX_RPC_REQUEST_ID_LENGTH` (128), and
either can be set to `0` when the transport already enforces the limit.

## License

MIT
