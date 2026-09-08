# @zudojs/middleware

Composable middleware pipeline with composition, priority ordering, execution tracking, error handling, and built-in middleware.

## Installation

```bash
npm install @zudojs/middleware
```

## Quick Start

```typescript
import {
  createPipeline,
  timeoutMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
} from "@zudojs/middleware";

interface RequestContext {
  readonly method?: string;
  readonly path?: string;
  readonly key?: string;
}

// The handler runs after every middleware has called next().
const pipeline = createPipeline<RequestContext, string>(
  [
    timeoutMiddleware(5_000),
    loggingMiddleware(),
    rateLimitMiddleware(100, 60_000),
  ],
  async (context) => `handled ${context.method} ${context.path}`,
);

const outcome = await pipeline({
  method: "GET",
  path: "/users",
  key: "client-1",
});

if (outcome.success) {
  console.log(outcome.result); // "handled GET /users"
} else {
  console.error(outcome.error);
}
```

`PipelineResult` is a discriminated union: narrowing on `success` gives you a
non-optional `result`, so no `!` is needed on the happy path.

## Composition without the result wrapper

`compose` chains middleware around a handler and returns the handler's value
directly. Use it when you want the raw function rather than a
`PipelineResult`.

```typescript
import { compose } from "@zudojs/middleware";
import type { Middleware } from "@zudojs/middleware";

const auth: Middleware<RequestContext, string> = async (context, next) => {
  if (context.key === undefined) throw new Error("unauthenticated");
  return next();
};

const handle = compose([auth], async (context) => `hello ${context.key}`);
await handle({ key: "client-1" });
```

## Priority and toggling

`NamedMiddleware` carries a name, a numeric `priority` (lower runs earlier,
default 100) and an `enabled` flag. `createPipeline` filters and orders them
for you, and reports which ones ran.

```typescript
const pipeline = createPipeline(
  [
    { name: "auth", handler: auth, priority: 10 },
    { name: "audit", handler: audit, priority: 90, enabled: false },
  ],
  handler,
);

const outcome = await pipeline(context);
outcome.executedMiddleware; // ["auth"] — "audit" is disabled
```

Ordering is stable, so middleware sharing a priority keeps its declared order.

## Error handling

`errorMode` decides what a failure does:

| Mode                  | Behaviour                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `"capture"` (default) | Stop and return `{ success: false, error }`.                                                          |
| `"throw"`             | Stop and let the error propagate to the caller.                                                       |
| `"continue"`          | Record the failure, skip past the failing middleware, keep going. A handler failure is never skipped. |

Every failure is also collected in `outcome.errors`, each tagged with the name
of the middleware that threw (or `"handler"`).

```typescript
const pipeline = createPipeline(list, handler, { errorMode: "continue" });
const outcome = await pipeline(context);
outcome.errors; // [{ name: "audit", error: … }]
```

## Cancellation

Pass an `AbortSignal` to stop a pipeline between steps. The signal is checked
before each middleware and before the handler; an aborted run fails with a
`MiddlewareAbortedError`.

```typescript
const controller = new AbortController();
const pipeline = createPipeline(list, handler, { signal: controller.signal });
```

## Built-in middleware

- **`loggingMiddleware(logger?, options?)`** — logs start and completion.
  Every interpolated field is escaped, so a path containing newlines cannot
  forge log lines. Error messages are omitted unless you opt in with
  `includeErrorMessage`.
- **`errorMiddleware(onError?, onReporterError?)`** — reports errors and
  rethrows them. A reporter that throws cannot replace the original error.
- **`timeoutMiddleware(timeoutMs, options?)`** — fails with
  `MiddlewareTimeoutError`. The timer is always cleared, so a fast request
  leaves nothing pending on the event loop.
- **`rateLimitMiddleware(maxRequests, windowMs, options?)`** — a true sliding
  window keyed on `context.key`, with key eviction and a configurable cap.
  Rejections throw `MiddlewareRateLimitError`, which carries `retryAfterMs`
  for a `Retry-After` header.

```typescript
import { MiddlewareRateLimitError } from "@zudojs/middleware";

if (outcome.error instanceof MiddlewareRateLimitError) {
  respond(429, { retryAfterMs: outcome.error.retryAfterMs });
}
```

Rate-limit state is per-instance and in-process: behind more than one replica,
each process enforces its own limit.

## Timing

`withTiming` wraps any middleware and reports slow executions. It is
transparent — the return value and any error pass through unchanged.

```typescript
const timed = withTiming("db-lookup", lookup, {
  thresholdMs: 50,
  logger: (message) => logger.warn(message),
});
```

## Errors

All errors extend `MiddlewareError` (itself a `BaseError` from
`@zudojs/errors`), so a single `instanceof` catches everything from this
package:

`MiddlewareTimeoutError` · `MiddlewareNextCalledMultipleTimesError` ·
`MiddlewareLimitExceededError` · `MiddlewareDepthExceededError` ·
`MiddlewareRateLimitError` · `MiddlewareAbortedError`

## Use Cases

- HTTP middleware chains
- Event processing pipelines
- Command/query middleware
- Cross-cutting concerns
