---
title: "@zudojs/middleware — Composable Middleware Pipeline Documentation"
description: "@zudojs/middleware docs: composable middleware pipelines with composition, timing, error handling and built-in middleware for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-middleware
---

v1.1.0

# @zudojs/middleware

Composable middleware pipeline for the Zudojs framework. Provides middleware composition, chaining, priority ordering, execution tracking with timing, error handling, context propagation, built-in middleware for logging, errors, timeouts, and rate limiting, and the guard-response contract that lets a middleware refuse a request with a real status code.

MIDDLEWARE PIPELINE COMPOSITION TIMING

## INSTALLATION

```ts
// npm
npm install @zudojs/middleware

// pnpm
pnpm add @zudojs/middleware

// yarn
yarn add @zudojs/middleware
```

> **Peer Dependencies:** @zudojs/middleware depends on @zudojs/errors (at 1.3.0). Uses the `BaseError` class for structured error handling in pipeline execution.

## WHAT IT DOES

`@zudojs/middleware` is the foundation of cross-cutting concern handling across the Zudojs framework. It provides:

- A **composable middleware pipeline** where middleware functions chain via `next()`
- **Type-safe middleware functions** generic over context and result types
- **Named middleware with priority** — filter and sort by name, enabled flag, and numeric priority
- **Middleware composition** via the `compose()` function combining middleware and a handler
- **Execution tracking with timing** — pipeline reports which middleware ran and total duration
- **Error handling** — structured error classes for timeouts and next() misuse
- **Context propagation** — context object flows through every middleware in the chain
- **Built-in middleware** for logging, error handling, timeout enforcement, and rate limiting
- **Pipeline options** — configurable max middleware count and stop-on-error behavior
- **Guard responses** — `createGuardResponse()` lets a middleware refuse a request with a real `401`/`403` that an HTTP adapter sends as-is

> **Core Principle:** Middleware wraps the request/response cycle with cross-cutting concerns. Each middleware calls `next()` to delegate to the next middleware or the final handler. This pattern is used by @zudojs/messaging, @zudojs/events, @zudojs/http, and other packages.

## WHERE IT SITS

APPLICATION LAYER (CQRS, Events, Modules, HTTP Handlers)

MESSAGING LAYER (@zudojs/messaging, @zudojs/events)

@zudojs/middleware (PIPELINE & COMPOSITION)

@zudojs/errors (FOUNDATION LEAF PACKAGE)

@zudojs/middleware sits below the messaging and event layers. It provides the generic pipeline infrastructure that higher-level packages use for their own middleware chains. It depends only on @zudojs/errors.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | 1.3.0 | All middleware error classes (MiddlewareError, MiddlewareTimeoutError, MiddlewareNextCalledMultipleTimesError, MiddlewareLimitExceededError, MiddlewareDepthExceededError, MiddlewareRateLimitError, MiddlewareAbortedError) are the @zudojs/errors classes, re-exported |

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

## CORE TYPES

### Type: Middleware

A middleware function that processes a context and calls the next middleware in the chain. Generic over context and result types.

```ts
type Middleware<TContext, TResult = void> = (
  context: TContext,
  next: () => Promise<TResult>,
) => Promise<TResult>;
```

### Interface: NamedMiddleware

A middleware function with metadata — name, priority, and enabled flag for filtering and ordering.

```ts
interface NamedMiddleware<TContext, TResult = void> {
  readonly name: string;
  readonly handler: Middleware<TContext, TResult>;
  readonly priority?: number;   // default: 100 (lower = earlier)
  readonly enabled?: boolean;   // default: true
}
```

### Type: MiddlewareFactory

A factory function that creates named middleware from optional configuration.

```ts
type MiddlewareFactory<TContext, TResult = void> = (
  options?: Record<string, unknown>,
) => NamedMiddleware<TContext, TResult>;
```

## MIDDLEWARE COMPOSITION

The composition module provides functions to combine, filter, sort, and wrap middleware functions.

### Function: compose

Combines a list of middleware and a final handler into a single executable function. Middleware executes in order — first added, first executed.

```ts
function compose<TContext, TResult>(
  middlewareList: readonly Middleware<TContext, TResult>[],
  handler: (context: TContext) => Promise<TResult>,
): (context: TContext) => Promise<TResult>
```

```ts
import { compose } from "@zudojs/middleware";

const handler = async (ctx) => ({ status: "ok" });

const pipeline = compose([loggingMw, authMw], handler);

const result = await pipeline(requestContext);
```

### Function: resolveMiddleware

Filters out disabled middleware, sorts by priority (lower = earlier), and extracts handler functions.

```ts
function resolveMiddleware<TContext, TResult>(
  middlewareList: readonly NamedMiddleware<TContext, TResult>[],
): Middleware<TContext, TResult>[]
```

```ts
import { resolveMiddleware } from "@zudojs/middleware";

const middleware = [
  { name: "auth", handler: authHandler, priority: 10 },
  { name: "logging", handler: logHandler, priority: 50 },
  { name: "debug", handler: debugHandler, enabled: false },
];

const resolved = resolveMiddleware(middleware);
// [authHandler, logHandler] — debug excluded, auth before logging
```

### Function: withTiming

Wraps a middleware with timing metadata. Logs a warning if execution exceeds 100ms.

```ts
function withTiming<TContext>(
  name: string,
  middleware: Middleware<TContext, void>,
): NamedMiddleware<TContext, void>
```

```ts
import { withTiming } from "@zudojs/middleware";

const timedAuth = withTiming("auth", async (ctx, next) => {
  // verify token...
  return next();
});
```

### Constant: MAX_DEPTH

Internal safety limit of `100` to prevent infinite recursion from misused `next()` calls.

## PIPELINE

The pipeline module creates execution-tracked middleware chains with structured results.

### Interface: PipelineResult

```ts
// Discriminated on `success`: narrowing gives a non-optional `result`.
type PipelineResult<TResult> =
  | PipelineSuccess<TResult>
  | PipelineFailure;

interface PipelineSuccess<TResult> {
  readonly success: true;
  readonly result: TResult;
  readonly durationMs: number;
  readonly executedMiddleware: readonly string[];
  readonly errors: readonly PipelineMiddlewareFailure[];
}

interface PipelineFailure {
  readonly success: false;
  readonly error: unknown;
  readonly durationMs: number;
  readonly executedMiddleware: readonly string[];
  readonly errors: readonly PipelineMiddlewareFailure[];
}
```

### Interface: PipelineOptions

```ts
interface PipelineOptions {
  readonly maxMiddleware?: number;   // default: 50
  readonly errorMode?: PipelineErrorMode;  // "capture" | "throw" | "continue"
  readonly signal?: AbortSignal;         // aborts between steps
  readonly stopOnError?: boolean;        // deprecated alias for errorMode
}
```

### Function: createPipeline

Creates a pipeline that resolves named middleware, tracks execution, and returns a structured result.

```ts
function createPipeline<TContext, TResult>(
  middlewareList: readonly NamedMiddleware<TContext, TResult>[],
  handler: (context: TContext) => Promise<TResult>,
  options?: PipelineOptions,
): (context: TContext) => Promise<PipelineResult<TResult>>
```

```ts
import { createPipeline } from "@zudojs/middleware";

const pipeline = createPipeline(
  [authMiddleware, loggingMiddleware],
  async (ctx) => ({ status: "ok" }),
  { maxMiddleware: 20, errorMode: "capture" },
);

const result = await pipeline({ method: "GET", path: "/api/users" });

result.success;          // true
result.result;           // { status: "ok" }
result.durationMs;       // 12.5
result.executedMiddleware; // ["auth", "logging"]
```

> **Default Limits:** The pipeline defaults to a maximum of 50 middleware; exceeding it throws `MiddlewareLimitExceededError` at construction, and `compose()` caps chain depth at `MAX_DEPTH` (100). `errorMode` chooses what a failure does: `"capture"` (default) reports it on the result, `"throw"` propagates it, `"continue"` records it and carries on.

## BUILT-IN MIDDLEWARE

Ready-made middleware for common concerns. Each returns a `NamedMiddleware` with a descriptive name.

### Interface: LoggingContext

```ts
interface LoggingContext {
  readonly requestId?: string;
  readonly path?: string;
  readonly method?: string;
}
```

### loggingMiddleware

Logs request start, completion time, and errors. Accepts an optional logger function (for example `(line) => log.info(line)`); without one it writes nothing.

```ts
import { loggingMiddleware } from "@zudojs/middleware";

const mw = loggingMiddleware((line) => console.info(line)); // no sink = no output

// Or provide a custom logger
const mw2 = loggingMiddleware((msg) => logger.info(msg));
```

### errorMiddleware

Catches errors and invokes an optional callback. Runs at priority 0 (first in chain).

```ts
import { errorMiddleware } from "@zudojs/middleware";

const mw = errorMiddleware((error, ctx) => {
  logger.error("Pipeline failed:", error);
});

// mw.name === "error-handler"
// mw.priority === 0 (runs first)
```

### timeoutMiddleware

Rejects if the pipeline exceeds the specified timeout. Uses `Promise.race` internally.

```ts
import { timeoutMiddleware } from "@zudojs/middleware";

const mw = timeoutMiddleware(5000); // 5 second timeout

// Rejects with MiddlewareTimeoutError: 'Middleware "timeout" timed out after 5000ms.'
```

### rateLimitMiddleware

Sliding window rate limiter per key. Requires context to have an optional `key` property.

```ts
import { rateLimitMiddleware } from "@zudojs/middleware";

const mw = rateLimitMiddleware(100, 60_000); // 100 requests per minute

// Context needs a key property
type Ctx = { readonly key?: string; /* ... */ };
```

## GUARD RESPONSES

A *guard* is a middleware that decides whether a request may continue: is the caller logged in, allowed to do this, asking for the right tenant? When the answer is no, the guard stops the chain by answering the request itself, usually with `401 Unauthorized` or `403 Forbidden`. To do that it has to say *which* status, headers and body to send, and that is what a guard response is.

### Why it exists

Many guards live in packages that sit below `@zudojs/http`: `@zudojs/permissions`' `authorize()` and `@zudojs/tenancy`'s middleware, for example. They are not allowed to depend on the HTTP package, so they cannot build an `HttpResponseContext`. Before v1.1.0 they returned a plain `{ status, body, headers }` object instead, and `@zudojs/http` ignored it: the handler never ran, but the client, caches and monitoring all saw `200 OK`. A refusal that looks like a success is a security and debugging problem.

The fix is a small contract that both sides share. `@zudojs/middleware` sits below everyone, so a guard in any package can create a guard response here, and `@zudojs/http` (its router, `HttpMiddlewarePipeline` and `RouteDispatcher`) turns it into a real response with that status, those headers and that body.

### Function: createGuardResponse

```ts
function createGuardResponse(init: {
  readonly status: number;                               // integer 100-599
  readonly body?: unknown;                               // omit for an empty body
  readonly headers?: Readonly<Record<string, string>>;
}): GuardResponse

interface GuardResponse {
  readonly [GUARD_RESPONSE]: true;
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>; // lower-case names
}
```

- A structured body (an object or array) gets `content-type: application/json; charset=utf-8` unless you set one. A string or `Uint8Array` body is sent as it is.
- Header names are lower-cased, and every value must be a string (`TypeError` otherwise).
- A status that is not an integer from 100 to 599 throws `RangeError`.
- The result is frozen, so nothing downstream can change it.

### Function: isGuardResponse and the GUARD_RESPONSE brand

Every guard response carries a *brand*: the property `GUARD_RESPONSE`, which is the registered symbol `Symbol.for("zudojs.middleware.guardResponse")`. `isGuardResponse(value)` checks for it, and only the brand counts. JSON cannot carry a symbol, so a request body or a handler's data that happens to have a `status` key can never be mistaken for a response. Because the symbol is registered, two copies of this package in one app still agree on it.

```ts
import { createGuardResponse, isGuardResponse } from "@zudojs/middleware";

const refusal = createGuardResponse({ status: 403, body: { error: "Forbidden" } });

console.log(refusal.status, refusal.body, refusal.headers);
// 403 { error: 'Forbidden' } { 'content-type': 'application/json; charset=utf-8' }

console.log(isGuardResponse(refusal));                                // true
console.log(isGuardResponse({ status: 403, body: {}, headers: {} }));  // false: no brand
console.log(isGuardResponse(JSON.parse(JSON.stringify(refusal)))); // false: JSON drops the symbol

try {
  createGuardResponse({ status: 700 });
} catch (error) {
  console.log(String(error));
  // RangeError: Guard response status must be an integer in 100-599, got 700.
}
```

### Using it with @zudojs/http

This guard refuses requests that have no API key. It returns the guard response *instead of* calling `next()`, so the handler never runs. With `@zudojs/http` installed too, you can run it as it is:

```ts
import { createGuardResponse } from "@zudojs/middleware";
import { createRouter, createRequestContext } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

const requireApiKey: HttpMiddleware = async (ctx, next) => {
  if (!ctx.request.getHeader("x-api-key")) {
    return createGuardResponse({
      status: 401,
      body: { error: "Unauthorized" },
      headers: { "WWW-Authenticate": "ApiKey" },
    });
  }
  return next();
};

const router = createRouter();
router.get("/reports", () => ({ reports: 3 }), { middleware: [requireApiKey] });

const attempts: Record<string, string>[] = [{}, { "x-api-key": "k-123" }];

for (const headers of attempts) {
  const { response } = await router.dispatch(
    createRequestContext({ method: "GET", url: "/reports", headers }),
  );
  console.log(response.status, response.headers, response.body);
}
// 401 {
//   'content-type': 'application/json; charset=utf-8',
//   'www-authenticate': 'ApiKey'
// } {"error":"Unauthorized"}
// 200 { 'content-type': 'application/json' } {"reports":3}
```

> **Common mistake:** returning a plain object such as `{ status: 401, body: { error: "Unauthorized" } }` from a guard. It has no brand, so it is treated as ordinary data and is not sent as a `401`. Always build refusals with `createGuardResponse()`. The ready-made guards in `@zudojs/permissions` and `@zudojs/tenancy` already do.

## ERROR HIERARCHY

All error types are defined in `@zudojs/errors` and re-exported by this package.

| Error | When Thrown |
| --- | --- |
| MiddlewareError | Base error for all middleware pipeline failures |
| MiddlewareTimeoutError | A middleware exceeded its timeout duration |
| MiddlewareNextCalledMultipleTimesError | A middleware called next() more than once |

### Error Classes

```ts
import {
  MiddlewareError,
  MiddlewareTimeoutError,
  MiddlewareNextCalledMultipleTimesError,
} from "@zudojs/middleware";

// Base middleware error
const err = new MiddlewareError("Pipeline failed", {
  middlewareName: "auth",
  cause: originalError,
});

// Timeout error
const timeout = new MiddlewareTimeoutError("auth", 5000);

// next() called multiple times
const misuse = new MiddlewareNextCalledMultipleTimesError("auth");
```

### Error Handling Pattern

```ts
import { createPipeline } from "@zudojs/middleware";

const pipeline = createPipeline(
  [authMiddleware, loggingMiddleware],
  handler,
  { errorMode: "capture" },
);

const result = await pipeline(ctx);

if (!result.success) {
  if (result.error instanceof MiddlewareTimeoutError) {
    console.error("Pipeline timed out");
  } else {
    console.error("Pipeline failed:", result.error);
  }
}
```

## FULL INTEGRATION EXAMPLE

Complete working example: custom middleware, pipeline, logging, error handling, and rate limiting.

```ts
import {
  createPipeline,
  loggingMiddleware,
  errorMiddleware,
  timeoutMiddleware,
  rateLimitMiddleware,
  withTiming,
  MiddlewareTimeoutError,
} from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";

// 1. Define a custom authentication middleware
type RequestContext = {
  readonly method: string;
  readonly path: string;
  readonly key?: string;
  readonly token?: string;
};

type HandlerResult = { status: string; path: string; timestamp: number };

const authMiddleware = withTiming<RequestContext, HandlerResult>("auth", async (ctx, next) => {
  if (!ctx.token) {
    throw new Error("Unauthorized: missing token");
  }
  // verify token...
  console.log("[auth] Token verified");
  return next();
});

// 2. Build the middleware stack
const middleware: readonly NamedMiddleware<RequestContext, HandlerResult>[] = [
  errorMiddleware<HandlerResult>((error) => {
    console.error("[error]", error);
  }),
  loggingMiddleware<HandlerResult>(),
  timeoutMiddleware<RequestContext, HandlerResult>(10_000),
  rateLimitMiddleware<RequestContext, HandlerResult>(100, 60_000),
  authMiddleware,
];

// 3. Create the pipeline with a handler
const handler = async (ctx: RequestContext): Promise<HandlerResult> => {
  return {
    status: "ok",
    path: ctx.path,
    timestamp: Date.now(),
  };
};

const pipeline = createPipeline(middleware, handler, {
  maxMiddleware: 20,
  errorMode: "capture",
});

// 4. Execute the pipeline
const result = await pipeline({
  method: "GET",
  path: "/api/users",
  token: "bearer_abc123",
  key: "user-123",
});

// 5. Handle the result
if (result.success) {
  console.log("Response:", result.result);
  console.log("Duration:", result.durationMs, "ms");
  console.log("Middleware executed:", result.executedMiddleware);
  // ["error-handler", "logging", "timeout", "rate-limit", "auth"]
} else {
  if (result.error instanceof MiddlewareTimeoutError) {
    console.error("Request timed out");
  } else {
    console.error("Request failed:", result.error);
  }
}
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/middleware` exports from its package root at v1.1.3 — **40** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 40 exports**

Classes (7)

`MiddlewareAbortedError` `MiddlewareDepthExceededError` `MiddlewareError` `MiddlewareLimitExceededError` `MiddlewareNextCalledMultipleTimesError` `MiddlewareRateLimitError` `MiddlewareTimeoutError`

Functions (12)

`compose` `createGuardResponse` `createPipeline` `errorMiddleware` `isGuardResponse` `loggingMiddleware` `rateLimitMiddleware` `resolveMiddleware` `resolveNamedMiddleware` `sanitizeLogValue` `timeoutMiddleware` `withTiming`

Interfaces (15)

`ComposeOptions` `GuardResponse` `GuardResponseInit` `LoggingContext` `LoggingOptions` `NamedMiddleware` `PipelineFailure` `PipelineMiddlewareFailure` `PipelineOptions` `PipelineSuccess` `RateLimitMiddleware` `RateLimitOptions` `RateLimitState` `TimeoutOptions` `TimingOptions`

Type aliases (4)

`Middleware` `MiddlewareFactory` `PipelineErrorMode` `PipelineResult`

Constants (2)

`GUARD_RESPONSE` `MAX_DEPTH`
