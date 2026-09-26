---
title: "Middleware, CORS, security headers and graceful shutdown — ZudoJS Academy"
description: "Wrap every Task API route in middleware: how a pipeline runs, security headers, a CORS allow-list, rate limits, and a shutdown that lets requests finish."
source: https://zudojs.oyinlola.site/learn/zudo-middleware
---

LEVEL 12 · LESSON 14 OF 19

HTTP Core

# Middleware, CORS, security headers and graceful shutdown

Wrap every Task API route in middleware: how a pipeline runs, security headers, a CORS allow-list, rate limits, and a shutdown that lets requests finish.

- **50 min** to read and try
- **You need:** "Routing in depth"
- **You build:** A Task API that sends safe headers, allows only its own web app, limits how fast clients can write, and shuts down without cutting off requests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict the order in which middleware runs, and write middleware that works before next(), after it, or instead of it
- Explain what each default security header protects against
- Allow exactly the web apps you trust with a CORS allow-list, and explain what CORS does not protect
- Rate-limit clients, with a stricter limit for writes, and explain the limits of counting per process
- Shut the server down so requests in progress finish before the runtime closes what they use

## What middleware is

Some work belongs to *every* request, not to one route: adding security headers, checking where a request comes from, counting requests per client, measuring time. Copying that code into every route would be repetitive and easy to forget.

**Middleware** is a function that runs *around* the route. It receives a `context` (with `context.request` and `context.response`) and a function called `next`. Calling `next()` runs everything after it: the next middleware, and at the end the route. A middleware can:

- do work **before** `next()`, such as checking the request,
- do work **after** `next()`, such as adding a header to the response,
- or **not call** `next()` at all and answer by itself. That is called **short-circuiting**.

An `HttpMiddlewarePipeline` holds middleware in order. You can run it without a server, with a request made by `createRequestContext`, which also makes middleware easy to test:

order.tsNode.js only

```ts
import { createRequestContext, createResponseContext, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

function trace(name: string): HttpMiddleware {
  return async (context, next) => {
    console.log(`${name}: before`);
    const response = await next();
    console.log(`${name}: after`);
    return response;
  };
}

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(trace("timing"));
pipeline.use(trace("security"), { priority: -10 });
pipeline.use(async (context) => {
  console.log("route: builds the response");
  return context.response.json({ ok: true });
});

const request = createRequestContext({ method: "GET", url: "/tasks" });
const response = await pipeline.execute(request, createResponseContext());
console.log(response.status, response.body);
```

Output of `npx tsx order.ts`

```ts
security: before
timing: before
route: builds the response
timing: after
security: after
200 {"ok":true}
```

The calls nest like layers of an onion: `security` starts first and finishes last. It was registered second but runs first because its `priority` is lower. Lower numbers run earlier, the default is 0, and equal priorities keep the order you added them in. The last function never calls `next`; it plays the role of the route.

REASON IT OUT

### Where does each middleware go?

Before reading on, put these four in order for the Task API, and say what would go wrong if you swapped a neighbouring pair: security headers, CORS, a rate limit, and the step that hands the request to the router. Think about a CORS preflight, a request refused with 429, and a response that a route builds.

**Show the reasoning**

- **Security headers first**. Their work happens after `next()`, so the outermost layer sees *every* response, including a 429 and a preflight answer. Placed later, the answers of everything before it would go out without the headers.
- **CORS before the rate limit**. CORS answers a browser's `OPTIONS` preflight itself; after the limiter, every preflight would use up the client's allowance, and a 429 without CORS headers would be hidden from the web app.
- **The rate limit before the router**, so a flood never reaches your routes.
- **Dispatch last**: it is the end of the chain and never calls `next`.

That is exactly the order the generated `src/server.ts` uses, as you will see at the end of this lesson.

## Writing your own middleware

Two small middleware for the Task API. The first puts an `x-response-time` header on every response: work *after* `next()`. The second is a maintenance switch that short-circuits: while it is on, no request reaches a route:

own.tsNode.js only

```ts
import { createRequestContext, createResponseContext, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

const responseTime: HttpMiddleware = async (context, next) => {
  const started = performance.now();
  const response = await next();
  return response.setHeader("x-response-time", `${Math.round(performance.now() - started)}ms`);
};

let maintenance = false;
const maintenanceMode: HttpMiddleware = async (context, next) => {
  if (maintenance) {
    return context.response
      .setStatus(503)
      .setHeader("retry-after", "120")
      .json({ error: "The Task API is under maintenance" });
  }
  return next();
};

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(responseTime, { priority: -100 });
pipeline.use(maintenanceMode);
pipeline.use(async (context) => context.response.json([{ id: 1, title: "Buy milk" }]));

for (const state of [false, true]) {
  maintenance = state;
  const response = await pipeline.execute(createRequestContext({ method: "GET", url: "/tasks" }), createResponseContext());
  console.log(response.status, response.headers["retry-after"], response.body);
  console.log("has x-response-time:", "x-response-time" in response.headers);
}
```

Output of `npx tsx own.ts`

```ts
200 undefined [{"id":1,"title":"Buy milk"}]
has x-response-time: true
503 120 {"error":"The Task API is under maintenance"}
has x-response-time: true
```

With maintenance on, the route never ran, yet the response still got its `x-response-time` header. `responseTime` has the lowest priority, so it wraps everything, including middleware that answers early. That is the rule for ordering: middleware that must see *every* response goes first.

One thing `responseTime` does not handle: if the route throws an error, `await next()` throws that same error, and the code after it never runs. The error travels out through every middleware to whoever called the pipeline. [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors) writes a middleware that catches it and turns it into a response.

To run a pipeline for real requests, its last step dispatches the router, and the server hands every request to the pipeline:

wiring.ts (part)Node.js only

```ts
pipeline.use(async (context) => (await router.dispatch(context.request)).response);

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: (request) => pipeline.execute(request, createResponseContext()),
});
```

## Security headers

Browsers understand a set of response headers that switch on extra protection: do not let other sites put this page in a frame, do not guess content types, and so on. `createSecurityMiddleware()` sends a safe set on every response. So the next examples can use a real server, this helper serves a pipeline and stops it again:

serve.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type { HttpMiddlewarePipeline } from "@zudojs/http";

export async function withServer(pipeline: HttpMiddlewarePipeline, run: (base: string) => Promise<void>): Promise<void> {
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: (request) => pipeline.execute(request, createResponseContext()),
  });
  await server.start();
  try {
    await run(`http://127.0.0.1:${server.address?.port}`);
  } finally {
    await server.stop();
  }
}
```

headers.tsNode.js only

```ts
import { createSecurityMiddleware, HttpMiddlewarePipeline } from "@zudojs/http";
import { withServer } from "./serve.js";

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(createSecurityMiddleware());
pipeline.use(async (context) => context.response.json([{ id: 1, title: "Buy milk" }]));

await withServer(pipeline, async (base) => {
  const response = await fetch(`${base}/tasks`);
  for (const name of [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "content-security-policy",
    "strict-transport-security",
  ]) {
    console.log(`${name}: ${response.headers.get(name)}`);
  }
});
```

Output of `npx tsx headers.ts`

```ts
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

What they do, in short:

- `X-Content-Type-Options: nosniff`: the browser must trust the `Content-Type` you send and not guess, so a JSON answer can never be run as a script.
- `X-Frame-Options: DENY` and CSP's `frame-ancestors 'none'`: no other site may show your pages inside a frame. This stops **clickjacking**, where an invisible frame tricks the user into clicking your buttons.
- `Referrer-Policy`: other sites do not see your full URLs, which may contain ids.
- `Content-Security-Policy` (CSP): the list of places a page may load scripts, styles and images from. Neither scripts nor styles may run inline (no `'unsafe-inline'`), and `object-src 'none'` blocks `<object>`/`<embed>`, a route around the other rules browsers have closed one at a time.
- `Strict-Transport-Security` (HSTS): "only ever talk to me over HTTPS" for two years (`max-age=63072000`), the value browsers' preload lists expect.

The middleware also sends a few more (`Permissions-Policy` and the cross-origin headers). You get all of them with one line, and you never have to remember them.

> HSTS AND LOCALHOST
>
> Browsers remember HSTS, but they only accept it from an HTTPS answer: over plain `http://` they ignore it. If a development server on `localhost` ever answers over HTTPS (with a local certificate, or behind a local proxy) and sends HSTS, browsers then refuse plain `http://localhost` for a year, on every port. For such a server, use `createSecurityMiddleware({ strictTransportSecurity: "max-age=0" })`, which tells browsers to forget it, and keep the default in production behind HTTPS. [Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security#headers) goes deeper into CSP and HSTS.

## CORS: which websites may call you

Imagine the Task API at `api.tasks.example.com` and its web app at `tasks.example.com`. When JavaScript on one website calls another address, the browser first checks whether that address allows it. That rule is **CORS** (Cross-Origin Resource Sharing). An **origin** is a scheme, host and port, like `https://tasks.example.com`. The browser sends it in the `Origin` header, and your answer must say that this origin is allowed.

For some requests (for example a `POST` with JSON) the browser first sends a separate `OPTIONS` request, called a **preflight**, to ask for permission. `createCorsMiddleware` handles both. Give it an **allow-list**: the exact origins you trust.

cors.tsNode.js only

```ts
import { createCorsMiddleware, HttpMiddlewarePipeline } from "@zudojs/http";
import { withServer } from "./serve.js";

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(createCorsMiddleware({ allowOrigin: ["https://tasks.example.com"], credentials: true }));
pipeline.use(async (context) => context.response.json([{ id: 1, title: "Buy milk" }]));

async function call(label: string, base: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${base}/tasks`, init);
  console.log(label, response.status, "allow-origin:", response.headers.get("access-control-allow-origin"));
}

await withServer(pipeline, async (base) => {
  await call("our app      ", base, { headers: { origin: "https://tasks.example.com" } });
  await call("other site   ", base, { headers: { origin: "https://evil.example" } });
  await call("preflight    ", base, {
    method: "OPTIONS",
    headers: { origin: "https://tasks.example.com", "access-control-request-method": "POST" },
  });
});
```

Output of `npx tsx cors.ts`

```ts
our app       200 allow-origin: https://tasks.example.com
other site    200 allow-origin: null
preflight     204 allow-origin: https://tasks.example.com
```

Our own app got `access-control-allow-origin` back with its origin, so its browser lets the page read the answer. The preflight was answered with 204 by the middleware itself; the route never ran.

Look closely at the other site: it got status 200 and the data was sent. Only the missing header makes *the browser* hide the answer from that site's JavaScript. **CORS protects users' browsers, not your server.** `curl`, a script or another server ignores CORS completely. It never replaces authentication or permissions.

`credentials: true` lets the browser send cookies along. Combined with "every origin" (`"*"`), any website could make requests with your users' cookies. The package refuses that combination at startup:

cors-wildcard.tsNode.js only

```ts
import { createCorsMiddleware } from "@zudojs/http";

try {
  createCorsMiddleware({ allowOrigin: "*", credentials: true });
} catch (error) {
  console.log((error as Error).name);
  console.log((error as Error).message);
}
```

Output of `npx tsx cors-wildcard.ts`

```ts
ConfigurationError
CORS: credentials cannot be combined with a wildcard origin ("*"). Enumerate the allowed origins, or supply a function or RegExp.
```

Keep the allow-list in configuration, not in the code, so development can allow `http://localhost:5173` and production only your real domain. [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) does exactly that.

## Rate limiting

A public API must limit how many requests one client can send. Without a limit, one script can flood the Task API with junk tasks or guess passwords all day. A **rate limiter** counts requests per client within a time window and answers **429 Too Many Requests** when the client goes over.

The limiter lives in `@zudojs/security`. The Task API already lists that package in its `package.json`, because the generated security headers come from it too. In another project, run `npm install @zudojs/security`. `createRateLimiter` counts per **key**, usually the client's IP address:

limiter.tsNode.js only

```ts
import { createRateLimiter } from "@zudojs/security";

const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

for (let i = 1; i <= 4; i++) {
  const decision = limiter.check({ ip: "203.0.113.7" });
  console.log(`request ${i}: allowed=${decision.allowed} remaining=${decision.remaining}`);
}
console.log("another client:", limiter.check({ ip: "198.51.100.2" }).allowed);
limiter.destroy();
```

Output of `npx tsx limiter.ts`

```ts
request 1: allowed=true remaining=2
request 2: allowed=true remaining=1
request 3: allowed=true remaining=0
request 4: allowed=false remaining=0
another client: true
```

The fourth request inside one minute was refused, but a different client was not affected. The window *slides*: each check forgets requests older than `windowMs`, so a client cannot send three requests at 11:59:59 and three more at 12:00:00. `destroy()` stops the limiter's clean-up timer when you no longer need it.

In a pipeline, `createRateLimitMiddleware` wraps a limiter. Give it options to create one, or pass `{ limiter }` to share one you made. Creating tasks costs more than reading them, so the Task API gets a gentle limit for every request and a stricter one for writes:

rate-limit.tsNode.js only

```ts
import { createRateLimitMiddleware, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createRateLimiter } from "@zudojs/security";
import { withServer } from "./serve.js";

const writes = createRateLimitMiddleware({ limiter: createRateLimiter({ windowMs: 60_000, max: 2 }) });
const limitWrites: HttpMiddleware = (context, next) =>
  context.request.method === "GET" ? next() : writes(context, next);

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(createRateLimitMiddleware({ windowMs: 60_000, max: 100 }));
pipeline.use(limitWrites);
pipeline.use(async (context) => context.response.setStatus(context.request.method === "POST" ? 201 : 200).json({ ok: true }));

await withServer(pipeline, async (base) => {
  for (const method of ["POST", "POST", "POST", "GET"]) {
    const response = await fetch(`${base}/tasks`, { method });
    console.log(method, response.status, "retry-after:", response.headers.get("retry-after"), await response.text());
  }
});
```

Output of `npx tsx rate-limit.ts`

```ts
POST 201 retry-after: null {"ok":true}
POST 201 retry-after: null {"ok":true}
POST 429 retry-after: 60 {"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"},"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}
GET 200 retry-after: null {"ok":true}
```

The third `POST` got 429, with a JSON body (sent as `application/json`) and a `Retry-After` header: the number of seconds to wait. The `code` and `message` are repeated at the top level of the body, not only nested under `error`, so client code that reads either shape finds them. Reading still works, because `GET` requests only count against the gentle limit.

- The client is identified by `request.remoteAddress`. Behind a **proxy** or load balancer, every request seems to come from the proxy, so all users would share one allowance. Tell the adapter how many proxies you run, for example `createNodeHttpAdapter({ trustProxy: 1 })`; only then does it believe the `X-Forwarded-For` header. Never trust that header without it: any client can send it and pick its own address.
- These counts live in the memory of one process. With several copies of the app, each counts separately; [Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security#rate-limit) covers that case and login limits.

## Middleware outside HTTP: @zudojs/middleware

The same idea helps with work that is not a request, such as a background job that sends task reminders, or checks that an HTTP route, a command-line tool and a queue job must all share. `@zudojs/middleware` is a general pipeline for any kind of context. `@zudojs/http` uses it internally, so it is already in `node_modules`, but only as a dependency of a dependency: it is not in the Task API's `package.json`. Before your own code imports it, install it with `npm install @zudojs/middleware`, or a stricter package manager such as pnpm will refuse the import. For HTTP, stay with `HttpMiddlewarePipeline` from `@zudojs/http`: it knows about requests and responses. The next lesson, [Middleware pipelines with @zudojs/middleware](https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines), builds such a pipeline step by step.

## Graceful shutdown of the server

In [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#signals) you saw why `src/server.ts` handles `SIGTERM` itself: it stops the HTTP server *before* the runtime. Here is what `server.stop()` does. It closes the door to new connections at once, but waits for requests that are already running, up to `gracefulShutdownTimeout` (30 seconds by default):

graceful.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";

let reportStarted!: () => void;
const started = new Promise<void>((resolve) => (reportStarted = resolve));

const router = createRouter();
router.get("/report", async () => {
  reportStarted();
  console.log("report: started");
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log("report: finished");
  return createResponseContext().json({ tasks: 3 });
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
  gracefulShutdownTimeout: 10_000,
});
server.on("onStopping", () => console.log("server: stopping"));
server.on("onStopped", () => console.log("server: stopped"));
await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;

const slow = fetch(`${base}/report`).then(async (r) => console.log("client got", r.status, await r.text()));
await started;
const stopping = server.stop();

try {
  await fetch(`${base}/report`);
} catch (error) {
  console.log("new request refused:", ((error as Error).cause as { code?: string }).code);
}
await Promise.all([slow, stopping]);
```

Output of `npx tsx graceful.ts`

```ts
report: started
server: stopping
new request refused: ECONNREFUSED
report: finished
client got 200 {"tasks":3}
server: stopped
```

The report that was already running finished and its client got a full 200, while a new request was refused. Only then did the server report `stopped`. After that, `runtime.stop()` can safely close the store, because no request is using it any more.

The full order in `src/server.ts` is therefore: stop the HTTP server, stop the runtime, dispose the container, exit with 0. If anything fails, log it and exit with 1. Keep `gracefulShutdownTimeout` below the time your platform waits after `SIGTERM` before it kills the process (often 30 seconds), so your shutdown finishes first.

## Put it in the Task API

Open `src/server.ts` and find the pipeline. The CLI already built most of this lesson into it:

src/server.ts (part)Node.js only

```ts
const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: config.corsOrigins }),
    createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
    // zudojs:server-middleware:start
    // zudojs:server-middleware:end
    dispatch,
  ],
});
```

A pipeline can take its middleware as a list, in order, instead of `pipeline.use()` calls. Read it from the top:

- `securityHeaders()` comes from `src/utils/http.ts`. It is first, so *every* answer gets the headers, even a 429 or a CORS preflight. It uses `generateSecurityHeaders()` from `@zudojs/security`, the same kind of set as `createSecurityMiddleware()`, with a stricter Content-Security-Policy and a two-year HSTS. It only adds a header the response has not set itself, because the `/docs` page sends its own CSP to load its scripts.
- `createCorsMiddleware` takes its allow-list from the `CORS_ORIGINS` setting. Empty means no website at all, the safe default.
- `createRateLimitMiddleware` gives each client 300 requests per minute, from `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. CORS comes before it, so a preflight does not use up the client's allowance.
- `dispatch` is last: it hands the request to the router.

Here is the helper, so you can see there is no magic in it:

src/utils/http.ts (part)Node.js only

```ts
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

All work happens *after* `next()`, like `responseTime` earlier in this lesson. The `// zudojs:server-middleware` markers are where `zudojs add` puts the middleware of a feature it adds, and where `zudojs generate middleware` registers a new one.

One thing from this lesson is missing: a stricter limit for writes. Creating tasks costs more than reading them. Put it in the empty `src/middlewares/` folder. The file name follows the CLI's naming for middleware:

src/middlewares/write-limit.middleware.tsNode.js only

```ts
import { createRateLimitMiddleware } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A stricter rate limit for requests that change data. Reads pass straight through. */
export function writeLimitMiddleware(options: { readonly windowMs: number; readonly max: number }): HttpMiddleware {
  const limit = createRateLimitMiddleware(options);
  return (context, next) => (READS.has(context.request.method) ? next() : limit(context, next));
}
```

Export it from `src/middlewares/index.ts`:

src/middlewares/index.tsNode.js only

```ts
export { writeLimitMiddleware } from "./write-limit.middleware.js";
```

> TIP
>
> `zudojs generate middleware write-limit` writes `src/middlewares/write-limit.middleware.ts` with an empty `writeLimitMiddleware()` that only passes the request on, exports it from `index.ts`, and adds it to the pipeline in `src/server.ts` between the markers. Here you write it by hand, so the limit is yours from the first line.

In `src/server.ts`, import it with `import { writeLimitMiddleware } from "./middlewares/index.js";` and add it after the general rate limit, below the markers. The limit of 20 writes a minute is written in the code until [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) moves it into a setting:

src/server.ts (part)Node.js only

```ts
createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
// zudojs:server-middleware:start
// zudojs:server-middleware:end
writeLimitMiddleware({ windowMs: 60_000, max: 20 }),
dispatch,
```

A check script builds the same order with a stand-in route and a limit of 2 writes, and runs it without a server:

**Show src/utils/http.ts, which the script imports**

src/utils/http.ts

```ts
import {
  HttpError,
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/** A task id from the path; anything but a positive whole number is answered with 400. */
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest("The task id must be a positive whole number");
  }
  return id;
}

/**
 * The response for an error that carries an exposed 4xx status
 * (NotFoundError, badRequest(), ...). Anything else is left to the server,
 * which answers a generic 500 and never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

src/check-middleware.tsNode.js only

```ts
import { createCorsMiddleware, createRequestContext, createResponseContext, HttpMiddlewarePipeline } from "@zudojs/http";
import { writeLimitMiddleware } from "./middlewares/write-limit.middleware.js";
import { securityHeaders } from "./utils/http.js";

const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: ["http://localhost:5173"] }),
    writeLimitMiddleware({ windowMs: 60_000, max: 2 }),
    async (context) => context.response.setStatus(context.request.method === "POST" ? 201 : 200).json({ ok: true }),
  ],
});

for (const method of ["POST", "POST", "POST", "GET"]) {
  const request = createRequestContext({ method, url: "/tasks", headers: { origin: "http://localhost:5173" } });
  const { status, headers } = await pipeline.execute(request, createResponseContext());
  console.log(method, status, "retry-after:", headers["retry-after"], "cors:", headers["access-control-allow-origin"], "frame:", headers["x-frame-options"]);
}
```

Output of `npx tsx src/check-middleware.ts`

```ts
POST 201 retry-after: undefined cors: http://localhost:5173 frame: DENY
POST 201 retry-after: undefined cors: http://localhost:5173 frame: DENY
POST 429 retry-after: 60 cors: http://localhost:5173 frame: DENY
GET 200 retry-after: undefined cors: http://localhost:5173 frame: DENY
```

The third write got 429, reading still works, and even the 429 carries the security and CORS headers, because both come before the limit.

The shutdown code at the end of `src/server.ts` already follows [the order above](#shutdown): let integrations close long-lived connections (`drainIntegrations`), stop the HTTP server, stop the runtime, exit with 0, or log and exit with 1 on failure. Two small changes finish it:

- Pass `gracefulShutdownTimeout: 20_000` to `createHttpServer`, so requests in progress get 20 seconds, well inside the 30 seconds many platforms wait after `SIGTERM`.
- In `src/app.ts`, add `disposeContainerOnStop: true` to the options of `createRuntime`, next to `handleSignals: false`. `runtime.stop()` then disposes the container after every module has stopped.

The signal loop itself needs no change. It listens with `process.on`, so it hears every `SIGINT` and `SIGTERM`, not only the first. The first one prints `Received SIGINT: shutting down.`, sets `stopping` and starts the shutdown. A second one, for example an impatient second Ctrl + C or a platform that repeats `SIGTERM`, only prints `already shutting down` and returns. With `process.once`, a second signal would find no listener, and Node.js would end the process in the middle of the shutdown. The `Listening` line comes last, after the handlers are registered, so the app never claims to be ready before it can shut down cleanly.

src/server.ts (part)Node.js only

```ts
const server = createHttpServer({
  adapter: createNodeHttpAdapter({ server: httpServer, host: config.host, port: config.port }),
  handler: (request: HttpRequestContext) => pipeline.execute(request, createResponseContext()),
  gracefulShutdownTimeout: 20_000,
});

await server.start();

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) {
      console.log(`Received ${signal} again: already shutting down.`);
      return;
    }
    stopping = true;
    console.log(`Received ${signal}: shutting down.`);
    void drainIntegrations(integrations)
      .then(() => server.stop())
      .then(() => runtime.stop())
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  });
}

console.log(`Listening on http://${config.host}:${server.address?.port ?? config.port}`);
```

Now try the real thing. To let one web app in, start the server with `CORS_ORIGINS` set for that one command:

Terminal on your computer

```bash
$ npx tsx src/check-middleware.ts
POST 201 retry-after: undefined cors: http://localhost:5173 frame: DENY
POST 201 retry-after: undefined cors: http://localhost:5173 frame: DENY
POST 429 retry-after: 60 cors: http://localhost:5173 frame: DENY
GET 200 retry-after: undefined cors: http://localhost:5173 frame: DENY
$ CORS_ORIGINS=http://localhost:5173 npm run dev
…
Listening on http://0.0.0.0:3000
```

In a second terminal, read a task as that web app would, then create 21 tasks in a row. `seq 1 20` counts from 1 to 20, and `-w "%{http_code} "` makes `curl` print only the status:

Second terminal

```bash
$ curl -i http://localhost:3000/tasks/1 -H "origin: http://localhost:5173"
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: http://localhost:5173
vary: Origin
x-content-type-options: nosniff
x-frame-options: DENY
…
content-length: 113
Date: Wed, 23 Sep 2026 22:24:32 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":1,"title":"Read the runtime lesson","done":true,"priority":"normal","createdAt":"2026-09-23T09:00:00.000Z"}
$ for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/tasks -H "content-type: application/json" -d "{\"title\":\"Task number $i\"}"; done; echo
201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201
$ curl -i -X POST http://localhost:3000/tasks -H "content-type: application/json" -d '{"title":"One too many"}'
HTTP/1.1 429 Too Many Requests
retry-after: 60
x-ratelimit-remaining: 0
x-ratelimit-limit: 20
x-ratelimit-reset: 1790202333
content-type: application/json; charset=utf-8
x-content-type-options: nosniff
x-frame-options: DENY
…

{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"},"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}
```

Your own app's origin got the CORS headers, the 21st write got 429 with `Retry-After`, and `curl http://localhost:3000/tasks` still answers 200. `x-ratelimit-reset` is the time the window ends, in seconds since 1970. The loop is for macOS, Linux and Git Bash; on Windows PowerShell, run the `curl.exe` command 21 times with the arrow keys instead. Now press Ctrl + C in the server's terminal:

Terminal on your computer

```ts
^CReceived SIGINT: shutting down.
2026-09-23T22:24:32.979Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
2026-09-23T22:24:32.981Z [INFO] [task-api] All modules stopped. modules=["tasks","store","integrations"] durationMs=1
2026-09-23T22:24:32.982Z [INFO] [task-api] store closed
2026-09-23T22:24:32.982Z [INFO] [task-api] All modules destroyed. durationMs=0
2026-09-23T22:24:32.982Z [INFO] [task-api] Graceful shutdown complete.
2026-09-23T22:24:32.983Z [INFO] [task-api] Runtime stopped. runtimeId=rt_6c293dc75a9e4161bc9c09c1e6597cb5
```

The signal handler announced the shutdown, the HTTP server stopped first (it prints nothing), then the runtime stopped the modules, and the container was disposed last. `timeoutMs=30000` is the runtime's own `shutdownTimeout` for the modules; the 20 seconds you set are for the requests.

## Practice

TRY IT YOURSELF

### A request id on every response

Write a middleware that puts an `x-request-id` header on every response, using `context.request.id`: the unique id `@zudojs/http` gives every request. Test it with two requests made by `createRequestContext`, and check that they get different ids.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`const response = await next(); return response.setHeader("x-request-id", context.request.id);`, the same shape as `served` above.

HINT 2

`setHeader` returns the response, so you can return its result directly; no need for a separate variable if you prefer `return (await next()).setHeader(...)`.

SOLUTION

request-id.tsNode.js only

```ts
import { createRequestContext, createResponseContext, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

const requestId: HttpMiddleware = async (context, next) => {
  const response = await next();
  return response.setHeader("x-request-id", context.request.id);
};

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(requestId, { priority: -100 });
pipeline.use(async (context) => context.response.json({ ok: true }));

const first = createRequestContext({ method: "GET", url: "/tasks" });
const second = createRequestContext({ method: "GET", url: "/tasks" });
const a = await pipeline.execute(first, createResponseContext());
const b = await pipeline.execute(second, createResponseContext());

console.log(a.headers["x-request-id"] === first.id, b.headers["x-request-id"] === second.id);
console.log("different ids:", first.id !== second.id);
console.log(a.headers["x-request-id"]);
```

Output of `npx tsx request-id.ts`

```ts
true true
different ids: true
9b1ccbf4-c024-4eab-873c-dd73f8f8da38
```

The id is a random **UUID**, different on every run. When a user reports an error, they can send you the id from the response, and you can find that exact request in your logs. The [logging lesson](https://zudojs.oyinlola.site/learn/zudo-logging) builds on this.

> NOTE
>
> When a real request arrives with an `X-Request-Id` header of 1 to 128 letters, digits, dots, dashes, underscores or colons, `request.id` reuses it. That way an id set by a proxy or another service in front of yours follows the request through your logs. The adapter refuses a malformed one with 400. Treat the id as a label, never as proof of anything, because any client can choose it. `createNodeHttpAdapter({ trustRequestId: false })` always generates a new one.

TRY IT YOURSELF

### Allow a second origin

The Task API also gets a mobile web app at `https://m.tasks.example.com`. Change the CORS example so it is allowed too, and show that `https://tasks.example.com.evil.example`, which merely *starts* with an allowed origin, is still refused.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Add a second string to the array: `allowOrigin: ["https://tasks.example.com", "https://m.tasks.example.com"]`.

HINT 2

The evil origin stays refused either way: the list is compared exactly, and merely starting with an allowed origin is not the same string.

SOLUTION

cors-two.tsNode.js only

```ts
import { createCorsMiddleware, HttpMiddlewarePipeline } from "@zudojs/http";
import { withServer } from "./serve.js";

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(createCorsMiddleware({ allowOrigin: ["https://tasks.example.com", "https://m.tasks.example.com"] }));
pipeline.use(async (context) => context.response.json([]));

await withServer(pipeline, async (base) => {
  for (const origin of ["https://m.tasks.example.com", "https://tasks.example.com.evil.example"]) {
    const response = await fetch(`${base}/tasks`, { headers: { origin } });
    console.log(origin, "->", response.headers.get("access-control-allow-origin"));
  }
});
```

Output of `npx tsx cors-two.ts`

```ts
https://m.tasks.example.com -> https://m.tasks.example.com
https://tasks.example.com.evil.example -> null
```

The allow-list compares whole origins exactly. Never build your own check with `startsWith` or a loose regular expression: that is exactly the mistake the second origin exploits.

## Recap

- Middleware runs around the route: work before `next()`, work after it, or answer early without calling it. Lower `priority` runs first and wraps the rest.
- `createSecurityMiddleware()` sends a safe set of security headers. Use `max-age=0` for HSTS on a development server that answers over HTTPS.
- `createCorsMiddleware({ allowOrigin: [...] })` allows only listed origins. CORS protects browsers, not your server, and `"*"` with credentials is refused.
- `createRateLimiter` from `@zudojs/security` counts requests per client in a sliding window; `createRateLimitMiddleware` answers 429 with `Retry-After`.
- `server.stop()` refuses new connections and waits for requests in progress. Stop the server, then the runtime, then dispose the container.

The CLI already reads the allowed origins, the general rate limit and the port from settings; only your write limit is still written in the code, and [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) moves it there. First, the checks that must run in more places than HTTP: next, [Middleware pipelines with @zudojs/middleware](https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
