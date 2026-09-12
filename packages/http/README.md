# @zudojs/http

HTTP primitives, request handling, routing, middleware, and server infrastructure for Zudojs applications.

## Installation

```bash
npm install @zudojs/http
```

## Quick Start

```typescript
import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
} from "@zudojs/http";

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: async (request) => {
    return createResponseContext().text(`Hello from Zudojs (${request.path})`);
  },
});

await server.start();
```

A handler receives an `HttpRequestContext` and may return an
`HttpResponseContext`, a plain `{ status, headers, body }` object, or any JSON
value (which is sent as `application/json`). Throwing an `HttpError` created by
`notFound()`, `unauthorized()` and friends answers with that error's status.

## Features

- Runtime-independent HTTP server abstraction
- Request/response wrappers with full Web API compatibility
- Middleware pipeline with error handling
- Router with parameter extraction
- CORS, security headers, and content negotiation
- HTTP client with interceptors

## Use Cases

- Building REST APIs
- Implementing middleware pipelines
- Handling HTTP requests in serverless environments
- Proxy and gateway implementations
