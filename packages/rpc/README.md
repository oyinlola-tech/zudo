# @zudojs/rpc

Type-safe RPC — define procedures, apply middleware, dispatch calls, and serve them over your own transport.

## When to use

Import this when you need:

- a typed RPC layer between services (gateway ↔ microservice, frontend ↔ backend)
- procedure-level middleware (auth, tracing, rate limit)
- a server that validates frames and maps every failure to a wire code
- structured RPC errors

The package is transport-agnostic: `RPCServer.handle` takes a request frame
and returns a response frame, and `RPCClient` sends through any object
implementing `RPCTransport`. It ships no HTTP or WebSocket transport of its
own.

For request/response inside one process, prefer `@zudojs/api`.

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
  createRPCRequest({ id: "req-1", procedure: "math.sum", payload: { a: 1, b: 2 } }),
);
// { id: "req-1", success: true, result: 3 }
```

`handle` never throws for a bad request: a malformed frame, an unknown
procedure, a payload the input schema rejects, a timeout or a handler error
each come back as `{ success: false, error: { code, message, details? } }`.
The frame's `metadata` is optional.

### Calling through a transport

`RPCClient` needs an `RPCTransport` — an object whose `send(request, options)`
delivers the frame and resolves with the response. `options.signal` aborts the
call and `options.timeout` is the deadline in milliseconds, so a transport can
set its own socket timeout. The in-process transport below is the smallest
possible one:

```typescript
import { RPCClient, type RPCTransport } from "@zudojs/rpc";

const transport: RPCTransport = { send: (request) => server.handle(request) };
const client = new RPCClient(transport, { timeout: 5_000 });

const total = await client.call<{ a: number; b: number }, number>("math.sum", { a: 1, b: 2 });
// 3
```

A failed call rejects with a typed error rebuilt from the wire code
(`RPCTimeoutError`, `RPCCancelledError`, `RPCUnavailableError`, or an
`RPCError` carrying the server's `code` and `details`).

### Middleware

```typescript
import { RPCMiddlewareStack, RPCAuthenticationError } from "@zudojs/rpc";

const stack = new RPCMiddlewareStack([
  async (context, next) => {
    if (context.metadata.userId === undefined) {
      throw new RPCAuthenticationError("Sign in first.");
    }
    return next();
  },
]);

const server = new RPCServer(undefined, stack);
```

Each middleware may call `next()` once. Input validation runs before the
stack, so middleware sees a payload the procedure's schema has accepted.

## Errors

Every error class from `@zudojs/errors`' RPC family is re-exported. The
server maps them to wire codes (`RPC_PROCEDURE_NOT_FOUND`,
`RPC_VALIDATION_ERROR`, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`,
`RPC_RATE_LIMITED`, `RPC_TIMEOUT`, …). A custom `RPCError` subclass keeps its
own `code`.

What reaches the caller follows the error's `expose` flag. Anything thrown
with `expose: false` — an `RPCInternalError`, an `RPCSerializationError`, a
plain `new RPCError(...)` (whose default is `expose: false`), or any
non-RPC error — is answered with the fixed `INTERNAL_ERROR_MESSAGE`; the
original error is handed to `onInternalError(error, requestId)` so it can be
logged against the request id. A handler result that fails the procedure's
`output` schema is treated the same way: it is the server's fault, not the
caller's.

```typescript
const server = new RPCServer(undefined, undefined, {
  limits: { maxPayloadBytes: 256 * 1024 },
  dispatch: { defaultTimeout: 10_000 },
  onInternalError: (error, requestId) => logger.error({ requestId, error }),
});
```

## License

MIT
