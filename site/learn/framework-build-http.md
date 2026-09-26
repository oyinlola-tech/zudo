---
title: "Build a mini framework, part 2: HTTP — ZudoJS Academy"
description: "Add a router, middleware, controllers, validation, error responses and an event bus to your mini framework, serve it with node:http, and compare it with ZudoJS."
source: https://zudojs.oyinlola.site/learn/framework-build-http
---

LEVEL 11 · LESSON 11 OF 12

Framework engineering Core

# Build a mini framework, part 2: HTTP

Add a router, middleware, controllers, validation, error responses and an event bus to your mini framework, serve it with node:http, and compare it with ZudoJS.

- **60 min** to read and try
- **You need:** Build a mini framework, part 1, Node's HTTP module, and A type-safe event system
- **You build:** The HTTP layer of the mini framework (router with parameters and 405s, middleware pipeline, controllers resolved per request, schema validation, error-to-response mapping, typed event bus, body limits and graceful shutdown) serving the BookStore on a real node:http server

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Match routes with parameters, prefer static segments, and answer 404 and 405 correctly
- Compose middleware into an onion pipeline and explain why order matters
- Validate request bodies against a schema that also produces the handler's types
- Turn every thrown error into a safe, consistent HTTP response
- Serve the application from node:http with a request scope, body limits and a graceful stop
- Compare each piece with @zudojs/http, @zudojs/schema, @zudojs/errors and @zudojs/events

## What node:http leaves to you

In [part 1](https://zudojs.oyinlola.site/learn/framework-build-core) you built the core of a framework: a container, configuration, a logger, a lifecycle and an application object. Its `http` module only pretended to listen. Before building the real one, look at what Node gives you on its own. This is the BookStore's catalog as a plain `node:http` server, the kind of code [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) started from, hit with three ordinary requests:

raw.tsNode.js only

```ts
import { createServer } from "node:http";

const books: Record<string, unknown>[] = [{ id: "b1", title: "Things Fall Apart" }];
process.on("unhandledRejection", (error) => console.log("server: unhandled rejection,", (error as Error).name));

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/books") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(books));
    return;
  }
  if (req.method === "POST" && req.url === "/books") {
    let text = "";
    for await (const chunk of req) text += chunk;
    const book = { id: `b${books.length + 1}`, ...JSON.parse(text) };
    books.push(book);
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify(book));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const url = `http://127.0.0.1:${address.port}`;

console.log("GET /books/ ->", (await fetch(url + "/books/")).status);
const created = await fetch(url + "/books", { method: "POST", body: JSON.stringify({ title: "Kindred", id: "b1", featured: true }) });
console.log("POST /books ->", created.status, await created.text());
await fetch(url + "/books", { method: "POST", body: "{ not json", signal: AbortSignal.timeout(300) }).catch((error: Error) =>
  console.log("client: gave up with", error.name),
);
server.closeAllConnections();
server.close();
```

Output of `npx tsx raw.ts`

```ts
GET /books/ -> 404
POST /books -> 201 {"id":"b1","title":"Kindred","featured":true}
server: unhandled rejection, SyntaxError
client: gave up with TimeoutError
```

- `/books/` with a trailing slash is a 404, because the server compared strings.
- The client chose the book's `id` (a duplicate of `b1`) and added a `featured` flag, because the handler spread the body into the record: mass assignment, as in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers#problem).
- Broken JSON threw inside an `async` callback. Nobody awaited that promise, so it became an **unhandled rejection**, and the client waited until it gave up. This example catches the rejection to keep running. Without that handler, Node ends the whole process: one bad request from anyone takes the shop down for everyone.

An HTTP framework exists to make these mistakes impossible to write by accident. In this part you build its pieces (a router, a middleware pipeline, controllers, validation, error responses and an event bus) on top of part 1, run the BookStore on a real `node:http` server, call it with `fetch`, and compare every piece with ZudoJS.

## What can one request do to your server?

REASON IT OUT

### Think like the client that is trying to break you

Before designing the HTTP layer, list what a single request can contain or cause. For each, decide the status code and who handles it:

- A path that matches no route, and a path that exists but not with this method.
- A path with a broken percent-encoding such as `/books/%E0%A4%A`.
- A body that is not JSON, a body of 2 GB, a body sent as a form instead of JSON.
- Valid JSON with three wrong fields and one field the client may not set.
- A handler that hits a bug: `TypeError: Cannot read properties of undefined`.
- A request that succeeds, after which an e-mail listener fails.
- A request still running when the process receives `SIGTERM`.

**Show the reasoning**

**No route** is 404; **wrong method** is 405 with an `Allow` header, which tells the client what would work. A **malformed path** is the client's fault: 400, not a crash from `decodeURIComponent`.

**Bodies:** non-JSON is 400, too large is 413 (and the server must stop reading, or the limit is useless), the wrong media type is 415. These are checked by the framework before any handler runs.

**Validation** reports *every* problem with its path, and refuses unknown fields rather than ignoring them. That is 400 with details.

**A bug** is 500, and the response says nothing about the bug: no message, no stack, no file names. The details go to the log with a request id, and the response carries the same id so support can find the log line.

**A failing listener** must not turn a successful order into an error response: the book was saved. Isolate listeners and log their failures.

**During shutdown**, stop accepting new connections, let in-flight requests finish, then stop the rest: the lifecycle from part 1 already gives you the order.

## Starting point: part 1's core

Part 2 builds on four files from part 1, unchanged. They are repeated here so this page runs on its own; skip them if you still have them.

mini/container.ts

```ts
export class Token<T> {
  declare readonly __type: T;
  constructor(readonly name: string) {}
}

export type Lifetime = "singleton" | "scoped" | "transient";
type Values<D> = { -readonly [K in keyof D]: D[K] extends Token<infer U> ? U : never };

interface Registration {
  readonly lifetime: Lifetime;
  readonly deps: readonly Token<unknown>[];
  readonly create: (...deps: never[]) => unknown;
}

export interface Resolver {
  resolve<T>(token: Token<T>): T;
}

class Instances {
  readonly byToken = new Map<Token<unknown>, unknown>();
  readonly created: unknown[] = [];

  async dispose(): Promise<void> {
    for (const instance of this.created.reverse()) {
      if (typeof instance === "object" && instance !== null && "dispose" in instance && typeof instance.dispose === "function") {
        await instance.dispose();
      }
    }
    this.byToken.clear();
    this.created.length = 0;
  }
}

export class Container implements Resolver {
  readonly #registrations = new Map<Token<unknown>, Registration>();
  readonly #singletons = new Instances();

  register<T, const D extends readonly Token<unknown>[] = []>(
    token: Token<T>,
    options: { readonly lifetime: Lifetime; readonly deps?: D; readonly factory: (...deps: Values<D>) => T },
  ): this {
    if (this.#registrations.has(token)) throw new Error(`${token.name} is already registered`);
    const { lifetime, deps = [], factory } = options;
    this.#registrations.set(token, { lifetime, deps, create: factory as (...deps: never[]) => unknown });
    return this;
  }

  value<T>(token: Token<T>, value: T): this {
    return this.register(token, { lifetime: "singleton", factory: () => value });
  }

  resolve<T>(token: Token<T>): T {
    return this.#resolve(token, undefined, []);
  }

  createScope(): Resolver & { dispose(): Promise<void> } {
    const scoped = new Instances();
    return { resolve: (token) => this.#resolve(token, scoped, []), dispose: () => scoped.dispose() };
  }

  dispose(): Promise<void> {
    return this.#singletons.dispose();
  }

  #resolve<T>(token: Token<T>, scope: Instances | undefined, path: readonly Token<unknown>[]): T {
    const chain = [...path, token].map((t) => t.name).join(" -> ");
    if (path.includes(token)) throw new Error(`circular dependency: ${chain}`);
    const registration = this.#registrations.get(token);
    if (registration === undefined) throw new Error(`nothing registered for ${token.name} (${chain})`);

    let store: Instances | undefined;
    if (registration.lifetime === "singleton") store = this.#singletons;
    if (registration.lifetime === "scoped") {
      if (path.some((t) => this.#registrations.get(t)?.lifetime === "singleton")) {
        throw new Error(`a singleton cannot depend on scoped ${token.name} (${chain})`);
      }
      if (scope === undefined) throw new Error(`${token.name} is scoped: resolve it from a scope`);
      store = scope;
    }
    if (store?.byToken.has(token)) return store.byToken.get(token) as T;

    const args = registration.deps.map((dep) => this.#resolve(dep, scope, [...path, token]));
    const instance = (registration.create as (...deps: unknown[]) => T)(...args);
    store?.byToken.set(token, instance);
    store?.created.push(instance);
    return instance;
  }
}
```

mini/logger.ts

```ts
export type Level = "debug" | "info" | "warn" | "error";
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /pass(word)?|secret|token|authorization|api_?key/i;
const RESERVED = new Set(["time", "level", "message"]);

export interface LogEntry {
  readonly time: string;
  readonly level: Level;
  readonly message: string;
  readonly [field: string]: unknown;
}

export type Sink = (entry: LogEntry) => void;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  readonly level: Level;
  readonly sink?: Sink;
  readonly clock?: () => Date;
  readonly fields?: Record<string, unknown>;
}

export const jsonLines: Sink = (entry) => console.log(JSON.stringify(entry));

function clean(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !RESERVED.has(key)).map(([key, value]) => {
      if (SECRET_KEY.test(key)) return [key, "[redacted]"];
      if (value instanceof Error) return [key, { name: value.name, message: value.message }];
      return [key, value];
    }),
  );
}

export function createLogger(options: LoggerOptions): Logger {
  const { level, sink = jsonLines, clock = () => new Date(), fields: bound = {} } = options;
  const write = (entryLevel: Level) => (message: string, fields: Record<string, unknown> = {}) => {
    if (RANK[entryLevel] < RANK[level]) return;
    try {
      sink({ time: clock().toISOString(), level: entryLevel, message, ...clean({ ...bound, ...fields }) });
    } catch {
      // A broken sink must never crash the request that tried to log.
    }
  };
  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    child: (fields) => createLogger({ ...options, fields: { ...bound, ...fields } }),
  };
}

export const textLines: Sink = ({ time, level, message, ...fields }) => {
  const extra = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
  console.log(`${level.padEnd(5)} ${message}${extra ? " " + extra : ""}`);
};
```

mini/lifecycle.ts

```ts
import type { Logger } from "./logger.js";

export interface Component {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export type LifecycleState = "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";

export class StartupError extends Error {
  constructor(readonly component: string, options: { cause: unknown }) {
    super(`${component} failed to start`, options);
    this.name = "StartupError";
  }
}

export function startOrder(components: readonly Component[]): Component[] {
  const byName = new Map(components.map((c) => [c.name, c]));
  const ordered: Component[] = [];
  const visiting = new Set<string>();
  const visit = (component: Component, path: readonly string[]): void => {
    if (ordered.includes(component)) return;
    if (visiting.has(component.name)) throw new Error(`circular dependency: ${[...path, component.name].join(" -> ")}`);
    visiting.add(component.name);
    for (const name of component.dependsOn ?? []) {
      const dependency = byName.get(name);
      if (dependency === undefined) throw new Error(`${component.name} depends on ${name}, which is not registered`);
      visit(dependency, [...path, component.name]);
    }
    ordered.push(component);
  };
  for (const component of components) visit(component, []);
  return ordered;
}

async function withTimeout(work: void | Promise<void>, ms: number, what: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class Lifecycle {
  state: LifecycleState = "idle";
  readonly #components: Component[] = [];
  #started: Component[] = [];
  #stopping: Promise<void> | undefined;

  constructor(private readonly log: Logger, private readonly timeoutMs = 5_000) {}

  add(component: Component): void {
    if (this.state !== "idle") throw new Error(`cannot add ${component.name} while ${this.state}`);
    this.#components.push(component);
  }

  async start(): Promise<void> {
    if (this.state !== "idle") throw new Error(`cannot start while ${this.state}`);
    this.state = "starting";
    for (const component of startOrder(this.#components)) {
      try {
        await withTimeout(component.start?.(), this.timeoutMs, `${component.name} start`);
      } catch (error) {
        this.log.error("start failed, rolling back", { component: component.name, error });
        await this.#stopStarted();
        this.state = "failed";
        throw new StartupError(component.name, { cause: error });
      }
      this.#started.push(component);
      this.log.info("started", { component: component.name });
    }
    this.state = "running";
  }

  stop(): Promise<void> {
    if (this.state !== "running") return this.#stopping ?? Promise.resolve();
    this.state = "stopping";
    this.#stopping = this.#stopStarted().then(() => {
      this.state = "stopped";
    });
    return this.#stopping;
  }

  async #stopStarted(): Promise<void> {
    for (const component of this.#started.reverse()) {
      try {
        await withTimeout(component.stop?.(), this.timeoutMs, `${component.name} stop`);
        this.log.info("stopped", { component: component.name });
      } catch (error) {
        this.log.error("stop failed, continuing", { component: component.name, error });
      }
    }
    this.#started = [];
  }
}
```

mini/app.ts

```ts
import { Container, Token } from "./container.js";
import type { Resolver } from "./container.js";
import { Lifecycle } from "./lifecycle.js";
import type { LifecycleState } from "./lifecycle.js";
import type { Logger } from "./logger.js";

export const LOGGER = new Token<Logger>("Logger");

export interface ModuleContext<C> {
  readonly config: C;
  readonly logger: Logger;
  readonly container: Resolver;
}

export interface Module<C> {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  register?(container: Container, config: C): void;
  start?(context: ModuleContext<C>): void | Promise<void>;
  stop?(context: ModuleContext<C>): void | Promise<void>;
}

export interface App {
  readonly state: LifecycleState;
  readonly container: Resolver;
  start(): Promise<void>;
  stop(): Promise<void>;
  stopOnSignals(signals?: readonly NodeJS.Signals[]): void;
}

export function createApp<C>(options: { config: C; logger: Logger; modules: readonly Module<C>[]; timeoutMs?: number }): App {
  const { config, logger, modules } = options;
  const container = new Container().value(LOGGER, logger);
  const lifecycle = new Lifecycle(logger.child({ scope: "lifecycle" }), options.timeoutMs);

  for (const module of modules) {
    module.register?.(container, config);
    const context: ModuleContext<C> = { config, container, logger: logger.child({ module: module.name }) };
    lifecycle.add({
      name: module.name,
      dependsOn: module.dependsOn ?? [],
      start: () => module.start?.(context),
      stop: () => module.stop?.(context),
    });
  }

  return {
    get state() {
      return lifecycle.state;
    },
    container,
    start: () => lifecycle.start(),
    async stop() {
      await lifecycle.stop();
      await container.dispose();
    },
    stopOnSignals(signals = ["SIGINT", "SIGTERM"]) {
      for (const signal of signals) {
        process.once(signal, () => {
          logger.info("signal received, stopping", { signal });
          this.stop().then(
            () => process.exit(0),
            () => process.exit(1),
          );
        });
      }
    },
  };
}
```

## Requests, responses and errors

First the vocabulary every other piece shares. A **context** is everything a handler may know about one request: method, path, parameters, query, headers, the parsed body, a request id, a logger with that id bound, and the request's container scope. A handler returns a plain response object; it never touches Node's `ServerResponse`, so it can be tested without a network. **Middleware** receives the context and a `next` function that runs the rest of the pipeline:

mini/http/types.ts

```ts
import type { Resolver } from "../container.js";
import type { Logger } from "../logger.js";

export interface HttpResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpContext {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
  readonly requestId: string;
  readonly scope: Resolver;
  readonly logger: Logger;
  params: Readonly<Record<string, string>>;
  user?: string;
}

export type Handler = (ctx: HttpContext) => HttpResponse | Promise<HttpResponse>;
export type Middleware = (ctx: HttpContext, next: () => Promise<HttpResponse>) => Promise<HttpResponse>;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, body, headers };
}
```

Errors are how deep code says "this request cannot succeed" without knowing HTTP. `HttpError` carries a status, a stable machine-readable `code` (clients should branch on `"conflict"`, not on an English message) and optional details. `toResponse` is the one place that turns *any* thrown value into a response, and it treats unknown errors as bugs:

mini/http/errors.ts

```ts
import type { HttpContext, HttpResponse, Middleware } from "./types.js";
import { json } from "./types.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} was not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

export function toResponse(error: unknown, ctx: Pick<HttpContext, "requestId" | "logger">): HttpResponse {
  if (error instanceof HttpError) {
    const body = { error: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) };
    return json(error.status, body);
  }
  ctx.logger.error("unhandled error", { error });
  return json(500, { error: "internal_error", message: "Something went wrong", requestId: ctx.requestId });
}

export const handleErrors: Middleware = async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    return toResponse(error, ctx);
  }
};
```

## The router

A router maps a method and a path to a handler, and extracts **path parameters**: `/books/:id` matches `/books/b1` with `id = "b1"`. Two rules make a router predictable. When a static segment and a parameter could both match (`/books/new` and `/books/:id`), the static one wins, whatever the order of registration. And "the path exists but not for this method" is a different answer from "no such path":

mini/http/router.ts

```ts
import { HttpError } from "./errors.js";
import type { Handler, Middleware } from "./types.js";

interface Route {
  readonly method: string;
  readonly segments: readonly string[];
  readonly handler: Handler;
  readonly middleware: readonly Middleware[];
}

export type RouteMatch =
  | { readonly kind: "found"; readonly route: Route; readonly params: Record<string, string> }
  | { readonly kind: "method_not_allowed"; readonly allowed: readonly string[] }
  | { readonly kind: "not_found" };

const split = (path: string) => path.split("/").filter((segment) => segment !== "");

function specificity(route: Route): string {
  return route.segments.map((segment) => (segment.startsWith(":") ? "1" : "2")).join("");
}

export class Router {
  readonly #routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler, middleware: readonly Middleware[] = []): this {
    this.#routes.push({ method: method.toUpperCase(), segments: split(pattern), handler, middleware });
    this.#routes.sort((a, b) => (specificity(a) > specificity(b) ? -1 : specificity(a) < specificity(b) ? 1 : 0));
    return this;
  }

  get(pattern: string, handler: Handler, middleware?: readonly Middleware[]): this {
    return this.add("GET", pattern, handler, middleware);
  }

  post(pattern: string, handler: Handler, middleware?: readonly Middleware[]): this {
    return this.add("POST", pattern, handler, middleware);
  }

  match(method: string, path: string): RouteMatch {
    const parts = split(path);
    const allowed = new Set<string>();
    for (const route of this.#routes) {
      const params = matchSegments(route.segments, parts);
      if (params === undefined) continue;
      if (route.method === method.toUpperCase()) return { kind: "found", route, params };
      allowed.add(route.method);
    }
    return allowed.size > 0 ? { kind: "method_not_allowed", allowed: [...allowed] } : { kind: "not_found" };
  }
}

function matchSegments(segments: readonly string[], parts: readonly string[]): Record<string, string> | undefined {
  if (segments.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, segment] of segments.entries()) {
    const part = parts[i]!;
    if (!segment.startsWith(":")) {
      if (segment !== part) return undefined;
      continue;
    }
    try {
      params[segment.slice(1)] = decodeURIComponent(part);
    } catch {
      throw new HttpError(400, "bad_path", `"${part}" is not a valid path segment`);
    }
  }
  return params;
}
```

- `split` drops empty segments, so `/books/b1/` and `//books/b1` match like `/books/b1`.
- `specificity` scores each segment (static `2`, parameter `1`) and the routes are kept sorted, most specific first. `Array.prototype.sort` is stable, so routes of equal specificity keep their registration order.
- `decodeURIComponent` throws a `URIError` on broken encodings; the router turns that into a 400 instead of a crash.

try-router.ts

```ts
import { Router } from "./mini/http/router.js";
import { json } from "./mini/http/types.js";

const router = new Router()
  .get("/books/:id", () => json(200, "show"))
  .get("/books/new", () => json(200, "form"))
  .get("/authors/:authorId/books/:bookId", () => json(200, "nested"))
  .post("/books", () => json(201, "create"));

function show(method: string, path: string): void {
  try {
    const match = router.match(method, path);
    const detail = match.kind === "found" ? JSON.stringify(match.params) : match.kind === "method_not_allowed" ? match.allowed.join(",") : "";
    console.log(`${method} ${path} -> ${match.kind} ${detail}`);
  } catch (error) {
    console.log(`${method} ${path} -> ${(error as Error).message}`);
  }
}

show("GET", "/books/new");
show("GET", "/books/b1");
show("GET", "/books/b1/");
show("GET", "/authors/chinua%20achebe/books/b1");
show("DELETE", "/books/b1");
show("GET", "/books");
show("GET", "/orders");
show("GET", "/books/%E0%A4%A");
```

Output of `npx tsx try-router.ts` and of the browser terminal

```ts
GET /books/new -> found {}
GET /books/b1 -> found {"id":"b1"}
GET /books/b1/ -> found {"id":"b1"}
GET /authors/chinua%20achebe/books/b1 -> found {"authorId":"chinua achebe","bookId":"b1"}
DELETE /books/b1 -> method_not_allowed GET
GET /books -> method_not_allowed POST
GET /orders -> not_found
GET /books/%E0%A4%A -> "%E0%A4%A" is not a valid path segment
```

This router tries every route in turn, which is fine for dozens of routes. Routers built for thousands of routes use a **radix tree** (a trie of path segments, as in [Tries](https://zudojs.oyinlola.site/learn/dsa-tries)) so matching costs the length of the path, not the number of routes. `@zudojs/http` exports a `RouteTree` of that kind. Whether its `createRouter` actually uses it is something the documentation does not say; [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source) finds out from the code.

## The middleware pipeline

[Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture#middleware) composed middleware with `reduceRight`. Frameworks usually use the **onion** model instead: each middleware gets `next`, may run code before it, may skip it (answering early), and may run code after it with the response in hand. `compose` builds it with one recursive function:

mini/http/pipeline.ts

```ts
import type { Handler, HttpContext, HttpResponse, Middleware } from "./types.js";

export function compose(middleware: readonly Middleware[], handler: Handler): (ctx: HttpContext) => Promise<HttpResponse> {
  return (ctx) => {
    let last = -1;
    const run = async (index: number): Promise<HttpResponse> => {
      if (index <= last) throw new Error("next() was called more than once");
      last = index;
      const current = middleware[index];
      return current ? current(ctx, () => run(index + 1)) : handler(ctx);
    };
    return run(0);
  };
}
```

try-pipeline.ts

```ts
import { compose } from "./mini/http/pipeline.js";
import type { HttpContext, Middleware } from "./mini/http/types.js";
import { json } from "./mini/http/types.js";

const trace = (name: string): Middleware => async (ctx, next) => {
  console.log(`${name}: before`);
  const response = await next();
  console.log(`${name}: after (${response.status})`);
  return response;
};

const closedOnSunday: Middleware = async (ctx, next) => (ctx.query.get("day") === "sunday" ? json(503, "closed") : next());
const twice: Middleware = async (ctx, next) => {
  await next();
  return next();
};

const handler = compose([trace("logging"), trace("auth"), closedOnSunday], () => {
  console.log("handler");
  return json(200, "ok");
});

const ctx = (query: string) => ({ query: new URLSearchParams(query) }) as HttpContext;
console.log("result:", (await handler(ctx("day=monday"))).status);
console.log("result:", (await handler(ctx("day=sunday"))).status);
await compose([twice], () => json(200, "ok"))(ctx("")).catch((error: Error) => console.log("error:", error.message));
```

Output of `npx tsx try-pipeline.ts` and of the browser terminal

```ts
logging: before
auth: before
handler
auth: after (200)
logging: after (200)
result: 200
logging: before
auth: before
auth: after (503)
logging: after (503)
result: 503
error: next() was called more than once
```

Read the order: `logging` is outermost, so it is the first to start and the last to finish, and it saw the 503 that `closedOnSunday` produced without calling `next`. That is why order matters: a logger placed *inside* the error handler never sees the responses the error handler builds. And calling `next` twice would run the handler twice (two orders, two charges), so `compose` refuses.

## Validation that produces types

A request body is `unknown` until it is checked. You wrote parsers by hand in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers). A framework lets you describe the shape once and get two things from that one description: the runtime check and the TypeScript type ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) covers the idea with real libraries). A small schema builder:

mini/http/validation.ts

```ts
import { HttpError } from "./errors.js";
import type { Handler, HttpContext, HttpResponse } from "./types.js";

export interface Issue {
  readonly path: string;
  readonly message: string;
}

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] };

export interface Schema<T> {
  parse(input: unknown, path?: string): Parsed<T>;
  optional(): Schema<T | undefined>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

function define<T>(parse: (input: unknown, path: string) => Parsed<T>): Schema<T> {
  return {
    parse: (input, path = "body") => parse(input, path),
    optional: () => define<T | undefined>((input, path) => (input === undefined ? { ok: true, value: undefined } : parse(input, path))),
  };
}

const fail = (path: string, message: string): Parsed<never> => ({ ok: false, issues: [{ path, message }] });

export const s = {
  string: (min = 1, max = 200) =>
    define<string>((input, path) =>
      typeof input === "string" && input.trim().length >= min && input.length <= max
        ? { ok: true, value: input.trim() }
        : fail(path, `must be text of ${min} to ${max} characters`),
    ),
  integer: (min: number, max: number) =>
    define<number>((input, path) =>
      Number.isSafeInteger(input) && (input as number) >= min && (input as number) <= max
        ? { ok: true, value: input as number }
        : fail(path, `must be a whole number from ${min} to ${max}`),
    ),
  object<Shape extends Record<string, Schema<unknown>>>(shape: Shape) {
    return define<{ [K in keyof Shape]: Infer<Shape[K]> }>((input, path) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) return fail(path, "must be an object");
      const issues: Issue[] = [];
      const value: Record<string, unknown> = {};
      for (const key of Object.keys(input)) {
        if (!(key in shape)) issues.push({ path: `${path}.${key}`, message: "is not allowed" });
      }
      for (const [key, field] of Object.entries(shape)) {
        const result = field.parse((input as Record<string, unknown>)[key], `${path}.${key}`);
        if (result.ok) value[key] = result.value;
        else issues.push(...result.issues);
      }
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as { [K in keyof Shape]: Infer<Shape[K]> } };
    });
  },
};

export function withBody<S extends Schema<unknown>>(
  schema: S,
  handler: (ctx: HttpContext, body: Infer<S>) => HttpResponse | Promise<HttpResponse>,
): Handler {
  return (ctx) => {
    const result = schema.parse(ctx.body);
    if (!result.ok) throw new HttpError(400, "validation_failed", "The request body is invalid", result.issues);
    return handler(ctx, result.value as Infer<S>);
  };
}
```

- Every schema has `parse(input, path)`, which returns a value or a list of issues, each with a path such as `body.priceKobo`.
- `s.object` refuses keys that are not in the shape and checks every field, so one response lists every problem.
- `Infer<S>` extracts the type from a schema with `infer` ([Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types)), and `s.object`'s return type maps each field to its inferred type.
- `withBody(schema, handler)` wraps a handler: it validates `ctx.body` and passes the handler a typed `body`, or throws a 400 `HttpError` with the issues as details.

try-validation.ts

```ts
import { s } from "./mini/http/validation.js";
import type { Infer } from "./mini/http/validation.js";

const NewOrder = s.object({
  bookId: s.string(2, 10),
  quantity: s.integer(1, 5),
  note: s.string(1, 200).optional(),
});
type NewOrder = Infer<typeof NewOrder>;

const inputs: unknown[] = [
  { bookId: "b1", quantity: 2 },
  { bookId: " b2 ", quantity: 1, note: "gift wrap, please" },
  { bookId: "", quantity: 9, admin: true },
  ["b1", 2],
];
for (const input of inputs) {
  const result = NewOrder.parse(input);
  console.log(result.ok ? result.value : result.issues.map((issue) => `${issue.path} ${issue.message}`));
}

const order: NewOrder = { bookId: "b1", quantity: 1, note: undefined };
console.log(Object.keys(order));
```

Output of `npx tsx try-validation.ts` and of the browser terminal

```json
{ bookId: 'b1', quantity: 2, note: undefined }
{ bookId: 'b2', quantity: 1, note: 'gift wrap, please' }
[
  'body.admin is not allowed',
  'body.bookId must be text of 2 to 10 characters',
  'body.quantity must be a whole number from 1 to 5'
]
[ 'body must be an object' ]
[ 'bookId', 'quantity', 'note' ]
```

The text was trimmed, an unknown `admin` field was refused rather than ignored, and all three problems of the third input came back together. The last line shows a limit of this builder: the inferred type makes `note` a *required* key whose value may be `undefined`. Real libraries map optional schemas to optional keys (`note?: string`) with a more elaborate mapped type. The type pays off in the handler, where a typo is a compile error:

validation-types.ts

```ts
import { s, withBody } from "./mini/http/validation.js";
import { json } from "./mini/http/types.js";

const NewOrder = s.object({ bookId: s.string(2, 10), quantity: s.integer(1, 5) });

export const create = withBody(NewOrder, (ctx, body) => {
  const total = body.quantity * body.price;
  return json(201, { bookId: body.bookId.toUpperCase(), total });
});
```

What `npx tsc --noEmit` prints

```ts
validation-types.ts:7:38 - error TS2339: Property 'price' does not exist on type '{ bookId: string; quantity: number; }'.

7   const total = body.quantity * body.price;
                                       ~~~~~


Found 1 error in validation-types.ts:7
```

## The event bus

When a book is added, the search index must be updated and the newsletter team wants to know. The controller should not call either directly: it would grow a dependency for every new reaction, and a failing newsletter service would fail the request. It publishes an event instead. [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events) built a full bus; the framework needs a compact one with two properties: names and payloads checked against an event map, and listener failures isolated and logged:

mini/http/events.ts

```ts
import type { Logger } from "../logger.js";

type Listener<P> = (payload: P) => void | Promise<void>;

export class EventBus<M extends object> {
  readonly #listeners = new Map<keyof M, Listener<never>[]>();

  constructor(private readonly log: Logger) {}

  on<K extends keyof M>(name: K, listener: Listener<M[K]>): () => void {
    this.#listeners.set(name, [...(this.#listeners.get(name) ?? []), listener as Listener<never>]);
    return () => this.#listeners.set(name, (this.#listeners.get(name) ?? []).filter((l) => l !== listener));
  }

  async emit<K extends keyof M>(name: K, payload: M[K]): Promise<{ delivered: number; failed: number }> {
    const listeners = (this.#listeners.get(name) ?? []) as Listener<M[K]>[];
    const results = await Promise.allSettled(listeners.map(async (listener) => listener(payload)));
    const failed = results.filter((result) => result.status === "rejected");
    for (const failure of failed) {
      this.log.error("event listener failed", { event: String(name), error: (failure as PromiseRejectedResult).reason });
    }
    return { delivered: results.length - failed.length, failed: failed.length };
  }
}
```

try-events.ts

```ts
import { EventBus } from "./mini/http/events.js";
import { createLogger } from "./mini/logger.js";

interface ShopEvents {
  "order.placed": { orderId: string; totalKobo: number };
  "stock.low": { bookId: string; left: number };
}

const logger = createLogger({ level: "error", sink: ({ message, event, error }) => console.log(`[log] ${message}: ${String(event)}`, error) });
const bus = new EventBus<ShopEvents>(logger);

bus.on("order.placed", (order) => console.log(`receipt for ${order.orderId}: ${order.totalKobo / 100} naira`));
bus.on("order.placed", async () => {
  throw new Error("SMS gateway down");
});
const off = bus.on("stock.low", (stock) => console.log(`reorder ${stock.bookId}, ${stock.left} left`));

console.log(await bus.emit("order.placed", { orderId: "ord-1", totalKobo: 900_000 }));
console.log(await bus.emit("stock.low", { bookId: "b1", left: 2 }));
off();
console.log(await bus.emit("stock.low", { bookId: "b1", left: 1 }));
```

Output of `npx tsx try-events.ts` and of the browser terminal

```ts
receipt for ord-1: 9000 naira
[log] event listener failed: order.placed { name: 'Error', message: 'SMS gateway down' }
{ delivered: 1, failed: 1 }
reorder b1, 2 left
{ delivered: 1, failed: 0 }
{ delivered: 0, failed: 0 }
```

The failing SMS listener was logged and counted, and the receipt listener still ran. `on` returns an unsubscribe function, and after calling it nobody received the second `stock.low`. The event map also checks every call site:

events-types.ts

```ts
import { EventBus } from "./mini/http/events.js";
import { createLogger } from "./mini/logger.js";

interface ShopEvents {
  "order.placed": { orderId: string; totalKobo: number };
}

const bus = new EventBus<ShopEvents>(createLogger({ level: "error" }));
await bus.emit("order.placed", { orderId: "ord-1", total: 900_000 });
await bus.emit("order.shipped", { orderId: "ord-1" });
```

What `npx tsc --noEmit` prints

```ts
events-types.ts:9:52 - error TS2353: Object literal may only specify known properties, and 'total' does not exist in type '{ orderId: string; totalKobo: number; }'.

9 await bus.emit("order.placed", { orderId: "ord-1", total: 900_000 });
                                                     ~~~~~

events-types.ts:10:16 - error TS2345: Argument of type '"order.shipped"' is not assignable to parameter of type '"order.placed"'.

10 await bus.emit("order.shipped", { orderId: "ord-1" });
                  ~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: events-types.ts:9
```

> NOTE
>
> This bus runs listeners inside the request that emitted the event, so a slow listener slows the response. For work that may take long or must survive a crash (e-mails, payments), publish to a queue or an outbox instead, as in [Architecture styles](https://zudojs.oyinlola.site/learn/arch-styles#messaging).

## The server adapter

Everything so far is plain TypeScript with no network. The adapter connects it to `node:http`, and it is where the framework enforces the rules from the reasoning section. For each request it creates a request id and a child logger, reads the body with a size limit and a media-type check, opens a **container scope** for the request, runs the pipeline, writes the response, and disposes the scope, even when something failed. `httpModule` packages the server as a part 1 module, so the lifecycle starts it last and stops it first:

mini/http/server.ts

```ts
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Module } from "../app.js";
import type { Container } from "../container.js";
import type { Logger } from "../logger.js";
import { HttpError, toResponse } from "./errors.js";
import { compose } from "./pipeline.js";
import type { Router } from "./router.js";
import type { Handler, HttpContext, HttpResponse, Middleware } from "./types.js";
import { json } from "./types.js";

export interface HttpOptions {
  readonly router: Router;
  readonly middleware?: readonly Middleware[];
  readonly bodyLimit?: number;
}

async function readBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "body_too_large", `The body is larger than ${limit} bytes`);
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  if (!(request.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "The body is not valid JSON");
  }
}

function routeTo(router: Router): Handler {
  return (ctx) => {
    const match = router.match(ctx.method, ctx.path);
    if (match.kind === "not_found") throw new HttpError(404, "route_not_found", `No route for ${ctx.method} ${ctx.path}`);
    if (match.kind === "method_not_allowed") {
      return json(405, { error: "method_not_allowed", allowed: match.allowed }, { allow: match.allowed.join(", ") });
    }
    ctx.params = match.params;
    return compose(match.route.middleware, match.route.handler)(ctx);
  };
}

export function createRequestHandler(container: Container, logger: Logger, options: HttpOptions) {
  const pipeline = compose(options.middleware ?? [], routeTo(options.router));
  let counter = 0;
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const requestId = `req-${++counter}`;
    const log = logger.child({ requestId });
    const scope = container.createScope();
    let result: HttpResponse;
    try {
      const ctx: HttpContext = {
        method: request.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers as Record<string, string | undefined>,
        body: await readBody(request, options.bodyLimit ?? 1_000_000),
        requestId,
        scope,
        logger: log,
        params: {},
      };
      result = await pipeline(ctx);
    } catch (error) {
      result = toResponse(error, { requestId, logger: log });
    } finally {
      await scope.dispose();
    }
    const payload = result.body === undefined ? "" : JSON.stringify(result.body);
    response.writeHead(result.status, {
      ...result.headers,
      "x-request-id": requestId,
      ...(payload ? { "content-type": "application/json; charset=utf-8" } : {}),
    });
    response.end(payload);
  };
}

export function httpModule<C extends { readonly port: number }>(options: HttpOptions & { readonly dependsOn?: readonly string[] }) {
  let server: Server | undefined;
  let container: Container | undefined;
  const module: Module<C> & { url(): string } = {
    name: "http",
    dependsOn: options.dependsOn ?? [],
    register(registry) {
      container = registry;
    },
    async start({ config, logger }) {
      server = createServer(createRequestHandler(container!, logger, options));
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(config.port, "127.0.0.1", () => resolve());
      });
      logger.info("listening");
    },
    async stop({ logger }) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
        server?.closeIdleConnections();
      });
      logger.info("closed");
    },
    url() {
      const address = server?.address();
      if (!address || typeof address === "string") throw new Error("the server is not listening");
      return `http://127.0.0.1:${address.port}`;
    },
  };
  return module;
}
```

- `readBody` counts bytes as they arrive and throws 413 as soon as the limit is passed, instead of buffering 2 GB first.
- The outer `try`/`catch` is the last line of defence: even an error thrown outside every middleware becomes a response through `toResponse`, so no request can hang or crash the process.
- `register` is the one hook that receives the concrete `Container` (with `createScope`); the module keeps it for the request handler.
- `stop` calls `server.close()`, which stops accepting connections and waits for in-flight requests, and `closeIdleConnections()`, which drops kept-alive connections that are not doing anything.
- Listening on port `0` asks the operating system for any free port; `url()` reads which one it got. Tests use this so they never collide.

## Controllers and the BookStore

A **controller** groups the handlers of one resource and receives its services through its constructor. Registering it as *scoped* means the container builds one per request, inside the request's scope, so it may safely depend on request-scoped things such as a transaction or the current user. `action(token, pick)` resolves the controller from `ctx.scope` and calls one of its handlers:

books.ts

```ts
import type { Module } from "./mini/app.js";
import { LOGGER } from "./mini/app.js";
import { Token } from "./mini/container.js";
import { conflict, HttpError, notFound } from "./mini/http/errors.js";
import { EventBus } from "./mini/http/events.js";
import type { Handler, Middleware } from "./mini/http/types.js";
import { json } from "./mini/http/types.js";
import { s, withBody } from "./mini/http/validation.js";
import type { Infer } from "./mini/http/validation.js";

export interface Book {
  readonly id: string;
  readonly title: string;
  readonly priceKobo: number;
}

export interface ShopEvents {
  "book.added": Book;
}

export class BookCatalog {
  readonly #books = new Map<string, Book>([["b1", { id: "b1", title: "Things Fall Apart", priceKobo: 450_000 }]]);

  list(): Book[] {
    return [...this.#books.values()];
  }

  find(id: string): Book | undefined {
    return this.#books.get(id);
  }

  add(title: string, priceKobo: number): Book {
    if (this.list().some((book) => book.title === title)) throw conflict(`"${title}" is already in the catalog`);
    const book = { id: `b${this.#books.size + 1}`, title, priceKobo };
    this.#books.set(book.id, book);
    return book;
  }
}

export const NewBook = s.object({ title: s.string(1, 120), priceKobo: s.integer(100, 10_000_000) });
export type NewBook = Infer<typeof NewBook>;

export class BooksController {
  constructor(private readonly catalog: BookCatalog, private readonly events: EventBus<ShopEvents>) {}

  list: Handler = () => json(200, this.catalog.list());

  show: Handler = (ctx) => {
    const book = this.catalog.find(ctx.params["id"] ?? "");
    if (book === undefined) throw notFound(`Book ${ctx.params["id"]}`);
    return json(200, book);
  };

  create = withBody(NewBook, async (ctx, body) => {
    const book = this.catalog.add(body.title, body.priceKobo);
    await this.events.emit("book.added", book);
    ctx.logger.info("book added", { bookId: book.id, by: ctx.user });
    return json(201, book, { location: `/books/${book.id}` });
  });
}

export const CATALOG = new Token<BookCatalog>("BookCatalog");
export const EVENTS = new Token<EventBus<ShopEvents>>("EventBus");
export const BOOKS_CONTROLLER = new Token<BooksController>("BooksController");

export function action<T>(token: Token<T>, pick: (controller: T) => Handler): Handler {
  return (ctx) => pick(ctx.scope.resolve(token))(ctx);
}

export const requireStaff: Middleware = async (ctx, next) => {
  const key = ctx.headers["x-api-key"];
  if (key !== "staff-key-123") throw new HttpError(401, "unauthenticated", "Send a valid X-Api-Key header");
  ctx.user = "staff";
  return next();
};

export const logRequests: Middleware = async (ctx, next) => {
  const response = await next();
  ctx.logger.info(`${ctx.method} ${ctx.path}`, { status: response.status });
  return response;
};

export const catalogModule: Module<{ port: number }> = {
  name: "catalog",
  register(container) {
    container
      .register(CATALOG, { lifetime: "singleton", factory: () => new BookCatalog() })
      .register(EVENTS, { lifetime: "singleton", deps: [LOGGER], factory: (log) => new EventBus<ShopEvents>(log) })
      .register(BOOKS_CONTROLLER, { lifetime: "scoped", deps: [CATALOG, EVENTS], factory: (c, e) => new BooksController(c, e) });
  },
  start({ container, logger }) {
    const events = container.resolve(EVENTS);
    events.on("book.added", (book) => logger.info("search index updated", { bookId: book.id }));
    events.on("book.added", () => {
      throw new Error("newsletter service unreachable");
    });
  },
};
```

The catalog module registers the services and subscribes two listeners: the search index, and a newsletter listener whose service is down. Now the whole application on a real server, called with `fetch`. The middleware order is deliberate: `logRequests` outside `handleErrors`, so error responses are logged too, and `requireStaff` only on the route that changes data:

run-bookstore.tsNode.js only

```ts
import { action, BOOKS_CONTROLLER, catalogModule, logRequests, requireStaff } from "./books.js";
import { createApp } from "./mini/app.js";
import { handleErrors } from "./mini/http/errors.js";
import { Router } from "./mini/http/router.js";
import { httpModule } from "./mini/http/server.js";
import { createLogger, textLines } from "./mini/logger.js";

const router = new Router()
  .get("/books", action(BOOKS_CONTROLLER, (c) => c.list))
  .get("/books/:id", action(BOOKS_CONTROLLER, (c) => c.show))
  .post("/books", action(BOOKS_CONTROLLER, (c) => c.create), [requireStaff]);

const http = httpModule({ router, middleware: [logRequests, handleErrors], dependsOn: ["catalog"] });
const logger = createLogger({ level: "info", sink: textLines });
const app = createApp({ config: { port: 0 }, logger, modules: [http, catalogModule] });
await app.start();

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<void> {
  const init: RequestInit = { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const response = await fetch(http.url() + path, init);
  console.log(`=> ${method} ${path} ${response.status} ${await response.text()}`);
}

const staff = { "x-api-key": "staff-key-123" };
await call("GET", "/books/b1");
await call("POST", "/books", { title: "Purple Hibiscus", priceKobo: 520_000 }, staff);
await call("POST", "/books", { title: "Purple Hibiscus", priceKobo: 520_000 }, staff);
await call("POST", "/books", { title: "", priceKobo: 5, isbn: "978" }, staff);
await call("POST", "/books", "{ not json", staff);
await call("POST", "/books", { title: "Americanah", priceKobo: 600_000 });
await call("DELETE", "/books/b1");
await call("GET", "/books/b9");
await app.stop();
```

Output of `npx tsx run-bookstore.ts`

```ts
info  started scope="lifecycle" component="catalog"
info  listening module="http"
info  started scope="lifecycle" component="http"
info  GET /books/b1 module="http" requestId="req-1" status=200
=> GET /books/b1 200 {"id":"b1","title":"Things Fall Apart","priceKobo":450000}
info  search index updated module="catalog" bookId="b2"
error event listener failed event="book.added" error={"name":"Error","message":"newsletter service unreachable"}
info  book added module="http" requestId="req-2" bookId="b2" by="staff"
info  POST /books module="http" requestId="req-2" status=201
=> POST /books 201 {"id":"b2","title":"Purple Hibiscus","priceKobo":520000}
info  POST /books module="http" requestId="req-3" status=409
=> POST /books 409 {"error":"conflict","message":"\"Purple Hibiscus\" is already in the catalog"}
info  POST /books module="http" requestId="req-4" status=400
=> POST /books 400 {"error":"validation_failed","message":"The request body is invalid","details":[{"path":"body.isbn","message":"is not allowed"},{"path":"body.title","message":"must be text of 1 to 120 characters"},{"path":"body.priceKobo","message":"must be a whole number from 100 to 10000000"}]}
=> POST /books 400 {"error":"invalid_json","message":"The body is not valid JSON"}
info  POST /books module="http" requestId="req-6" status=401
=> POST /books 401 {"error":"unauthenticated","message":"Send a valid X-Api-Key header"}
info  DELETE /books/b1 module="http" requestId="req-7" status=405
=> DELETE /books/b1 405 {"error":"method_not_allowed","allowed":["GET"]}
info  GET /books/b9 module="http" requestId="req-8" status=404
=> GET /books/b9 404 {"error":"not_found","message":"Book b9 was not found"}
info  closed module="http"
info  stopped scope="lifecycle" component="http"
info  stopped scope="lifecycle" component="catalog"
```

Every line of the reasoning section is in this output. The new book was saved and announced; the broken newsletter listener was logged and the customer still got a 201 with a `Location`. The duplicate is a 409, the bad body a 400 listing all three problems (including the refused `isbn`), broken JSON a 400, the missing key a 401, the wrong method a 405, the unknown book a 404. Each request's log lines carry its request id, and the server stopped last-in, first-out.

### Limits and a graceful stop

Two behaviours are easier to see in a separate app: the body limits, and what happens to a request that is still running when the app stops:

try-limits.tsNode.js only

```ts
import { createApp } from "./mini/app.js";
import { handleErrors } from "./mini/http/errors.js";
import { Router } from "./mini/http/router.js";
import { httpModule } from "./mini/http/server.js";
import { json } from "./mini/http/types.js";
import { createLogger, textLines } from "./mini/logger.js";

let arrived!: () => void;
let finishReport!: () => void;
const reportArrived = new Promise<void>((resolve) => (arrived = resolve));

const router = new Router()
  .post("/echo", (ctx) => json(200, ctx.body))
  .get("/report", async () => {
    arrived();
    await new Promise<void>((resolve) => (finishReport = resolve));
    return json(200, { rows: 3 });
  });

const http = httpModule({ router, middleware: [handleErrors], bodyLimit: 64 });
const app = createApp({ config: { port: 0 }, logger: createLogger({ level: "warn", sink: textLines }), modules: [http] });
await app.start();
const url = http.url();

const post = (body: string, type = "application/json") => fetch(url + "/echo", { method: "POST", headers: { "content-type": type }, body });
for (const response of [await post('{"title":"Kindred"}'), await post(JSON.stringify({ title: "x".repeat(100) })), await post("title=Kindred", "text/plain")]) {
  console.log(response.status, await response.text());
}

const slow = fetch(url + "/report");
await reportArrived;
const stopping = app.stop();
finishReport();
const response = await slow;
console.log("in-flight request:", response.status, await response.text());
await stopping;
await fetch(url + "/report").catch((error: Error) => console.log("after stop:", error.name, (error.cause as { code?: string }).code));
```

Output of `npx tsx try-limits.ts`

```ts
200 {"title":"Kindred"}
413 {"error":"body_too_large","message":"The body is larger than 64 bytes"}
415 {"error":"unsupported_media_type","message":"Send JSON with Content-Type: application/json"}
in-flight request: 200 {"rows":3}
after stop: TypeError ECONNREFUSED
```

The 100-character title pushed the body past the 64-byte limit: 413. A form body: 415. Then `app.stop()` was called while `/report` was still working; the server stopped accepting connections but let that request finish with its 200. Once stopped, a new connection is refused. In production, the orchestrator sends `SIGTERM`, part 1's `stopOnSignals` calls `stop()`, and customers mid-checkout still get their answer.

## Testing the HTTP layer

Because handlers, routers and middleware are plain functions over plain objects, most of the framework is tested without a server. `run-bookstore.ts` above is the other kind: an end-to-end test through a real port, which checks the wiring. Keep many of the first and a few of the second:

tests/http.test.ts

```ts
import { HttpError, toResponse } from "../mini/http/errors.js";
import { Router } from "../mini/http/router.js";
import { json } from "../mini/http/types.js";
import { s } from "../mini/http/validation.js";
import { createLogger } from "../mini/logger.js";

async function test(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function expect(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

await test("a static segment beats a parameter, whatever the order of registration", () => {
  const router = new Router().get("/books/:id", () => json(200, "show")).get("/books/new", () => json(200, "form"));
  const match = router.match("GET", "/books/new");
  expect(match.kind === "found" && match.params, {});
});

await test("a wrong method is 405 with the allowed methods, not 404", () => {
  const router = new Router().get("/books", () => json(200, [])).post("/books", () => json(201, {}));
  expect(router.match("PATCH", "/books"), { kind: "method_not_allowed", allowed: ["GET", "POST"] });
});

await test("validation reports every problem with its path", () => {
  const result = s.object({ title: s.string(), priceKobo: s.integer(100, 1_000_000) }).parse({ priceKobo: 5, id: 7 });
  expect(result.ok ? [] : result.issues.map((issue) => issue.path), ["body.id", "body.title", "body.priceKobo"]);
});

await test("an unexpected error becomes a 500 that leaks nothing", () => {
  const logged: string[] = [];
  const logger = createLogger({ level: "error", sink: (entry) => logged.push(entry.message) });
  const response = toResponse(new TypeError("Cannot read properties of undefined (reading 'priceKobo')"), { requestId: "req-9", logger });
  expect(response.body, { error: "internal_error", message: "Something went wrong", requestId: "req-9" });
  expect(logged, ["unhandled error"]);
});

await test("an HttpError keeps its status, code and details", () => {
  const response = toResponse(new HttpError(409, "conflict", "already there", { title: "Kindred" }), { requestId: "req-1", logger: createLogger({ level: "error" }) });
  expect([response.status, response.body], [409, { error: "conflict", message: "already there", details: { title: "Kindred" } }]);
});
```

Output of `npx tsx tests/http.test.ts` and of the browser terminal

```ts
PASS a static segment beats a parameter, whatever the order of registration
PASS a wrong method is 405 with the allowed methods, not 404
PASS validation reports every problem with its path
PASS an unexpected error becomes a 500 that leaks nothing
PASS an HttpError keeps its status, code and details
```

The fourth test is the security property that matters most: the `TypeError`'s message, which names an internal field, reached the log and not the response.

## The same BookStore on ZudoJS

Here is the same catalog on the published packages: `@zudojs/http` for routing, middleware and the server, `@zudojs/schema` for validation, `@zudojs/errors` for errors that know their status, and `@zudojs/events` for the event:

zudo-bookstore.tsNode.js only

```ts
import { ConflictError, NotFoundError, UnauthorizedError } from "@zudojs/errors";
import { createEventBus, defineEvent } from "@zudojs/events";
import { badRequest, createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware, HttpRequestContext } from "@zudojs/http";
import { schema } from "@zudojs/schema";

const books = new Map([["b1", { id: "b1", title: "Things Fall Apart", priceKobo: 450_000 }]]);
const NewBook = schema.object({ title: schema.string().trim().min(1).max(120), priceKobo: schema.number().int().min(100).max(10_000_000) }).strict();
const BookAdded = defineEvent<"book.added", { id: string; title: string }>("book.added");

const events = createEventBus();
events.on("book.added", () => console.log("  [event] search index updated"));

function readJson(request: HttpRequestContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(request.body as Uint8Array));
  } catch {
    throw badRequest("The body is not valid JSON");
  }
}

const requireStaff: HttpMiddleware = async (ctx, next) => {
  if (ctx.request.getHeader("x-api-key") !== "staff-key-123") throw new UnauthorizedError("Send a valid X-Api-Key header");
  return next();
};

const router = createRouter();
router.get("/books/:id", (ctx) => {
  const book = books.get(ctx.params.id ?? "");
  if (!book) throw new NotFoundError(`Book ${ctx.params.id} was not found`);
  return book;
});
router.post("/books", async (ctx) => {
  const result = NewBook.safeParse(readJson(ctx.request));
  if (!result.success) {
    return createResponseContext({ status: 400 }).json({ error: "validation_failed", details: result.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`) });
  }
  if ([...books.values()].some((b) => b.title === result.data.title)) throw new ConflictError(`"${result.data.title}" is already in the catalog`);
  const book = { id: `b${books.size + 1}`, ...result.data };
  books.set(book.id, book);
  await events.publish(BookAdded.create({ id: book.id, title: book.title }));
  return createResponseContext({ status: 201 }).json(book);
}, { middleware: [requireStaff] });

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;
const staff = { "x-api-key": "staff-key-123", "content-type": "application/json" };

for (const [method, path, body, headers] of [
  ["GET", "/books/b1", undefined, {}],
  ["POST", "/books", { title: "Purple Hibiscus", priceKobo: 520_000 }, staff],
  ["POST", "/books", { title: "Purple Hibiscus", priceKobo: 520_000 }, staff],
  ["POST", "/books", { title: "", priceKobo: 5, isbn: "978" }, staff],
  ["POST", "/books", { title: "Americanah", priceKobo: 600_000 }, { "content-type": "application/json" }],
  ["DELETE", "/books/b1", undefined, {}],
  ["GET", "/books/b9", undefined, {}],
] as const) {
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  console.log(`=> ${method} ${path} ${response.status} ${await response.text()}`);
}
await server.stop();
```

Output of `npx tsx zudo-bookstore.ts`

```ts
=> GET /books/b1 200 {"id":"b1","title":"Things Fall Apart","priceKobo":450000}
  [event] search index updated
=> POST /books 201 {"id":"b2","title":"Purple Hibiscus","priceKobo":520000}
=> POST /books 409 {"error":"\"Purple Hibiscus\" is already in the catalog","code":"ERR_CONFLICT"}
=> POST /books 400 {"error":"validation_failed","details":["title: String must be at least 1 character","priceKobo: Expected >= 100, received 5","(body): Unknown key: isbn"]}
=> POST /books 401 {"error":"Send a valid X-Api-Key header","code":"ERR_HTTP_UNAUTHORIZED"}
=> DELETE /books/b1 405 {"error":"Method Not Allowed","code":"METHOD_NOT_ALLOWED","method":"DELETE","path":"/books/b1","allowed":["GET","HEAD","OPTIONS"]}
=> GET /books/b9 404 {"error":"Book b9 was not found","code":"ERR_RESOURCE_NOT_FOUND"}
```

The same statuses for the same requests, from the same ideas. The differences are instructive:

| Piece | Your mini framework | ZudoJS |
| --- | --- | --- |
| Router | Linear search, static beats parameter, 404 vs 405 | `createRouter()`: routes ranked by specificity (literal, then parameter, then wildcard), optional and constrained parameters, wildcards, automatic `HEAD` and `OPTIONS`, 405 with `allowed`, groups, route-level middleware through `{ middleware: [...] }` |
| Handlers | Return `json(status, body)` | Return plain data (sent as 200 JSON) or a `createResponseContext({ status })` response |
| Middleware | `compose`, order by position | `HttpMiddlewarePipeline` with priorities, plus ready-made security and CORS middleware and compression helpers |
| Body | Parsed JSON, limit, 415 for other types | Raw bytes (`Uint8Array`) with a size limit; you decode and parse, so the handler decides what a body means |
| Validation | `s.object`, `withBody` | `@zudojs/schema`: `schema.object(...).strict()`, `safeParse` with issues and paths, `Infer`, coercion, transforms |
| Errors | `HttpError` with status and code | `NotFoundError`, `ConflictError`, `UnauthorizedError` … from `@zudojs/errors`, mapped to status and a stable `code` such as `ERR_CONFLICT` |
| Events | `EventBus<Map>`, isolated listeners | `createEventBus()` with `defineEvent`, ids, timestamps, priorities, wildcards and a publish result |

The response bodies differ in shape: ZudoJS puts the message in `error` and the machine code in `code`, where yours put the code in `error`. Neither is right in general; what matters is that one API uses one shape everywhere, which is why the mapping lives in the framework. [HTTP with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-http) and [Routing in depth](https://zudojs.oyinlola.site/learn/zudo-routing) cover the package in full.

## What a production HTTP framework adds

- **Timeouts on the connection itself.** A client that sends one header byte per minute (the "slowloris" attack) holds a connection forever. Node's `server.headersTimeout` and `server.requestTimeout` exist for this; a framework sets sane values.
- **Streaming.** Your adapter buffers the whole body and the whole response. File uploads and large downloads need streams ([Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams)).
- **Security middleware.** Security headers, CORS, CSRF protection, rate limits (the first exercise), trusted proxies for the client's IP. [Security in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-security) covers the package that provides them.
- **HEAD and OPTIONS** answered automatically, content negotiation, compression, ETags and caching headers.
- **Typed route parameters.** A template literal type can turn `"/books/:id"` into `{ id: string }`, so `ctx.params.id` is checked ([Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals)).
- **Contracts.** The same schemas that validate requests can generate an OpenAPI document for clients ([OpenAPI with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-openapi)).

## Practice

TRY IT YOURSELF

### A rate-limiting middleware

Write `rateLimit(max, windowMs, now)`: at most `max` requests per API key per fixed window; the next ones get 429 with a `Retry-After` header in seconds. Take the clock as a parameter and test it with `compose`, without a server.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Start or reset the window: `let window = windows.get(key); if (window === undefined || time - window.start >= windowMs) { window = { start: time, count: 0 }; windows.set(key, window); }`, then `window.count++;`.

HINT 2

`if (window.count > max) { const retryAfter = Math.ceil((window.start + windowMs - time) / 1000); return json(429, { error: "too_many_requests" }, { "retry-after": String(retryAfter) }); } return next();`.

SOLUTION

rate-limit.ts

```ts
import { compose } from "./mini/http/pipeline.js";
import type { HttpContext, Middleware } from "./mini/http/types.js";
import { json } from "./mini/http/types.js";

function rateLimit(max: number, windowMs: number, now: () => number): Middleware {
  const windows = new Map<string, { start: number; count: number }>();
  return async (ctx, next) => {
    const key = ctx.headers["x-api-key"] ?? "anonymous";
    const time = now();
    let window = windows.get(key);
    if (window === undefined || time - window.start >= windowMs) {
      window = { start: time, count: 0 };
      windows.set(key, window);
    }
    window.count++;
    if (window.count > max) {
      const retryAfter = Math.ceil((window.start + windowMs - time) / 1000);
      return json(429, { error: "too_many_requests" }, { "retry-after": String(retryAfter) });
    }
    return next();
  };
}

let clock = 0;
const handler = compose([rateLimit(3, 60_000, () => clock)], () => json(200, "ok"));
const request = (key: string) => ({ headers: { "x-api-key": key } }) as unknown as HttpContext;

const seen: string[] = [];
for (let i = 1; i <= 5; i++) {
  const response = await handler(request("ada"));
  seen.push(`${response.status}${response.headers?.["retry-after"] ? ` (retry after ${response.headers["retry-after"]}s)` : ""}`);
  clock += 10_000;
}
console.log("ada:", seen.join(", "));
console.log("tunde:", (await handler(request("tunde"))).status);
clock = 60_000;
console.log("ada, a minute later:", (await handler(request("ada"))).status);
```

Output of `npx tsx rate-limit.ts` and of the browser terminal

```ts
ada: 200, 200, 200, 429 (retry after 30s), 429 (retry after 20s)
tunde: 200
ada, a minute later: 200
```

Each key has its own window, so Tunde is not punished for Ada's requests, and the window resets after a minute. This is the fixed-window algorithm; [Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting) compares it with sliding windows and token buckets. With several server processes, the counters must live in a shared store such as Redis, or each process allows `max` on its own.

TRY IT YOURSELF

### Lists in the schema builder

Add `array(item, max)` to the validation builder, as a separate function that returns a `Schema<T[]>`. Issues inside the list must carry their index, like `body.items[1].quantity`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard first, in order: `if (!Array.isArray(input)) return { ok: false, issues: [{ path, message: "must be a list" }] }; if (input.length > max) return { ok: false, issues: [{ path, message: \`must have at most ${max} items\` }] };`.

HINT 2

Then walk the array: `input.forEach((element, index) => { const result = item.parse(element, \`${path}[${index}]\`); if (result.ok) value.push(result.value); else issues.push(...result.issues); });`, and return based on whether `issues` collected anything.

SOLUTION

array-schema.ts

```ts
import type { Issue, Schema } from "./mini/http/validation.js";
import { s } from "./mini/http/validation.js";

function array<T>(item: Schema<T>, max: number): Schema<T[]> {
  const schema: Schema<T[]> = {
    parse(input, path = "body") {
      if (!Array.isArray(input)) return { ok: false, issues: [{ path, message: "must be a list" }] };
      if (input.length > max) return { ok: false, issues: [{ path, message: `must have at most ${max} items` }] };
      const issues: Issue[] = [];
      const value: T[] = [];
      input.forEach((element, index) => {
        const result = item.parse(element, `${path}[${index}]`);
        if (result.ok) value.push(result.value);
        else issues.push(...result.issues);
      });
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
    },
    optional() {
      return {
        parse: (input, path) => (input === undefined ? { ok: true, value: undefined } : schema.parse(input, path)),
        optional() {
          return this;
        },
      };
    },
  };
  return schema;
}

const Cart = s.object({ items: array(s.object({ bookId: s.string(2, 10), quantity: s.integer(1, 5) }), 3) });
for (const input of [
  { items: [{ bookId: "b1", quantity: 2 }] },
  { items: [{ bookId: "b1", quantity: 2 }, { bookId: "", quantity: 9 }] },
  { items: [1, 2, 3, 4] },
]) {
  const result = Cart.parse(input);
  console.log(result.ok ? JSON.stringify(result.value) : result.issues.map((i) => `${i.path} ${i.message}`).join("; "));
}
```

Output of `npx tsx array-schema.ts` and of the browser terminal

```json
{"items":[{"bookId":"b1","quantity":2}]}
body.items[1].bookId must be text of 2 to 10 characters; body.items[1].quantity must be a whole number from 1 to 5
body.items must have at most 3 items
```

The item schema receives the path with the index, so nested problems point at the exact element. The length check comes first: a list of 10,000 items should be refused before 10,000 items are validated.

TRY IT YOURSELF

### Where does it belong?

For each requirement, choose router, global middleware, route middleware, controller, service or event listener: (1) every response gets an `X-Request-Id` header; (2) only staff may add books; (3) a book's price may not drop more than 50% at once; (4) `/books/:id` answers 400 for an id that is not `b` followed by digits; (5) the sales dashboard counts new books; (6) requests over 100 per minute get 429.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask: does this apply to every route or one route, is it about HTTP shapes or business rules, and could something outside HTTP (a CLI, a bulk import) need the same rule?

HINT 2

(3) and (5) are not about requests or responses at all; re-read [Clean architecture](https://zudojs.oyinlola.site/learn/arch-clean) for where a rule that must hold everywhere, and a fact other features react to, each belong.

SOLUTION

1. **Framework or global middleware**: it is the same for every route. Your adapter already does it.
2. **Route middleware** (`requireStaff`) for authentication; if the rule gets richer ("editors may add, only admins may delete"), the authorization check moves into the service.
3. **Service or domain**: it is a business rule. The CLI and a bulk import must obey it too, so it cannot live in HTTP code ([Clean architecture](https://zudojs.oyinlola.site/learn/arch-clean)).
4. **Controller**, with a schema for the parameters: validating input is the HTTP layer's job.
5. **Event listener** on `book.added`: the controller should not know the dashboard exists.
6. **Global middleware**, placed early, so rejected requests cost as little as possible.

## Recap

- Raw `node:http` leaves routing, body parsing, validation and error handling to you, and one unhandled rejection can end the process.
- The router matches parameters, lets static segments win, turns broken encodings into 400, and tells 404 from 405.
- Middleware forms an onion: order decides what each layer sees, and `next` may run at most once.
- One schema gives the runtime check and the handler's type; unknown fields are refused and every problem is reported.
- Errors carry a status and a stable code; unknown errors become a 500 that leaks nothing, logged with a request id.
- The adapter limits bodies, gives every request a scope and an id, never lets a request hang, and stops gracefully inside the lifecycle.
- ZudoJS makes the same choices with more depth: richer route patterns, prioritised middleware, raw bodies you parse, typed error classes and a richer event bus.

Next: [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source) opens the published ZudoJS packages and follows a request and a container resolution through their code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
