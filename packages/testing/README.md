# @zudojs/testing

Test helpers, fixtures, mocks, and assertions for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-testing](https://zudojs.oyinlola.site/docs/packages-testing) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-testing.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install --save-dev @zudojs/testing
```

## Quick Start

```typescript
import {
  createCleanupManager,
  createMockFn,
  createSpyLogger,
  createTestClock,
  createTestContainer,
} from "@zudojs/testing";

const container = createTestContainer({
  overrides: [{ token: databaseToken, useValue: fakeDatabase }],
});

const logger = createSpyLogger("test");
const clock = createTestClock(0); // pinned to the epoch
const cleanup = createCleanupManager();

const findUser = createMockFn<[string], Promise<User>>();
findUser.mockResolvedValue({ id: "u_1" });

clock.advance(60_000);
cleanup.register(() => container.dispose(), "container");

// Rejects with an AggregateError if any cleanup fails.
await cleanup.dispose();
```

Assertions compare structurally, so they can actually fail:

```typescript
import { assertResponseStatus, assertResponseBody } from "@zudojs/testing";

assertResponseStatus(response, 201);
assertResponseBody(response, { id: "u_1", roles: new Set(["admin"]) });
```

## Testing an HTTP app

`createHttpTestClient(target)` sends real HTTP requests to your app and
checks the answers, supertest style.

```typescript
import { createRouter, createResponseContext } from "@zudojs/http";
import { createCleanupManager, createHttpTestClient } from "@zudojs/testing";

const router = createRouter();
router.get("/users/:id", (ctx) =>
  createResponseContext().json({ id: ctx.params.id }),
);

const cleanup = createCleanupManager();
const client = createHttpTestClient(router, { cleanup });

const response = await client
  .get("/users/7")
  .query({ expand: "roles" })
  .auth("token-123")
  .expect(200)
  .expect("content-type", /json/)
  .expectJson({ id: "7" });

response.json<{ id: string }>(); // typed body

await cleanup.dispose(); // closes the server the client started
```

What you can point it at:

| Target | How it is reached |
| --- | --- |
| `"http://127.0.0.1:3000/api"` | Over the network; a path prefix applies to every request. |
| Node `http.Server` | Started on `127.0.0.1:0` if it is not listening, closed by `close()`. A listening server is used where it is and left running. |
| `(req, res) => void` | Wrapped in a Node server on an ephemeral port. |
| `(request: Request) => Response`, `{ fetch }` | Called in-process, no port. The request's `signal` aborts on timeout. |
| `HttpServer`, `NodeHttpAdapter`, `HttpRouter`, `HttpMiddlewarePipeline` from `@zudojs/http` | Served through a real `NodeHttpAdapter` on an ephemeral port, so the request guard, body limits and error mapping behave as in production. A running `HttpServer` is used where it listens. |
| An `@zudojs/http` `HttpHandler` | Same, with `{ kind: "zudo" }` (a one-argument function is otherwise taken to be a fetch handler). |

- **Requests**: `.get/.post/.put/.patch/.delete/.head/.options(path)` or
  `.request(method, path)`; `.set(name, value)` or `.set({...})`,
  `.query({...})`, `.send(body)` (objects as JSON, strings as text, bytes as
  octet-stream, `URLSearchParams` as a form), `.auth(token)` or
  `.auth(user, password)`, `.timeout(ms)`. A request is sent once, when it is
  first awaited. Redirects are not followed.
- **Built requests**: `client.request(createTestHTTPRequest().PUT("/users/:id").withParam("id", "7").build())`
  sends a builder request, with `:params` substituted.
- **Expectations**: `.expect(status)`, `.expect(header, "value" | /re/)`,
  `.expect((response) => ...)`, `.expectJson(partial)` (extra object keys are
  allowed; arrays must match in length) and `.expectText("..." | /re/)`.
  Failures are `AssertionError`s naming the request and previewing the body,
  with a stack pointing at the `.expect…()` line.
- **Responses** have `status`, `headers`, `header(name)`, `text`, `body`
  (parsed JSON for JSON types), `json<T>()`, `bytes`, `cookies` and
  `setCookies`. They are `TestHTTPResponse`s, so `assertResponseStatus`,
  `assertResponseBody` and friends accept them.
- **Cookies** from `Set-Cookie` are kept in `client.cookies` and sent back on
  later requests (`Path`, `Max-Age` and `Expires` honoured). An explicit
  `Cookie` header replaces the jar for that request; `{ cookies: false }`
  turns it off.
- **Timeouts** default to 5 s per request (`{ timeout }` or `.timeout(ms)`)
  and reject with a `TimeoutError`; connection failures reject with a
  `NetworkError`, both from `@zudojs/errors`.
- **Cleanup**: `client.close()` closes only what the client started. Servers it
  starts are unref'd, so a forgotten `close()` cannot keep the test process
  alive; `{ cleanup }` registers `close()` with a cleanup manager.

## Recording doubles

`createTestEventBus()`, `createTestMessageBus()` and `createTestQueue(name)`
are the real `EventBus`, `MessageBus` and `Queue`, so hand them straight to
the code under test. They record at the bus and queue level, so every path
records, not only a wrapper method:

```typescript
import { createQueueName } from "@zudojs/queue";
import {
  assertEventPublished,
  createTestEventBus,
  createTestMessageBus,
  createTestQueue,
} from "@zudojs/testing";

const events = createTestEventBus(); // an EventBus
await new UserService(events).register("ann"); // calls events.publishEvent(...)
assertEventPublished(events.published, "user.created");

const messages = createTestMessageBus(); // a MessageBus
await messages.send({ type: "email.send", payload: { to: "a@b.c" } });
messages.dispatched; // send and dispatch both record

const reminders = createTestQueue<{ taskId: number }>(createQueueName("reminders"));
await reminders.add("remind", { taskId: 7 }); // a Queue
reminders.findByName("remind"); // also records reminders.queue.add(...)
```

- **Events**: `publish` (a full `Event` or `{ type, payload }`),
  `publishEvent` and `emit` all record into `published`; `findByType` and
  `clear` read and reset it. `bus` is the same instance.
- **Messages**: `send` and `dispatch` record into `dispatched`.
- **Queues**: `add`, on the test queue or on the underlying `queue`, records
  into `jobs`; `findByName` filters them.
- Methods survive destructuring (`const { publish } = createTestEventBus()`).

## Test application

`createTestApplication()` bundles a container, a logger, a clock and a cleanup
manager, with the container and logger cleanups registered. It is quiet and
deterministic by default:

```typescript
const app = createTestApplication({ name: "task-api" });

app.logger.info("started"); // prints nothing
app.logger.calls.map((call) => call.message); // ["started"]
app.clock.now.toISOString(); // "2026-01-01T00:00:00.000Z" (DEFAULT_TEST_APPLICATION_TIME)

await app.dispose();
```

Opt back in when you want something else: `startTime` moves the default
clock (`startTime: Date.now()` for wall-clock time), `clock` supplies your
own, and `logger: createLogger({ name })` from `@zudojs/logger` prints.

## Features

- Test container, config, clock, and application context
- Spy logger that records child and context loggers too
- Mock functions, spies, and stubs
- Recording event bus, message bus, and queue that are the real types and record every path
- HTTP test client that drives a real app (URL, Node server, fetch handler, or `@zudojs/http` app)
- HTTP request/response builders
- Structural assertions for responses, events, errors, and serialization
- Cleanup manager that reports what failed

## Safety Notes

- Assertions compare structurally, not by `JSON.stringify`. `Map`, `Set`,
  `Date`, `BigInt`, `undefined` values and key order are all handled, and a
  circular value reports a mismatch instead of throwing a `TypeError`.
- Types are compared too: two objects must share a prototype (a class
  instance never equals a plain object or an instance of another class;
  `{}` and `Object.create(null)` count as the same), Errors must match on
  `name`, `message` and `cause`, boxed primitives on their value, and typed
  arrays on their constructor. Distinct Promises, WeakMaps and WeakSets are
  never equal. A serializer that turns an Error into `{}` fails
  `assertSerializesCorrectly`.
- `createStub()` answers `then` with `undefined`, so awaiting a stub — or
  returning one from an async factory — resolves rather than hanging.
- `createStub()` hands back the same no-op for a given property every time,
  so `stub.handler === stub.handler` and a register/unregister pair written
  against a stub actually unregisters.
- `InMemoryTestStorage.set(key, value, 0)` means "already expired", not "no
  expiry"; only an omitted TTL (or `Infinity`) never expires, and a `NaN` TTL
  throws. `delete()` returns `false` for an entry that has already expired.
- `cleanup.dispose()` rejects with an `AggregateError` when any cleanup fails,
  after running them all.
- `mockResolvedValue` and `mockRejectedValue` return promises; `results` stays
  aligned index-for-index with `calls`, even when the implementation throws
  (the slot holds `undefined` and the thrown value lands in `errors`).
- Spies forward their receiver, so a method reading `this` still works.
- `assertThrows` is for synchronous code. Handing it an async function throws
  "use assertRejects" instead of a misleading "did not throw", and the
  rejection is handled rather than leaked.
- `findByMetadata` and the structural assertions compare `Set` members and
  `Map` keys by value, so `new Set([{ id: 1 }])` matches `new Set([{ id: 1 }])`.

## Use Cases

- Unit and integration testing
- Dependency injection in tests
- Deterministic time and randomness
- Asserting on events, messages, and HTTP responses
