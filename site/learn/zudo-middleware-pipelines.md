---
title: "Middleware pipelines with @zudojs/middleware — ZudoJS Academy"
description: "Build one pipeline for HTTP, CLI and jobs with @zudojs/middleware: logging, auth checks, validation, rate limits, timeouts, error modes and execution tracking."
source: https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines
---

LEVEL 12 · LESSON 15 OF 19

HTTP Core

# Middleware pipelines with @zudojs/middleware

Build one pipeline for HTTP, CLI and jobs with @zudojs/middleware: logging, auth checks, validation, rate limits, timeouts, error modes and execution tracking.

- **55 min** to read and try
- **You need:** "Middleware, CORS, security headers and graceful shutdown"
- **You build:** A money-transfer pipeline (logging, authentication, authorization, validation, rate limit, handler), and a POST /tasks/import route for the Task API that runs the same kind of pipeline

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Compose named middleware into a pipeline and read its result: success, executed middleware, duration and recorded errors
- Order middleware with priorities and justify an order such as logging, authentication, authorization, validation, rate limit, handler
- Design a typed context that earlier middleware fills in for later middleware
- Choose an error mode, and add timeouts, safe logging and a per-user rate limit
- Connect a transport-independent pipeline to HTTP with guard responses and explicit status mapping

## The problem: the same checks in three places

A payments team runs transfers from three entry points: the HTTP API, an admin command-line tool, and a nightly batch job. Every transfer must pass the same checks: who is calling, are they allowed to move money, is the request well formed, are they sending too many. Written by hand, each entry point gets its own copy:

copies.tsNode.js only

```ts
const users = new Map([
  ["tok-ada", { name: "Ada", role: "teller" }],
  ["tok-bayo", { name: "Bayo", role: "viewer" }],
]);

function transferFromHttp(token: string, amountKobo: number): string {
  const user = users.get(token);
  if (!user) return "401 unknown token";
  if (user.role !== "teller") return "403 tellers only";
  if (!Number.isInteger(amountKobo) || amountKobo < 100) return "400 bad amount";
  return `200 ${user.name} moved ₦${amountKobo / 100}`;
}

function transferFromCli(token: string, amountKobo: number): string {
  const user = users.get(token);
  if (!user) return "unknown token";
  if (amountKobo < 100) return "bad amount";
  return `${user.name} moved ₦${amountKobo / 100}`;
}

console.log("http:", transferFromHttp("tok-bayo", 4_500_000));
console.log("cli: ", transferFromCli("tok-bayo", 4_500_000));
console.log("cli: ", transferFromCli("tok-ada", 12.5));
```

Output of `npx tsx copies.ts`

```ts
http: 403 tellers only
cli:  Bayo moved ₦45000
cli:  bad amount
```

The CLI copy forgot the role check, so a viewer moved ₦45,000, and it forgot that an amount in kobo must be a whole number. Nobody wrote a bad line; they just did not write one line twice. Rate limiting, logging and timeouts would be three more things to copy.

The fix is to write each check **once**, as a **middleware**, and run every entry point through the same **pipeline**. You met middleware for HTTP in [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware), with `HttpMiddlewarePipeline`. `@zudojs/middleware` is the general version: its context can be any type, so the same pipeline serves an HTTP route, a CLI tool and a queue job. It also tracks what ran, and ships middleware for logging, errors, timeouts and rate limits.

`@zudojs/http` depends on it, so it is already in `node_modules`, but only as a dependency of a dependency. Anything your own code imports should be listed in your `package.json`, so install it explicitly in the Task API:

Terminal on your computer

```bash
$ npm install @zudojs/middleware
```

## Middleware, context and compose

In `@zudojs/middleware` a middleware has this type:

types.ts

```ts
type Middleware<TContext, TResult = void> = (context: TContext, next: () => Promise<TResult>) => Promise<TResult>;
```

The **context** is the object that travels through the pipeline, and you choose its type. `next()` runs the rest of the pipeline and resolves to its result, the value the final **handler** returns. `compose` is the smallest tool: it chains a list of middleware in front of a handler and returns one function:

compose.tsNode.js only

```ts
import { compose } from "@zudojs/middleware";
import type { Middleware } from "@zudojs/middleware";

interface TransferContext {
  readonly amountKobo: number;
  readonly steps: string[];
}

const outer: Middleware<TransferContext, string> = async (context, next) => {
  context.steps.push("outer before");
  const result = await next();
  context.steps.push("outer after");
  return `${result} (checked)`;
};
const inner: Middleware<TransferContext, string> = async (context, next) => {
  context.steps.push("inner before");
  return next();
};

const transfer = compose([outer, inner], async (context) => {
  context.steps.push("handler");
  return `moved ₦${context.amountKobo / 100}`;
});

const context: TransferContext = { amountKobo: 4_500_000, steps: [] };
console.log(await transfer(context));
console.log(context.steps);
```

Output of `npx tsx compose.ts`

```ts
moved ₦45000 (checked)
[ 'outer before', 'inner before', 'handler', 'outer after' ]
```

The same onion as in HTTP: the first middleware starts first and finishes last, and it can change the result on the way out. Because the context type is yours, TypeScript checks every middleware against it, and nothing in it knows about HTTP.

## Pipelines and execution tracking

`createPipeline` is `compose` plus bookkeeping. It takes **named middleware**, objects with a `name` and a `handler`, and returns a function that never leaves you guessing what happened:

pipeline.tsNode.js only

```ts
import { createPipeline } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";

interface TransferContext {
  readonly token: string;
  readonly amountKobo: number;
}

const authenticate: NamedMiddleware<TransferContext, string> = {
  name: "authenticate",
  handler: async (context, next) => {
    if (context.token !== "tok-ada") throw new Error("Unknown token");
    return next();
  },
};

const transfer = createPipeline([authenticate], async (context) => `moved ₦${context.amountKobo / 100}`);

for (const token of ["tok-ada", "tok-eve"]) {
  const outcome = await transfer({ token, amountKobo: 4_500_000 });
  if (outcome.success) {
    console.log("ok:", outcome.result, outcome.executedMiddleware);
  } else {
    console.log("failed:", (outcome.error as Error).message, outcome.executedMiddleware);
  }
  console.log("  took a measured time:", outcome.durationMs >= 0, "| errors recorded:", outcome.errors.length);
}
```

Output of `npx tsx pipeline.ts`

```ts
ok: moved ₦45000 [ 'authenticate' ]
  took a measured time: true | errors recorded: 0
failed: Unknown token [ 'authenticate' ]
  took a measured time: true | errors recorded: 1
```

The outcome is a **discriminated union**: check `success` and TypeScript knows whether `result` or `error` is there. A thrown error did not escape; it was **captured** into the outcome. The tracking fields answer the questions you ask when something goes wrong in production:

- `executedMiddleware`: the names of the middleware that *started*, in order. The failed run stopped at `authenticate`.
- `durationMs`: how long the whole run took, for metrics.
- `errors`: every failure recorded during the run, with the name of the middleware that threw.

A pipeline also refuses to grow without bound: more than 50 enabled middleware (change it with `maxMiddleware`) is a `MiddlewareLimitExceededError` when the pipeline is created.

## Priority and enabled

A named middleware may carry a `priority`: lower numbers run earlier, the default is 100, and equal priorities keep the order of the list. `enabled: false` leaves a middleware out entirely. `resolveNamedMiddleware` shows you the final order without running anything:

priority.tsNode.js only

```ts
import { createPipeline, resolveNamedMiddleware } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";

type Steps = { steps: string[] };
function step(name: string, options: { priority?: number; enabled?: boolean } = {}): NamedMiddleware<Steps, string> {
  return {
    name,
    ...options,
    handler: async (context, next) => {
      context.steps.push(name);
      return next();
    },
  };
}

const list = [
  step("validate"),
  step("authorize", { priority: 20 }),
  step("audit (switched off)", { priority: 5, enabled: false }),
  step("authenticate", { priority: 20 }),
  step("log", { priority: 0 }),
];
console.log(resolveNamedMiddleware(list).map((m) => `${m.name}:${m.priority ?? "default"}`));

const run = createPipeline(list, async (context) => context.steps.join(" > "));
const outcome = await run({ steps: [] });
console.log(outcome.success && outcome.result);
```

Output of `npx tsx priority.ts`

```json
[ 'log:0', 'authorize:20', 'authenticate:20', 'validate:default' ]
log > authorize > authenticate > validate
```

Notice the trap in the middle: `authorize` and `authenticate` share priority 20, so their *list order* decides, and authorization now runs before the caller is known. Priorities are useful when middleware comes from different places (a plugin that must run first, say). When one file builds the whole pipeline, a plain list in the right order is clearer, and that is what this lesson does from here on.

> TIP
>
> `enabled` is a clean way to switch a middleware with configuration, for example an expensive audit step only in production, without rebuilding the list by hand.

## Designing the context

The context is the contract between the middleware. Early middleware *fills in* fields that later middleware and the handler rely on. For transfers, the context starts with what the transport knows and gains a user, a rate-limit key and a validated transfer on the way:

REASON IT OUT

### What goes into the context, and who may set it?

Before looking at the type, decide for each value: does it come from the transport (the caller controls it), or from a middleware (the server decided it)? Should the handler be allowed to read the raw request body? What should the rate limiter count by, and when is that known? What must never be in the context?

**Show the reasoning**

- **From the transport, untrusted**: a request id, the method and path (for logs), the token, the raw body. These are `readonly`: no middleware should rewrite what the caller sent.
- **Set by middleware, trusted**: `user` (only after the token was checked), `transfer` (only after validation), `key` for rate limiting. They are optional in the type, because they do not exist at the start.
- The handler should read `transfer`, never `body`. Reading the raw body in the handler would skip validation.
- The rate limiter should count per **user**, so the key is the user id, known only after authentication. That fixes part of the order.
- Never the secret itself for longer than needed, and never anything you would not want in a log line; loggers are often given the whole context.

The shared files for the rest of this lesson hold the context type, the fake users and accounts, and the handler:

bank.ts

```ts
export interface User {
  readonly id: string;
  readonly name: string;
  readonly role: "viewer" | "teller";
}

export interface Transfer {
  readonly from: string;
  readonly to: string;
  readonly amountKobo: number;
}

export interface TransferContext {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly token: string | undefined;
  readonly body: unknown;
  key?: string;
  user?: User;
  transfer?: Transfer;
}

export const users = new Map<string, User>([
  ["tok-ada", { id: "u-ada", name: "Ada", role: "teller" }],
  ["tok-bayo", { id: "u-bayo", name: "Bayo", role: "viewer" }],
]);

export const balances = new Map<string, number>([
  ["acc-1", 50_000_000],
  ["acc-2", 2_000_000],
]);

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

let counter = 0;
export function request(token: string | undefined, body: unknown): TransferContext {
  counter += 1;
  return { requestId: `req-${counter}`, method: "POST", path: "/transfers", token, body };
}

/** The handler: only runs with a validated transfer. */
export async function moveMoney(context: TransferContext): Promise<string> {
  const { from, to, amountKobo } = context.transfer!;
  const available = balances.get(from) ?? 0;
  if (available < amountKobo) throw new Error("Insufficient funds");
  balances.set(from, available - amountKobo);
  balances.set(to, (balances.get(to) ?? 0) + amountKobo);
  return `${context.user!.name} moved ${naira(amountKobo)} from ${from} to ${to}`;
}
```

And the three checks written for this lesson, each one small enough to read at a glance. They throw errors from `@zudojs/errors`, which already carry the right HTTP status:

checks.ts

```ts
import { AuthenticationError, AuthorizationError } from "@zudojs/errors";
import type { NamedMiddleware } from "@zudojs/middleware";
import { schema } from "@zudojs/schema";
import { users } from "./bank.js";
import type { TransferContext } from "./bank.js";

export const authenticate: NamedMiddleware<TransferContext, string> = {
  name: "authenticate",
  handler: async (context, next) => {
    const user = context.token === undefined ? undefined : users.get(context.token);
    if (!user) throw new AuthenticationError("Unknown or missing token");
    context.user = user;
    context.key = user.id;
    return next();
  },
};

export const authorize: NamedMiddleware<TransferContext, string> = {
  name: "authorize",
  handler: async (context, next) => {
    if (context.user?.role !== "teller") throw new AuthorizationError("Only tellers can move money");
    return next();
  },
};

const TransferSchema = schema.refine(
  schema.object({
    from: schema.string().min(1).max(20),
    to: schema.string().min(1).max(20),
    amountKobo: schema.number().int().min(100).max(1_000_000_000),
  }),
  (transfer) => transfer.from !== transfer.to,
  "Cannot transfer to the same account",
);

export const validate: NamedMiddleware<TransferContext, string> = {
  name: "validate",
  handler: async (context, next) => {
    context.transfer = TransferSchema.parse(context.body);
    return next();
  },
};
```

Only `authenticate` sets `user`, only `validate` sets `transfer`. When you read the handler, you know both were checked. Mutating the context is the normal way for middleware to pass results forward; keeping the transport fields `readonly` stops a middleware from quietly rewriting the input.

## Error handling

By default a pipeline **captures** an error: the chain stops and the outcome reports it. The `errorMode` option offers two alternatives. Picture an optional audit step whose store is down:

error-modes.tsNode.js only

```ts
import { createPipeline } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";

type Steps = { steps: string[] };
const step = (name: string): NamedMiddleware<Steps, string> => ({
  name,
  handler: async (context, next) => {
    context.steps.push(name);
    return next();
  },
});
const audit: NamedMiddleware<Steps, string> = {
  name: "audit",
  handler: async () => {
    throw new Error("audit store unreachable");
  },
};

for (const errorMode of ["capture", "continue", "throw"] as const) {
  const run = createPipeline([step("authenticate"), audit, step("validate")], async (c) => c.steps.join(" > "), { errorMode });
  try {
    const outcome = await run({ steps: [] });
    const summary = outcome.success ? `result "${outcome.result}"` : `error "${(outcome.error as Error).message}"`;
    console.log(errorMode.padEnd(8), summary, "| recorded:", outcome.errors.map((e) => e.name), "| ran:", outcome.executedMiddleware);
  } catch (error) {
    console.log(errorMode.padEnd(8), "threw to the caller:", (error as Error).message);
  }
}
```

Output of `npx tsx error-modes.ts`

```ts
capture  error "audit store unreachable" | recorded: [ 'audit' ] | ran: [ 'authenticate', 'audit' ]
continue result "authenticate > validate" | recorded: [ 'audit' ] | ran: [ 'authenticate', 'audit', 'validate' ]
throw    threw to the caller: audit store unreachable
```

- `"capture"` (default): stop and report. Use it when the caller turns the outcome into an answer, as an HTTP route does.
- `"continue"`: record the failure, skip the rest of that middleware, carry on. The handler still ran and the failure is in `errors`. Only for middleware that is truly optional, like this audit step. Never for a security check: a `continue` pipeline would let a request through after `authenticate` threw.
- `"throw"`: stop and let the error propagate, for callers that already have their own `try`/`catch`.

`errorMiddleware(onError)` reports every error that passes through it and rethrows it, so the mode still decides what happens next. It has priority 0, so it runs first and sees the errors of everything after it. And one mistake is caught for you: calling `next()` twice would run the rest of the pipeline, including the handler that moves money, twice:

report-errors.tsNode.js only

```ts
import { createPipeline, errorMiddleware } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";

let transfers = 0;
const retryOnce: NamedMiddleware<object, string> = {
  name: "retry-once",
  handler: async (_context, next) => {
    try {
      return await next();
    } finally {
      await next();
    }
  },
};

const report = errorMiddleware<string>((error) => console.log("reported:", (error as Error).name));
const run = createPipeline([report, retryOnce], async () => {
  transfers += 1;
  return "moved ₦45,000";
});

const outcome = await run({});
console.log(outcome.success, outcome.success ? outcome.result : (outcome.error as Error).message);
console.log("transfers performed:", transfers, "| ran:", outcome.executedMiddleware);
```

Output of `npx tsx report-errors.ts`

```ts
reported: MiddlewareNextCalledMultipleTimesError
false Middleware "retry-once" called next() multiple times.
transfers performed: 1 | ran: [ 'error-handler', 'retry-once' ]
```

The second `next()` was refused with `MiddlewareNextCalledMultipleTimesError` before the handler could run again, and the error middleware reported it. A real retry belongs around the operation inside the handler, where you control what is safe to repeat, never around `next()`.

## Timeouts

A transfer that hangs on a slow bank connection holds a worker, a database connection and a user's patience. `timeoutMiddleware(ms)` fails the run with a `MiddlewareTimeoutError` when the rest of the pipeline takes longer:

timeout.tsNode.js only

```ts
import { createPipeline, timeoutMiddleware } from "@zudojs/middleware";

let bankAnswered = false;
const run = createPipeline([timeoutMiddleware<object, string>(50)], async () => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  bankAnswered = true;
  return "moved ₦45,000";
});

const outcome = await run({});
console.log(outcome.success, outcome.success ? outcome.result : (outcome.error as Error).message);
console.log("did the bank call finish?", bankAnswered);
await new Promise((resolve) => setTimeout(resolve, 150));
console.log("and a moment later?", bankAnswered);
```

Output of `npx tsx timeout.ts`

```ts
false Middleware "timeout" timed out after 50ms.
did the bank call finish? false
and a moment later? true
```

Read the last line twice. The caller was told "timed out", but the work **kept running** and finished: nothing in the middleware contract can stop a promise that is already running. For a transfer that is dangerous. The client may retry a transfer that actually went through. Two rules follow:

- Work that must stop needs an `AbortSignal` it checks itself, passed through the context. The pipeline's `signal` option also aborts a run before each middleware starts, failing it with a `MiddlewareAbortedError`.
- Operations that change money must be safe to repeat, for example with an idempotency key ([Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency)). A timeout tells you "I stopped waiting", never "it did not happen".

## Logging

`loggingMiddleware(write)` writes one line when a run starts and one when it ends, using the context's `method` and `path`. You pass the function that writes the line, usually a method of a `@zudojs/logger` logger; without one it writes nothing. It is careful in two ways that hand-written logging usually is not:

logging.tsNode.js only

```ts
import { createPipeline, loggingMiddleware, sanitizeLogValue, withTiming } from "@zudojs/middleware";
import { request } from "./bank.js";
import type { TransferContext } from "./bank.js";

const lines: string[] = [];
const write = (line: string) => void lines.push(line);

const run = createPipeline<TransferContext, string>(
  [
    loggingMiddleware<string>(write),
    withTiming<TransferContext, string>(
      "fraud-check",
      async (_context, next) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return next();
      },
      { thresholdMs: 20, logger: write },
    ),
  ],
  async () => {
    throw new Error("connection to postgres://bank:s3cret@db failed");
  },
);

const hostile = { ...request("tok-ada", {}), path: "/transfers\n[INFO] admin logged in" };
await run(hostile);
console.log(lines.join("\n"));
console.log(sanitizeLogValue("Emeka\r\nFAKE LINE", 40));
```

Output of `npx tsx logging.ts`

```json
[middleware] → POST /transfers\n[INFO] admin logged in
[middleware] fraud-check took 30.5ms
[middleware] ✗ failed in 30.9ms
Emeka\r\nFAKE LINE
```

- The path contained a newline, an attempt at **log injection**: forging a second log line that looks real. It was written as the two characters `\n`, in one line. `sanitizeLogValue` is the same escaping for your own log lines.
- The error message contained a password, and it was **not** logged: the completion line only says the run failed. Pass `{ includeErrorMessage: true }` only when you know your messages are safe.
- `withTiming(name, middleware, { thresholdMs, logger })` wraps one middleware and reports it only when it is slow, so the log is not flooded with fast runs.

## Rate limiting

`rateLimitMiddleware(max, windowMs)` allows `max` runs per key in a **sliding window** of `windowMs`. The key is read from `context.key`, which is why `authenticate` sets it to the user id:

rate-limit.tsNode.js only

```ts
import { createPipeline, rateLimitMiddleware } from "@zudojs/middleware";
import type { TransferContext } from "./bank.js";
import { authenticate } from "./checks.js";

const limit = rateLimitMiddleware<TransferContext, string>(2, 60_000);
const run = createPipeline([authenticate, limit], async (context) => `ok for ${context.user?.name}`);

for (const token of ["tok-ada", "tok-ada", "tok-ada", "tok-bayo"]) {
  const outcome = await run({ requestId: "r", method: "POST", path: "/transfers", token, body: {} });
  if (outcome.success) {
    console.log(token, "->", outcome.result);
  } else {
    const error = outcome.error as Error & { retryAfterMs: number; limit: number };
    console.log(token, "->", error.name, `(limit ${error.limit}, retry in about ${Math.ceil(error.retryAfterMs / 1000)}s)`);
  }
}
console.log("Ada's window:", limit.inspect("u-ada")?.count, "| keys tracked:", limit.size());
```

Output of `npx tsx rate-limit.ts`

```ts
tok-ada -> ok for Ada
tok-ada -> ok for Ada
tok-ada -> MiddlewareRateLimitError (limit 2, retry in about 60s)
tok-bayo -> ok for Bayo
Ada's window: 2 | keys tracked: 2
```

Ada's third transfer inside a minute was refused; Bayo has his own allowance. The error carries `retryAfterMs`, the time until the oldest counted run leaves the window, and `inspect`, `size` and `reset` help in metrics and tests. Now the trap that the order of middleware sets:

unkeyed.tsNode.js only

```ts
import { createPipeline, rateLimitMiddleware } from "@zudojs/middleware";

type Context = { key?: string };
const pooled = createPipeline([rateLimitMiddleware<Context, string>(2, 60_000)], async () => "ok");
const strict = createPipeline([rateLimitMiddleware<Context, string>(2, 60_000, { rejectUnkeyed: true })], async () => "ok");

for (const label of ["client A", "client B", "client C"]) {
  const outcome = await pooled({});
  console.log("pooled:", label, outcome.success ? "allowed" : "refused");
}
const refused = await strict({});
console.log("strict:", refused.success ? "allowed" : (refused.error as Error).message);
```

Output of `npx tsx unkeyed.ts`

```ts
pooled: client A allowed
pooled: client B allowed
pooled: client C refused
strict: Rate-limited request carried no key and unkeyed requests are rejected
```

Without a key, every request lands in one **shared bucket**. Three different clients shared one allowance of two, so one noisy client can lock everybody out. That is what happens if the limiter runs before `authenticate` has set the key. Put the limiter after the step that sets the key, and use `rejectUnkeyed: true` so a mistake in the order fails loudly instead.

> A 429 IS YOUR JOB
>
> The error's documentation says it is meant to become a 429 with `Retry-After`, but in the published packages a `MiddlewareRateLimitError` has status 500 and is not exposed. Thrown into `@zudojs/http`, it becomes a generic 500. Map it yourself, as [the HTTP section](#http) does. The counts also live in this one process: behind several instances, each counts separately, as with the HTTP limiter in [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware#rate-limit).

## Build the pipeline

Now the whole chain from the start of the lesson: **logging → authentication → authorization → validation → rate limit → handler**, plus a timeout around the handler.

REASON IT OUT

### Why this order?

For each neighbouring pair, ask what would go wrong if you swapped them. Logging and authentication? Authentication and authorization? Authorization and validation? Validation and the rate limit? Where does the timeout belong?

**Show the reasoning**

- **Logging first**, so every request is logged, including the ones refused by a later step. A refused request is often the interesting one.
- **Authentication before authorization**: you cannot check what someone may do before you know who they are. It also sets `key` for the limiter.
- **Authorization before validation**: a viewer learns nothing about what a valid transfer looks like, and nobody spends work validating a request that will be refused anyway.
- **Validation before the rate limit**: a malformed request is refused without using up the caller's allowance, so a client with a bug in its request builder is told "400, fix your request", not "429, wait". The limiter protects the expensive part, the handler. The price: malformed requests are not limited here, so the HTTP layer's per-IP limit from the middleware lesson still sits in front of everything.
- **The timeout last**, directly around the handler, so it measures the slow external work and not the cheap checks.

transfer-pipeline.ts

```ts
import { createPipeline, loggingMiddleware, rateLimitMiddleware, timeoutMiddleware } from "@zudojs/middleware";
import { moveMoney } from "./bank.js";
import type { TransferContext } from "./bank.js";
import { authenticate, authorize, validate } from "./checks.js";

export function createTransferPipeline(write: (line: string) => void) {
  return createPipeline<TransferContext, string>(
    [
      loggingMiddleware<string>(write),
      authenticate,
      authorize,
      validate,
      rateLimitMiddleware<TransferContext, string>(3, 60_000, { rejectUnkeyed: true }),
      timeoutMiddleware<TransferContext, string>(2_000),
    ],
    moveMoney,
  );
}
```

build.tsNode.js only

```ts
import { createTransferPipeline } from "./transfer-pipeline.js";
import { balances, naira, request } from "./bank.js";

const transfer = createTransferPipeline(() => {});
const good = { from: "acc-1", to: "acc-2", amountKobo: 4_500_000 };

const cases: [string, ReturnType<typeof request>][] = [
  ["no token", request(undefined, good)],
  ["viewer", request("tok-bayo", good)],
  ["same account", request("tok-ada", { ...good, to: "acc-1" })],
  ["good #1", request("tok-ada", good)],
  ["good #2", request("tok-ada", good)],
  ["good #3", request("tok-ada", good)],
  ["good #4", request("tok-ada", good)],
];
for (const [label, context] of cases) {
  const outcome = await transfer(context);
  const text = outcome.success ? outcome.result : `${(outcome.error as Error).name}`;
  console.log(label.padEnd(13), text.padEnd(42), outcome.executedMiddleware.at(-1));
}
console.log("acc-1:", naira(balances.get("acc-1") ?? 0), "| acc-2:", naira(balances.get("acc-2") ?? 0));
```

Output of `npx tsx build.ts`

```ts
no token      AuthenticationError                        authenticate
viewer        AuthorizationError                         authorize
same account  SchemaError                                validate
good #1       Ada moved ₦45,000 from acc-1 to acc-2      timeout
good #2       Ada moved ₦45,000 from acc-1 to acc-2      timeout
good #3       Ada moved ₦45,000 from acc-1 to acc-2      timeout
good #4       MiddlewareRateLimitError                   rate-limit
acc-1: ₦365,000 | acc-2: ₦155,000
```

The last column is the last middleware that started, which is where each refused request stopped. The viewer was stopped at `authorize` and never validated. The same-account transfer was stopped at `validate` and did *not* use up Ada's allowance, so her next three transfers went through and only the fourth hit the limit. Exactly three times ₦45,000 moved.

## Connecting the pipeline to HTTP

The transfer pipeline knows nothing about HTTP, which is the point. An HTTP route becomes a thin **adapter**: build the context from the request, run the pipeline, turn the outcome into a response. Only the adapter knows about status codes:

http-adapter.ts

```ts
import { createResponseContext } from "@zudojs/http";
import type { HttpResponseContext } from "@zudojs/http";
import { MiddlewareRateLimitError } from "@zudojs/middleware";
import type { PipelineResult } from "@zudojs/middleware";

/** Turns a pipeline outcome into a response; unknown failures are rethrown so the server answers 500. */
export function toResponse(outcome: PipelineResult<unknown>, successStatus = 200): HttpResponseContext {
  if (outcome.success) return createResponseContext({ status: successStatus }).json(outcome.result);
  const error = outcome.error;
  if (error instanceof MiddlewareRateLimitError) {
    return createResponseContext({ status: 429 })
      .setHeader("retry-after", String(Math.ceil(error.retryAfterMs / 1000)))
      .json({ error: "Too many requests" });
  }
  const known = error as { statusCode?: number; expose?: boolean; message?: string; code?: string };
  if (known.expose === true && typeof known.statusCode === "number" && known.statusCode < 500) {
    return createResponseContext({ status: known.statusCode }).json({ error: known.message, code: known.code });
  }
  throw error;
}
```

http.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { createTransferPipeline } from "./transfer-pipeline.js";
import { toResponse } from "./http-adapter.js";

const transfer = createTransferPipeline(() => {});
const router = createRouter();
router.post("/transfers", async (ctx) => {
  const body: unknown = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  const token = ctx.request.getHeader("authorization")?.replace(/^Bearer /, "");
  const outcome = await transfer({ requestId: ctx.request.id, method: "POST", path: ctx.request.path, token, body });
  return toResponse(outcome, 201);
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const url = `http://127.0.0.1:${server.address?.port}/transfers`;
const body = JSON.stringify({ from: "acc-1", to: "acc-2", amountKobo: 250_000 });
for (const token of ["", "tok-bayo", "tok-ada", "tok-ada", "tok-ada", "tok-ada"]) {
  const response = await fetch(url, { method: "POST", body, headers: { authorization: `Bearer ${token}` } });
  console.log(token.padEnd(8), response.status, response.headers.get("retry-after") ?? "-", await response.text());
}
await server.stop();
```

Output of `npx tsx http.ts`

```ts
         401 - {"error":"Unknown or missing token","code":"ERR_AUTHENTICATION_FAILED"}
tok-bayo 403 - {"error":"Only tellers can move money","code":"ERR_FORBIDDEN"}
tok-ada  201 - "Ada moved ₦2,500 from acc-1 to acc-2"
tok-ada  201 - "Ada moved ₦2,500 from acc-1 to acc-2"
tok-ada  201 - "Ada moved ₦2,500 from acc-1 to acc-2"
tok-ada  429 60 {"error":"Too many requests"}
```

Authentication and authorization failures became 401 and 403 by their own status, and the rate limit became a proper 429 with `Retry-After` because the adapter maps it. A CLI tool would run the same pipeline and print the outcome instead; a queue job would retry after `retryAfterMs`. None of them can forget a check.

### Guard responses

There is a second bridge, for middleware that must refuse requests inside an `HttpMiddlewarePipeline` but should not depend on `@zudojs/http`, such as a guard from a shared package. It returns a **guard response** made with `createGuardResponse`, and `@zudojs/http` sends it as a real response. The guard below is generic over what `next()` returns, so it fits any pipeline that accepts guard responses without importing a single type from `@zudojs/http`:

guard.tsNode.js only

```ts
import { createRequestContext, createResponseContext, HttpMiddlewarePipeline } from "@zudojs/http";
import { createGuardResponse, isGuardResponse } from "@zudojs/middleware";
import type { GuardResponse } from "@zudojs/middleware";

function bankingHoursOnly(hourUtc: () => number) {
  return async <T>(_context: unknown, next: () => Promise<T>): Promise<T | GuardResponse> => {
    const hour = hourUtc();
    if (hour < 7 || hour >= 19) {
      return createGuardResponse({ status: 423, body: { error: "Transfers are closed until 07:00 UTC" }, headers: { "retry-after": "3600" } });
    }
    return next();
  };
}

for (const hour of [10, 22]) {
  const pipeline = new HttpMiddlewarePipeline();
  pipeline.use(bankingHoursOnly(() => hour));
  pipeline.use(async (context) => context.response.setStatus(201).json({ moved: "₦2,500" }));
  const response = await pipeline.execute(createRequestContext({ method: "POST", url: "/transfers" }), createResponseContext());
  console.log(hour, response.status, response.headers["retry-after"] ?? "-", response.body);
}
console.log(isGuardResponse({ status: 423, body: {}, headers: {} }));
```

Output of `npx tsx guard.ts`

```ts
10 201 - {"moved":"₦2,500"}
22 423 3600 {"error":"Transfers are closed until 07:00 UTC"}
false
```

A guard response is branded with a symbol, so a plain object that merely has a `status` key (the last line) is never mistaken for one: data from a request can never forge a response.

## Testing middleware

A middleware is a function of a context and a `next`, so a unit test needs no pipeline and no server: build a context, pass a fake `next`, and check what happened. Then one test of the whole pipeline checks the order through `executedMiddleware`:

testing.tsNode.js only

```ts
import { authorize, validate } from "./checks.js";
import { request } from "./bank.js";
import { createTransferPipeline } from "./transfer-pipeline.js";

function check(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

let nextCalls = 0;
const next = async () => {
  nextCalls += 1;
  return "handler ran";
};

const viewer = { ...request("tok-bayo", {}), user: { id: "u-bayo", name: "Bayo", role: "viewer" as const } };
const refused = await authorize.handler(viewer, next).catch((error: Error) => error.name);
check("authorize refuses a viewer", refused === "AuthorizationError" && nextCalls === 0);

const context = request("tok-ada", { from: "acc-1", to: "acc-2", amountKobo: 10_000 });
await validate.handler(context, next);
check("validate stores the parsed transfer and continues", context.transfer?.amountKobo === 10_000 && nextCalls === 1);

const outcome = await createTransferPipeline(() => {})(request("tok-bayo", {}));
check(
  "the pipeline stops at authorize, before validate",
  outcome.executedMiddleware.join(",") === "logging,authenticate,authorize",
);
```

Output of `npx tsx testing.ts`

```ts
PASS authorize refuses a viewer
PASS validate stores the parsed transfer and continues
PASS the pipeline stops at authorize, before validate
```

The last test would catch the priority trap from earlier: if someone reordered the list so that validation ran first, the executed names would change and the test would fail.

## Put it in the Task API

The Task API gets a bulk import: `POST /tasks/import` takes up to 50 tasks at once, for moving a team's list from another tool. It is a write that can create many tasks in one request, so it gets the whole chain: logging, a token check, a role check, validation, a per-operator rate limit and a timeout. The existing task routes stay as they are.

Who may import? An **operator** with an import token. A token is compared by its SHA-256 digest with `timingSafeEqual`, so the check takes the same time whether the first or the last character is wrong, and the server never keeps the token itself. [Authentication](https://zudojs.oyinlola.site/learn/zudo-auth) replaces this with real user accounts later. Create `src/pipelines/import-tasks.pipeline.ts`:

**Show the unchanged files it uses**

src/repositories/tasks.store.ts

```ts
export type Priority = "low" | "normal" | "high";

export interface StoredTask {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: Priority;
  readonly createdAt: string;
}

export class TaskStore {
  public readonly tasks = new Map<number, StoredTask>();
  public connected = false;
  private lastId = 0;

  public nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}
```

src/dtos/tasks.dto.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
});

export type NewTask = Infer<typeof NewTaskSchema>;
```

src/services/tasks.service.ts

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Clock } from "@zudojs/types";
import { NewTaskSchema } from "../dtos/tasks.dto.js";
import type { StoredTask, TaskStore } from "../repositories/tasks.store.js";

export class TaskService {
  public constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  public create(input: unknown): StoredTask {
    const data = NewTaskSchema.parse(input);
    const clash = [...this.store.tasks.values()].some((t) => t.title === data.title);
    if (clash) {
      throw new ConflictError(`A task called "${data.title}" already exists`);
    }
    const task: StoredTask = { id: this.store.nextId(), ...data, createdAt: new Date(this.clock.now()).toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  public list(): StoredTask[] {
    return [...this.store.tasks.values()];
  }

  public get(id: number): StoredTask {
    const task = this.store.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }
}
```

src/pipelines/import-tasks.pipeline.tsNode.js only

```ts
import { createHash, timingSafeEqual } from "node:crypto";

import { AuthenticationError, AuthorizationError, isConflictError } from "@zudojs/errors";
import { createPipeline, loggingMiddleware, rateLimitMiddleware, timeoutMiddleware } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";
import { schema } from "@zudojs/schema";

import { NewTaskSchema } from "../dtos/tasks.dto.js";
import type { NewTask } from "../dtos/tasks.dto.js";
import type { TaskService } from "../services/tasks.service.js";

export interface Operator {
  readonly name: string;
  readonly role: "viewer" | "importer";
  /** SHA-256 of the operator's import token; the token itself is never stored. */
  readonly tokenDigest: Buffer;
}

export interface ImportContext {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly token: string | undefined;
  readonly body: unknown;
  key?: string;
  operator?: Operator;
  tasks?: NewTask[];
}

export interface ImportReport {
  readonly created: number;
  readonly skipped: readonly string[];
}

export function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

const ImportSchema = schema.object({ tasks: schema.array(NewTaskSchema).min(1).max(50) });

type Step = NamedMiddleware<ImportContext, ImportReport>;

function authenticate(operators: readonly Operator[]): Step {
  return {
    name: "authenticate",
    handler: async (context, next) => {
      const presented = digest(context.token ?? "");
      const operator = operators.find((candidate) => timingSafeEqual(candidate.tokenDigest, presented));
      if (!context.token || !operator) throw new AuthenticationError("A valid import token is required");
      context.operator = operator;
      context.key = operator.name;
      return next();
    },
  };
}

const authorize: Step = {
  name: "authorize",
  handler: async (context, next) => {
    if (context.operator?.role !== "importer") throw new AuthorizationError("This token may not import tasks");
    return next();
  },
};

const validate: Step = {
  name: "validate",
  handler: async (context, next) => {
    context.tasks = ImportSchema.parse(context.body).tasks;
    return next();
  },
};

export interface ImportPipelineOptions {
  readonly operators: readonly Operator[];
  readonly tasks: TaskService;
  readonly log: (line: string) => void;
  readonly maxImportsPerMinute?: number;
}

/** logging -> authentication -> authorization -> validation -> rate limit -> timeout -> handler */
export function createImportPipeline(options: ImportPipelineOptions) {
  return createPipeline<ImportContext, ImportReport>(
    [
      loggingMiddleware<ImportReport>(options.log),
      authenticate(options.operators),
      authorize,
      validate,
      rateLimitMiddleware<ImportContext, ImportReport>(options.maxImportsPerMinute ?? 5, 60_000, { rejectUnkeyed: true }),
      timeoutMiddleware<ImportContext, ImportReport>(5_000),
    ],
    async (context) => {
      const skipped: string[] = [];
      let created = 0;
      for (const task of context.tasks ?? []) {
        try {
          options.tasks.create(task);
          created += 1;
        } catch (error) {
          if (!isConflictError(error)) throw error;
          skipped.push(task.title);
        }
      }
      return { created, skipped };
    },
  );
}
```

The handler reuses `TaskService.create`, so imported tasks obey the same rules as tasks created one by one; a title that already exists is skipped and reported, not fatal. The route turns the outcome into a response with the same mapping as the transfer example. Save it as `src/routes/tasks.import.routes.ts`:

src/routes/tasks.import.routes.tsNode.js only

```ts
import { createResponseContext } from "@zudojs/http";
import type { HttpResponseContext, HttpRouter } from "@zudojs/http";
import { MiddlewareRateLimitError } from "@zudojs/middleware";
import type { PipelineResult } from "@zudojs/middleware";

import type { createImportPipeline, ImportReport } from "../pipelines/import-tasks.pipeline.js";

function toResponse(outcome: PipelineResult<ImportReport>): HttpResponseContext {
  if (outcome.success) return createResponseContext({ status: 201 }).json(outcome.result);
  const error = outcome.error;
  if (error instanceof MiddlewareRateLimitError) {
    return createResponseContext({ status: 429 })
      .setHeader("retry-after", String(Math.ceil(error.retryAfterMs / 1000)))
      .json({ error: "Too many imports, try again later" });
  }
  throw error;
}

/** POST /tasks/import with `Authorization: Bearer <import token>` and `{ "tasks": [...] }`. */
export function registerTaskImportRoutes(router: HttpRouter, importTasks: ReturnType<typeof createImportPipeline>): void {
  router.post("/tasks/import", async (ctx) => {
    const text = new TextDecoder().decode((ctx.request.body as Uint8Array | undefined) ?? new Uint8Array());
    let body: unknown;
    try {
      body = text.trim() === "" ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    const token = ctx.request.getHeader("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    const outcome = await importTasks({ requestId: ctx.request.id, method: "POST", path: ctx.request.path, token, body });
    return toResponse(outcome);
  });
}
```

Broken JSON becomes `undefined`, which the `validate` step refuses with 400, but only after the token and role checks: an anonymous client cannot probe the import format. Every other failure the route rethrows, and the generated error handling answers `AuthenticationError`, `AuthorizationError` and `SchemaError` with 401, 403 and 400; anything unexpected stays a 500. This check script runs the route against a real server, with two operators and a limit of two imports:

src/check-import.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { FixedClock } from "@zudojs/types";
import { createImportPipeline, digest } from "./pipelines/import-tasks.pipeline.js";
import { TaskStore } from "./repositories/tasks.store.js";
import { registerTaskImportRoutes } from "./routes/tasks.import.routes.js";
import { TaskService } from "./services/tasks.service.js";

const tasks = new TaskService(new TaskStore(), new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
tasks.create({ title: "Buy milk" });
const logged: string[] = [];
const importTasks = createImportPipeline({
  operators: [
    { name: "ops", role: "importer", tokenDigest: digest("import-ops-token") },
    { name: "intern", role: "viewer", tokenDigest: digest("intern-token") },
  ],
  tasks,
  log: (line) => void logged.push(line),
  maxImportsPerMinute: 2,
});
const router = createRouter();
registerTaskImportRoutes(router, importTasks);

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const url = `http://127.0.0.1:${server.address?.port}/tasks/import`;
const batch = JSON.stringify({ tasks: [{ title: "Buy milk" }, { title: "Renew the ₦12,000 gym plan", priority: "high" }] });

for (const [label, token, body] of [
  ["no token", "", batch],
  ["intern", "intern-token", batch],
  ["bad body", "import-ops-token", '{"tasks":[]}'],
  ["import", "import-ops-token", batch],
  ["again", "import-ops-token", JSON.stringify({ tasks: [{ title: "Book the plumber" }] })],
  ["too often", "import-ops-token", batch],
] as const) {
  const response = await fetch(url, { method: "POST", body, headers: { authorization: `Bearer ${token}` } });
  console.log(label.padEnd(10), response.status, response.headers.get("retry-after") ?? "-", await response.text());
}
await server.stop();
console.log("tasks now:", tasks.list().map((task) => task.title));
console.log("log lines:", logged.length);
```

Output of `npx tsx src/check-import.ts`

```ts
no token   401 - {"error":"A valid import token is required","code":"ERR_AUTHENTICATION_FAILED"}
intern     403 - {"error":"This token may not import tasks","code":"ERR_FORBIDDEN"}
bad body   400 - {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
import     201 - {"created":1,"skipped":["Buy milk"]}
again      201 - {"created":1,"skipped":[]}
too often  429 60 {"error":"Too many imports, try again later"}
tasks now: [ 'Buy milk', 'Renew the ₦12,000 gym plan', 'Book the plumber' ]
log lines: 12
```

Read it top to bottom: no token 401, a viewer's token 403, an empty list 400 (the viewer never got that far), a good import 201 with the existing "Buy milk" skipped, a second import 201, and the third import inside a minute 429 with `Retry-After`. The failed attempts did not use up the operator's allowance, because validation comes before the limit. Every attempt was logged, six runs with two lines each.

Now wire it into the app. In `src/container.ts`, add a token for the pipeline to `registerServices`, with the operators built in the composition root. The import token is read from the environment directly for now; [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) shows how to load and check settings like this one in one place, and you can move it there. Without the variable, the list is empty and every import is refused, which is the safe default:

src/container.ts (part)Node.js only

```ts
import { createImportPipeline, digest } from "./pipelines/import-tasks.pipeline.js";
import type { Operator } from "./pipelines/import-tasks.pipeline.js";

/** The import pipeline; built once, so its rate limit is shared by all requests. */
export const IMPORT_TASKS = createToken<ReturnType<typeof createImportPipeline>>("ImportTasks");

// in registerServices():
  const importToken = process.env.TASKS_IMPORT_TOKEN;
  const operators: Operator[] = importToken ? [{ name: "ops", role: "importer", tokenDigest: digest(importToken) }] : [];
  container.registerFactory(
    IMPORT_TASKS,
    (tasks) => createImportPipeline({ operators, tasks, log: (line) => console.log(line) }),
    [TaskService],
    { scope: ContainerScope.SINGLETON },
  );

// in createDependencies(), next to tasks:
    importTasks: options.container.resolve(IMPORT_TASKS),
```

The pipeline is a singleton on purpose: a new pipeline per request would create a new rate limiter per request, and the limit would never trigger. In `src/routes/index.ts`, call `registerTaskImportRoutes(router, deps.importTasks)` next to the other task routes. The path `/tasks/import` is a literal, so it beats `/tasks/:id` for POST as well. Then try it:

Terminal on your computer

```bash
$ npm install @zudojs/middleware
$ npx tsc --noEmit
$ TASKS_IMPORT_TOKEN=local-import-token npm run dev
```

Second terminal

```bash
$ curl -s -X POST http://localhost:3000/tasks/import -H "authorization: Bearer local-import-token" -d '{"tasks":[{"title":"Plan the sprint"},{"title":"Read the runtime lesson"}]}'
{"created":1,"skipped":["Read the runtime lesson"]}
$ curl -s -X POST http://localhost:3000/tasks/import -d '{"tasks":[{"title":"Plan the sprint"}]}'
{"error":"A valid import token is required","code":"ERR_AUTHENTICATION_FAILED"}
```

The task the `tasks` module seeded at startup was skipped, not duplicated, and a request without a token was refused. The server's terminal shows the `[middleware]` start and completion lines of each import.

## Practice

TRY IT YOURSELF

### A daily limit in kobo

Tellers may move at most ₦100,000 per day in total. Write a middleware `dailyCap` for the transfer pipeline that keeps a running total per user id and refuses a transfer that would go over the cap, with an `AuthorizationError`. Where in the list does it go, and why? Show three transfers of ₦45,000 by Ada.

**Show a solution**

daily-cap.tsNode.js only

```ts
import { AuthorizationError } from "@zudojs/errors";
import { createPipeline } from "@zudojs/middleware";
import type { NamedMiddleware } from "@zudojs/middleware";
import { moveMoney, naira, request } from "./bank.js";
import type { TransferContext } from "./bank.js";
import { authenticate, authorize, validate } from "./checks.js";

const CAP_KOBO = 10_000_000;
const movedToday = new Map<string, number>();

const dailyCap: NamedMiddleware<TransferContext, string> = {
  name: "daily-cap",
  handler: async (context, next) => {
    const userId = context.user!.id;
    const amount = context.transfer!.amountKobo;
    const already = movedToday.get(userId) ?? 0;
    if (already + amount > CAP_KOBO) {
      throw new AuthorizationError(`Daily limit of ${naira(CAP_KOBO)} reached`);
    }
    const result = await next();
    movedToday.set(userId, already + amount);
    return result;
  },
};

const run = createPipeline([authenticate, authorize, validate, dailyCap], moveMoney);
for (let i = 1; i <= 3; i++) {
  const outcome = await run(request("tok-ada", { from: "acc-1", to: "acc-2", amountKobo: 4_500_000 }));
  console.log(i, outcome.success ? outcome.result : (outcome.error as Error).message);
}
```

Output of `npx tsx daily-cap.ts`

```ts
1 Ada moved ₦45,000 from acc-1 to acc-2
2 Ada moved ₦45,000 from acc-1 to acc-2
3 Daily limit of ₦100,000 reached
```

It goes after `validate`, because it needs the parsed amount, and after `authenticate`, because it needs the user. It adds to the total only after `next()` succeeded, so a transfer that fails in the handler (insufficient funds, a timeout) does not count. Between checking and adding, a second request could slip through; with a shared database you would do both in one transaction.

TRY IT YOURSELF

### A pipeline for a queue job

Reuse the transfer checks for a nightly batch job: build a pipeline for the context `request("tok-ada", …)` with `errorMode: "throw"`, an `errorMiddleware` that prints the failing request id, and the handler `moveMoney`. Run two jobs, one valid and one with an amount of ₦0.50, and let the job runner's own `try`/`catch` decide what to do.

**Show a solution**

batch.tsNode.js only

```ts
import { createPipeline, errorMiddleware } from "@zudojs/middleware";
import { moveMoney, request } from "./bank.js";
import type { TransferContext } from "./bank.js";
import { authenticate, authorize, validate } from "./checks.js";

const runJob = createPipeline<TransferContext, string>(
  [
    errorMiddleware<string>((_error, context) => console.log("job failed:", (context as TransferContext).requestId)),
    authenticate,
    authorize,
    validate,
  ],
  moveMoney,
  { errorMode: "throw" },
);

for (const amountKobo of [150_000, 50]) {
  const job = request("tok-ada", { from: "acc-1", to: "acc-2", amountKobo });
  try {
    const outcome = await runJob(job);
    console.log("job done:", outcome.success && outcome.result);
  } catch (error) {
    console.log("runner: will not retry a", (error as Error).name);
  }
}
```

Output of `npx tsx batch.ts`

```ts
job done: Ada moved ₦1,500 from acc-1 to acc-2
job failed: req-2
runner: will not retry a SchemaError
```

The same three checks run for the HTTP API and the batch job. With `"throw"`, the job runner's own error handling decides: a validation error will not get better on retry, so it is dropped; a timeout might be retried.

## Recap

- `@zudojs/middleware` runs middleware around a handler for any context type, so HTTP routes, CLI tools and queue jobs can share one set of checks.
- `compose` chains middleware; `createPipeline` adds tracking: `success`, `result` or `error`, `executedMiddleware`, `durationMs` and `errors`.
- Named middleware can have a `priority` (lower first, default 100, ties keep list order) and `enabled`. A plain, ordered list is clearest when one file owns the pipeline.
- The context is the contract: transport fields `readonly`, trusted fields (user, key, parsed input) set by the middleware that checked them.
- `errorMode`: `capture` (default), `continue` (only for optional steps) or `throw`. `errorMiddleware` reports and rethrows; calling `next()` twice is refused.
- `timeoutMiddleware` stops waiting but cannot stop the work; `loggingMiddleware` escapes newlines and hides error messages by default; `rateLimitMiddleware` counts per `context.key` in a sliding window, so it must run after the key is set, ideally with `rejectUnkeyed`.
- Logging → authentication → authorization → validation → rate limit → handler: each step relies on the one before. Map pipeline failures to HTTP statuses in the adapter; a `MiddlewareRateLimitError` needs an explicit 429.

The write limit from the middleware lesson is still written in code, and the import token is read straight from `process.env`. Next, [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) moves settings like these into validated, layered configuration.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
