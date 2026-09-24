---
title: "@zudojs/testing — Testing Utilities Documentation"
description: "@zudojs/testing docs for ZudoJS: mocks, spies, fixtures, assertions, a test clock, and a supertest-style HTTP test client for your app."
source: https://zudojs.oyinlola.site/docs/packages-testing
---

v1.2.0

# @zudojs/testing

Testing utilities for the Zudojs ecosystem. Mock functions, spies, stubs, test clock, cleanup management, HTTP builders, assertion helpers, fixture factories, and full test context — everything you need for comprehensive testing.

TESTING MOCKS FIXTURES ASSERTIONS VITEST

## OVERVIEW

`@zudojs/testing` is a box of parts for testing Zudojs applications. It does not run your tests — you keep using a test runner such as [Vitest](https://vitest.dev). What it gives you are the stand-ins and the checks that make a test fast and repeatable.

A running application talks to a database, a clock, a queue and an HTTP server. In a test you usually want none of that: real time makes tests slow, and a real database makes them flaky. This package hands you fakes you control instead.

Its assertion helpers compare values *structurally*, so a `Map`, `Set` or `Date` inside a body is compared by contents, not by how it prints.

### The words, first

If any of these terms are new, here is each one in a single sentence.

| Term | In one sentence |
| --- | --- |
| **Unit test** | A small program that runs one piece of your code and checks that the result is what you expected. |
| **Fixture** | A ready-made piece of test data produced by a factory function, so you do not retype the same object in every test. |
| **Mock** | A fake function you configure to return whatever you want, which also remembers every call it received. |
| **Stub** | A fake object whose methods all do nothing until you supply the one or two you actually care about. |
| **Spy** | A wrapper around a *real* function that still runs it, but records every call along the way. |
| **Assertion** | A check that throws an error when reality does not match your expectation — a test fails because an assertion threw. |

WHEN YOU NEED IT

- Your code reads the clock, and you want to test what happens an hour later without waiting an hour.
- Your code calls a service you do not want to run for real (payments, email, a database).
- You want to assert on the events, messages, jobs or log lines your code produced.
- A test opens connections or timers that must be closed afterwards, in a fixed order.
- You want to send real HTTP requests to your app and check status, headers, body and cookies.

WHEN YOU DON'T

- Pure functions with no dependencies — plain `expect()` from your test runner is enough.
- End-to-end tests where the whole point is to hit the real database. (For requests against your real HTTP server, the [HTTP test client](#http-test-client) is the part you do want.)
- Production code. Nothing here belongs in a shipped bundle; install it as a dev dependency.

## INSTALLATION

Install the package and a test runner. The examples on this page use Vitest, which is what the package itself is tested with.

```bash
$ npm install --save-dev @zudojs/testing
$ npm install --save-dev vitest
```

You do not need to install anything else. `@zudojs/testing` depends on the Zudojs packages it wraps — `@zudojs/container`, `@zudojs/logger`, `@zudojs/events`, `@zudojs/messaging`, `@zudojs/queue`, `@zudojs/config`, `@zudojs/serialization`, `@zudojs/http` and others — so your package manager pulls them in for you.

> **Source of truth:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

Run your tests with `npx vitest run`.

## QUICK START

Here is a complete test file. Save it as `tests/session.test.ts` and run `npx vitest run`. It tests a tiny function against a clock you control, so nothing waits for real time.

```ts
// tests/session.test.ts
import { describe, it, expect } from "vitest";
import { createTestClock, createMockFn } from "@zudojs/testing";

// The code under test.
interface Session { readonly id: string; readonly expiresAt: number; }

function isExpired(session: Session, nowMs: number): boolean {
  return session.expiresAt <= nowMs;
}

describe("session expiry", () => {
  it("expires exactly one minute in", () => {
    const clock = createTestClock(0); // pinned to 1970-01-01T00:00:00.000Z
    const session: Session = { id: "s_1", expiresAt: 60_000 };

    expect(isExpired(session, clock.timestamp)).toBe(false);

    clock.advance(60_000); // jump forward one minute, instantly
    expect(isExpired(session, clock.timestamp)).toBe(true);
  });

  it("records how the notifier was called", () => {
    const notify = createMockFn<[string], void>();

    notify("s_1");

    expect(notify.callCount).toBe(1);
    expect(notify.calls[0]).toEqual(["s_1"]);
  });
});
```

**What you should see:** Vitest prints `2 passed`. Change `advance(60_000)` to `advance(59_999)` and the first test fails — proof that the clock is really driving the result.

## MOCKS, SPIES AND STUBS

These three are all "test doubles" — stand-ins for something real. They differ in how much of the real thing survives.

| Helper | What it does | Reach for it when |
| --- | --- | --- |
| `createMockFn()` | Makes a brand-new fake function that records calls and returns what you configure. | You need one function replaced and want to control its answer. |
| `createSpyFn(fn)` | Wraps a real function; it still runs, and every call, result and thrown error is recorded. | The real behaviour is fine — you only want to know it was called. |
| `createSpyMethod(obj, "name")` | Same, but it replaces a method on an object in place until you call `restore()`. | You cannot pass the function in; the code reaches for `obj.name` itself. |
| `createStub<T>()` | Makes an object where every method returns `undefined`, except the ones you override. | An interface has ten methods and your test only uses two. |
| `createStubClass(C, {…})` | Makes a constructor whose instances pass `instanceof C` but run no real code. | The code under test checks `instanceof`, or calls `new` itself. |

### A mock function

A mock records every call in `calls` and every returned value in `results`, index for index. A call whose implementation throws keeps its `results` slot (`undefined`) and the thrown value is recorded in `errors`. This test replaces a repository lookup with a mock that resolves to a fixed user.

```ts
import { describe, it, expect } from "vitest";
import { createMockFn } from "@zudojs/testing";

interface User { readonly id: string; readonly name: string; }

describe("greetUser", () => {
  it("asks the repository once, by id", async () => {
    const findUser = createMockFn<[string], Promise<User>>();
    findUser.mockResolvedValue({ id: "u_1", name: "Ada" });

    const greet = async (id: string) => `Hello, ${(await findUser(id)).name}`;

    expect(await greet("u_1")).toBe("Hello, Ada");
    expect(findUser.callCount).toBe(1);
    expect(findUser.calls[0]).toEqual(["u_1"]);
    expect(findUser.invoked).toBe(true);
  });
});
```

**What you should see:** one passing test. `mockResolvedValue` returns a real promise, so `await` behaves as it would against the real repository.

The rest of the surface: `mockReturnValue(v)` for a plain value, `mockRejectedValue(err)` for a promise that rejects, `mockImplementation(fn)` to run your own logic, `mockClear()` to forget the recorded calls, and `mockReset()` to forget the calls *and* go back to the default you passed to `createMockFn`.

> **Watch out:** `mockRejectedValue(new Error("boom"))` makes the mock *return a rejected promise*; it does not throw as the call happens. Assert with `await expect(mock()).rejects.toThrow("boom")`, not `expect(() => mock()).toThrow()`.

### A spy on a method

A spy leaves the real behaviour alone. Here the method still computes its answer, and the spy tells you it ran once.

```ts
import { it, expect } from "vitest";
import { createSpyMethod } from "@zudojs/testing";

it("records the call and keeps the real result", () => {
  const service = {
    prefix: "user",
    label(id: string): string {
      return `${this.prefix}:${id}`;
    },
  };

  const spy = createSpyMethod(service, "label");

  expect(service.label("7")).toBe("user:7");
  expect(spy.callCount).toBe(1);
  expect(spy.calls[0]).toEqual(["7"]);
  expect(spy.results[0]).toBe("user:7");

  spy.restore(); // puts the original method back
});
```

**What you should see:** a pass — `this.prefix` still resolves inside the spied method, because the spy forwards the receiver. Anything the wrapped function throws lands in `spy.errors`.

> **In plain words:** `createSpyMethod` gives you `restore()`, because it changed an object and must put it back. `createSpyFn` gives you `reset()`, because it changed nothing — there is only the recording to clear.

### A stub of an interface

A stub answers every method with `undefined` unless you override it, so you write only the part the test depends on.

```ts
import { it, expect } from "vitest";
import { createStub } from "@zudojs/testing";

interface UserService {
  find(id: string): string;
  remove(id: string): void;
}

it("only implements what the test uses", () => {
  const users = createStub<UserService>({
    find: (id) => `user:${id}`,
  });

  expect(users.find("7")).toBe("user:7");
  expect(users.remove("7")).toBeUndefined();
});
```

**What you should see:** both expectations pass. A stub is also safe to `await` or return from an async factory — `then`, `catch` and `finally` answer `undefined` rather than pretending to be a promise.

**Stable identity (changed in v1.1.2):** a generated no-op is memoised per property, so the same property always answers with the same function object. Before v1.1.2 every access built a fresh closure, so `stub.handler !== stub.handler` and any code that registered and then unregistered the same stub property removed nothing.

```ts
const deps = createStub<{ handler(): void }>();

expect(deps.handler).toBe(deps.handler); // v1.1.2: true. Before: false.

bus.on("ping", deps.handler);
bus.off("ping", deps.handler); // v1.1.2: removes it. Before: leaked to the next test.
```

Overrides you supply are returned untouched and were always stable. The memoisation applies only to the no-ops the stub generates, and only to string-keyed properties — a symbol property still answers `undefined`.

When the code under test uses `new` or checks `instanceof`, stub the class instead. Instances keep the real prototype, and any method you did not override exists as a no-op.

```ts
const StubDatabase = createStubClass(RealDatabase, { query: async () => [] });
const db = new StubDatabase();
// db instanceof RealDatabase === true, and db.connect() returns undefined.
```

## TEST CLOCK

A test clock is an object that reports a time you choose. Pass its `now` or `timestamp` into the code under test instead of letting that code call `Date.now()` itself.

It exists so that a test about expiry, retries or timeouts finishes in a millisecond and gives the same answer every time it runs.

```ts
import { it, expect } from "vitest";
import { createTestClock } from "@zudojs/testing";

it("moves time on demand", () => {
  const clock = createTestClock("2026-01-01T00:00:00Z");

  clock.advance(60_000);
  expect(clock.now.toISOString()).toBe("2026-01-01T00:01:00.000Z");

  clock.add({ hours: 1, minutes: 30 });
  expect(clock.now.toISOString()).toBe("2026-01-01T01:31:00.000Z");

  clock.set(0);
  expect(clock.timestamp).toBe(0);
});
```

**What you should see:** one passing test. `createTestClock` accepts a `Date`, an ISO string or a millisecond number; with no argument it starts at the real current time. `add` understands `seconds`, `minutes`, `hours` and `days`.

> **Watch out:** `reset()` jumps to the *real* current time — it does not return to the time you passed to `createTestClock`. To get back to a fixed start, call `clock.set(startTime)` again. An unparseable time such as `createTestClock("last tuesday")` throws a `TypeError` instead of quietly producing `NaN`.

## CLEANUP MANAGER

A cleanup manager is a list of "undo" functions. You register each one as you open a resource, and a single `dispose()` runs them all in reverse order — last opened, first closed.

Reverse order matters: a server started after a database connection must stop before that connection closes.

```ts
import { it, expect } from "vitest";
import { createCleanupManager } from "@zudojs/testing";

it("closes resources in reverse order", async () => {
  const closed: string[] = [];
  const cleanup = createCleanupManager();

  cleanup.register(() => { closed.push("database"); }, "database");
  cleanup.register(async () => { closed.push("server"); }, "server");

  expect(cleanup.count).toBe(2);

  await cleanup.dispose();

  expect(closed).toEqual(["server", "database"]);
  expect(cleanup.disposed).toBe(true);
});
```

**What you should see:** the array is `["server", "database"]` — the opposite of the registration order.

Every cleanup runs even if an earlier one throws. If any of them failed, `dispose()` then rejects with an `AggregateError` naming the labels that failed, so a leaked connection cannot pass unnoticed.

```ts
// Two failures produce: "2 of 2 cleanup functions failed: server, database"
await expect(cleanup.dispose()).rejects.toThrow(/cleanup functions failed/);
```

> **Watch out:** always `await cleanup.dispose()`. If you drop the promise, a cleanup failure becomes an unhandled rejection that may be blamed on a different test. Registering after `dispose()` throws — build a fresh manager per test.

## ASSERTIONS

An assertion here is a plain function that throws an `Error` when the value is wrong and returns quietly when it is right. Your test runner turns that thrown error into a failing test, so these work alongside `expect()` rather than replacing it.

They compare structurally. `deepEqual(a, b)` answers `true` or `false`; `findDifference(actual, expected)` returns `undefined` when they match, or a `{ path, reason }` object pointing at the first place they differ. Objects must share a prototype (`{}` and `Object.create(null)` count as the same); Errors compare name, message and cause; boxed primitives compare their value; typed arrays must share a constructor; distinct Promises/WeakMaps/WeakSets are never equal.

```ts
import { it, expect } from "vitest";
import { deepEqual, findDifference } from "@zudojs/testing";

it("compares by contents, not by printing", () => {
  expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  expect(deepEqual(new Set([1]), new Set())).toBe(false);

  const difference = findDifference(
    { user: { roles: ["admin", "editor"] } },
    { user: { roles: ["admin", "viewer"] } },
  );

  console.log(difference?.path); // "value.user.roles[1]"
  expect(difference?.path).toBe("value.user.roles[1]");
});
```

**What you should see:** `value.user.roles[1]` printed, and a passing test. Key order does not matter; `Map`, `Set`, `Date`, `RegExp`, `BigInt` and typed arrays are compared by value, and a circular object reports a mismatch instead of crashing.

### Asserting on errors

Use these when the correct behaviour is a failure. `assertThrows` is for synchronous code and `assertRejects` for async; both hand you back the error so you can keep checking it.

```ts
import { it, expect } from "vitest";
import { assertThrows, assertRejects, assertErrorType } from "@zudojs/testing";

it("rejects an empty name", async () => {
  const validate = (name: string): string => {
    if (name === "") throw new RangeError("name is required");
    return name;
  };

  const error = assertThrows(() => validate(""), "name is required");
  assertErrorType(error, RangeError);

  await assertRejects(async () => { throw new Error("offline"); }, "offline");
  expect(error.message).toBe("name is required");
});
```

**What you should see:** a pass. The second argument is a *substring* of the message, not a regular expression. For Zudojs errors there are also `assertErrorCode(error, "ERR_NOT_FOUND")` and `assertErrorMetadata(error, "userId", "u_1")`, which compares metadata structurally so arrays and objects can match.

### Asserting on events and messages

These take the *recorded array*, not a bus — pass `bus.published` or `bus.dispatched`. `assertEventPublished` and `assertMessageDispatched` require at least one entry of that type; `assertEventNotPublished` and `assertMessageNotDispatched` require none.

For a single event there are `assertEventType(event, type)`, `assertRecordedEventType(recorded, type)` and `assertEventPayload(event, expected)`, which compares the payload structurally. There is a worked example in [Doubles for framework services](#framework-doubles).

### Serialization round-trips

Four helpers check that a value survives being turned into JSON and back: `assertSerializesCorrectly`, `assertSerializesTo`, `assertDeserializesTo` and `assertTypePreservesRoundTrip`. The last one takes a checker function you write, so it can verify anything.

```ts
import { it } from "vitest";
import {
  assertSerializesTo,
  assertTypePreservesRoundTrip,
} from "@zudojs/testing";

it("keeps a Date a Date", () => {
  assertSerializesTo({ a: 1 }, '{"a":1}');

  assertTypePreservesRoundTrip(
    { date: new Date("2026-01-01T00:00:00Z") },
    (restored) => restored.date instanceof Date,
    "Date",
  );
});
```

> **Good to know:** `assertSerializesCorrectly` and `assertDeserializesTo` compare structurally with `findDifference`, so `Map` and `Set` contents are checked. `assertSerializesTo` compares the JSON string by design, and `assertTypePreservesRoundTrip` uses your own checker; failures are rendered with `describeValue`, so a `BigInt` or circular value produces a readable assertion error rather than a serialisation exception.

## TESTING AN HTTP APP

`createHttpTestClient(target)` sends *real* HTTP requests to your app and checks the answers, in the style of supertest. You hand it your router (or server, or handler); it starts it on a free port when it needs one, and you write one chain per request: build it, send it, check it.

Because the request really travels through the server, the parts you would otherwise skip — the request guard, body size limits, error mapping, headers and cookies — behave exactly as they do in production.

```ts
import { it, beforeEach, afterEach } from "vitest";
import { createRouter, createResponseContext } from "@zudojs/http";
import { createCleanupManager, createHttpTestClient } from "@zudojs/testing";
import type { CleanupManager } from "@zudojs/testing";

const router = createRouter();
router.get("/users/:id", (ctx) => createResponseContext().json({ id: ctx.params.id }));

let cleanup: CleanupManager;
beforeEach(() => { cleanup = createCleanupManager(); }); // a fresh one per test
afterEach(() => cleanup.dispose()); // closes the server the client started

it("returns one user", async () => {
  const client = createHttpTestClient(router, { cleanup });

  const response = await client
    .get("/users/7")
    .query({ expand: "roles" })
    .auth("token-123")               // Authorization: Bearer token-123
    .expect(200)
    .expect("content-type", /json/)
    .expectJson({ id: "7" });

  response.json<{ id: string }>(); // typed body: { id: "7" }
});
```

**What you should see:** a pass. Change `.expect(200)` to `.expect(404)` and the test fails with `Expected status 404, got 200.` Nothing is sent until the chain is awaited, and it is sent once.

### What you can point it at

| Target | How it is reached |
| --- | --- |
| An `@zudojs/http` `HttpRouter`, `HttpServer`, `NodeHttpAdapter` or `HttpMiddlewarePipeline` | Served through a real `NodeHttpAdapter` on a free port. A running `HttpServer` is used where it already listens. |
| An `@zudojs/http` `HttpHandler` function | The same, but pass `{ kind: "zudo" }`: a one-argument function is otherwise taken to be a fetch handler. |
| A Node `http.Server` | Started on `127.0.0.1:0` if it is not listening, and closed by `close()`. A server that is already listening is used where it is and left running. |
| A Node listener, `(req, res) => void` | Wrapped in a Node server on a free port. |
| A fetch handler, `(request: Request) => Response`, or an object with a `fetch` method | Called in-process, no port at all. The request's `signal` aborts on timeout. Handy for `createApiFetchHandler` and `createRPCFetchHandler`. |
| A base URL, `"http://127.0.0.1:3000/api"` | Over the network. A path prefix in the URL applies to every request. |

### Building a request and checking the answer

| Call | What it does | Notes |
| --- | --- | --- |
| `.get / .post / .put / .patch / .delete / .head / .options(path)` | Starts a request. | Or `client.request(method, path)`. A built `createTestHTTPRequest()` request works too, with `:params` filled in. |
| `.set(name, value)` or `.set({ … })` | Sets headers. | — |
| `.query({ … })` | Adds query parameters. | — |
| `.send(body)` | Sets the body. | Objects as JSON, strings as text, bytes as octet-stream, `URLSearchParams` as a form. |
| `.auth(token)` or `.auth(user, password)` | Bearer or Basic authorization. | — |
| `.timeout(ms)` | Per-request time limit. | Default 5 s, or `{ timeout }` on the client. Rejects with a `TimeoutError`. Values beyond Node's timer limit (about 24.8 days) are clamped to it, so a huge timeout means "wait a very long time"; it used to overflow and fire after 1 ms. |
| `.expect(status)` | Checks the status code. | — |
| `.expect(header, "value" \| /re/)` | Checks a header. | — |
| `.expect((response) => …)` | Runs your own check. | — |
| `.expectJson(partial)` | Checks the JSON body. | Extra object keys are allowed; arrays must match in length. |
| `.expectText("…" \| /re/)` | Checks the body as text. | — |

The awaited response has `status`, `headers`, `header(name)`, `text`, `body` (parsed for JSON types), `json<T>()`, `bytes`, `cookies` and `setCookies`. It is a test response, so `assertResponseStatus`, `assertResponseBody` and the other assertions below accept it. Redirects are not followed.

> **When a check fails:** it throws an `AssertionError` from `node:assert`. The message names the request and previews the body, and the stack points at the `.expect…()` line that failed, so Vitest shows you exactly which check broke. A connection failure is a `NetworkError` and a timeout a `TimeoutError`, both from `@zudojs/errors`.

### Cookies

The client keeps a *cookie jar*, like a browser: cookies from `Set-Cookie` are stored in `client.cookies` and sent back on later requests, honouring `Path`, `Max-Age` and `Expires`. A login flow therefore just works:

```ts
// router.post("/login", ...) answers with .cookie("session", "abc")
await client.post("/login").send({ user: "ada" }).expect(200);

client.cookies.get("session"); // "abc"

// Sent with Cookie: session=abc automatically.
await client.get("/me").expect(200);
```

An explicit `Cookie` header replaces the jar for that one request, and `createHttpTestClient(target, { cookies: false })` turns the jar off. The jar also has `set`, `delete`, `clear` and `toJSON`.

Cookie paths are matched against the path the *server* saw, including any path in the base URL. With a client made for `http://127.0.0.1:3000/api`, `client.get("/me")` requests `/api/me`, so a cookie the server set with `Path=/api` is sent back, exactly as a browser would. Before 1.2.0 the jar compared `Path=/api` with `/me` and never returned the cookie.

### Closing

`client.close()` closes only what the client started itself. Pass `{ cleanup }` and it registers `close()` with your [cleanup manager](#cleanup-manager), as in the first example. Servers it starts are unref'd, so a forgotten `close()` cannot keep the test process alive — but close anyway, so each test starts clean. Other client options: `timeout`, `headers` (sent on every request), `kind`, `origin` and `adapter`.

## HTTP TESTING

These builders make plain request and response objects in memory. Nothing listens on a port and nothing is sent over a network — you hand the request to your handler and assert on what comes back. To send real requests to a running app instead, use `createHttpTestClient` (see [Testing an HTTP app](#http-test-client)); the assertions below accept its responses too.

Build a request with the fluent `createTestHTTPRequest()`, or in one call with `createHTTPRequest(method, path, options)`.

```ts
import { it, expect } from "vitest";
import {
  createTestHTTPRequest,
  jsonResponse,
  assertOK,
  assertResponseHeader,
  assertResponseBodyContains,
} from "@zudojs/testing";

it("answers a user lookup", () => {
  const request = createTestHTTPRequest()
    .GET("/api/users")
    .withHeader("Authorization", "Bearer token123")
    .withQuery({ page: "1" })
    .build();

  expect(request.path).toBe("/api/users");
  expect(request.headers.get("authorization")).toBe("Bearer token123");
  expect(request.query.page).toBe("1");

  // Whatever your handler returned, described as a test response:
  const response = jsonResponse({ id: "u_1", name: "Ada" });

  assertOK(response);
  assertResponseHeader(response, "Content-Type", "application/json");
  assertResponseBodyContains(response, { id: "u_1" });
});
```

**What you should see:** a pass. Header names are matched case-insensitively. `assertResponseBody` requires the body to match *exactly*; `assertResponseBodyContains` only checks the keys you list, which is what you want when the body carries a generated id or timestamp.

Ready-made responses cover the common statuses: `jsonResponse(body)` (200), `createdResponse(body)` (201), `noContentResponse()` (204), `badRequestResponse(message)` (400), `notFoundResponse()` (404) and `serverErrorResponse()` (500). Matching assertions: `assertOK`, `assertCreated`, `assertNoContent`, `assertBadRequest`, `assertNotFound`, `assertServerError`, plus `assertResponseStatus(response, code)` for anything else.

For a response you want to shape yourself, use the builder. `json`, `text` and `html` each set the matching `content-type` and mark the response as sent.

```ts
const response = createTestHTTPResponse()
  .status(202)
  .header("X-Request-Id", "req_1")
  .json({ accepted: true })
  .build();
```

## FIXTURES

A fixture factory builds a complete, valid object from the one or two fields your test actually cares about. Everything else — the id, the timestamp — is filled in for you.

This keeps tests short and keeps them honest: if the shape of an event changes, one factory changes, not fifty tests.

```ts
import { it, expect } from "vitest";
import { createEvent, createEvents, createMessage } from "@zudojs/testing";

it("builds events without repeating boilerplate", () => {
  const event = createEvent<{ userId: string }>({
    type: "user.created",
    payload: { userId: "u_1" },
  });

  expect(event.type).toBe("user.created");
  expect(event.payload).toEqual({ userId: "u_1" });
  expect(event.id).toBeDefined();
  expect(event.timestamp).toBeInstanceOf(Date);

  const batch = createEvents<{ index: number }>(3, (i) => ({
    type: "item.added",
    payload: { index: i },
  }));

  expect(batch).toHaveLength(3);
  expect(batch[2]?.payload.index).toBe(2);

  const message = createMessage({ type: "email.send" });
  expect(message.type).toBe("email.send");
});
```

**What you should see:** a pass. With no options at all, `createEvent()` produces type `"test.event"` and `createMessage()` produces `"test.message"`, each with an empty payload. `createEventInput` and `createMessageInput` build the smaller "input" shape — type, payload and optional metadata — that buses accept for publishing.

## TEST CONTEXT

A test context bundles the per-test pieces into one object: a clock, a cleanup manager, and three recorders for logs, events and messages. Create one per test and dispose it in teardown.

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestContext } from "@zudojs/testing";

describe("order flow", () => {
  let ctx = createTestContext();

  afterEach(async () => {
    await ctx.dispose();
    ctx = createTestContext();
  });

  it("records what happened", () => {
    ctx.logs.record("info", "order placed", { orderId: "o_1" });
    ctx.events.record("order.placed", { id: "o_1" });

    expect(ctx.logs.findByLevel("info")).toHaveLength(1);
    expect(ctx.logs.findByMessage("order")).toHaveLength(1);
    expect(ctx.events.findByType("order.placed")).toHaveLength(1);
  });
});
```

**What you should see:** a pass. Every recorder has `entries`, `record()`, `clear()` and `findByType`; the log recorder has `findByLevel` and `findByMessage` instead.

> **In plain words:** these recorders are notebooks, not wiretaps. Nothing writes into them automatically — your code (or your test) calls `record()`. To capture what a real logger or bus did, use `createSpyLogger` or `createTestEventBus` below.

## DOUBLES FOR FRAMEWORK SERVICES

The remaining factories wrap real Zudojs services in a recording shell. You get the genuine behaviour plus a list of everything that went through.

| Factory | What you get | Where the recording lives |
| --- | --- | --- |
| `createSpyLogger(name?, level?)` | A full logger that writes nowhere and remembers everything. | `logger.calls` |
| `createTestContainer({ overrides })` | A started DI container with your fakes registered. | — (use `resolve` / `has`) |
| `createTestEventBus(options?)` | A started `EventBus` that records every `publish`, `publishEvent` and `emit`. It *is* the bus: `testBus.bus === testBus`. | `testBus.published`, `findByType(type)` |
| `createTestMessageBus(options?)` | A `MessageBus` that records every `send` and `dispatch`, on the double or on `.bus`. | `testBus.dispatched`, `findByType(type)` |
| `createTestQueue(name, options?)` | A `Queue` (in memory) that records every `add`, on the double or on the underlying `.queue`. | `testQueue.jobs`, `findByName(name)` |
| `createTestConfigManager(values?)` | A `ConfigManager` pre-loaded with values, auto-loading off. | — (use `get` / `set`) |
| `createTestApplication(options?)` | A container, logger, clock and cleanup manager wired together. Silent, with a fixed clock, by default. | `app.logger.calls` |
| `new InMemoryTestStorage()` | A key-value store with optional TTL. A TTL of `0` expires immediately; only an omitted TTL never expires. | — (use `keys()` / `size`) |

### Example: spy logger and in-memory storage

This test checks that the code logged what it should and stored what it should, with nothing on disk and nothing on the console.

```ts
import { it, expect } from "vitest";
import { createSpyLogger, InMemoryTestStorage } from "@zudojs/testing";

it("logs and stores the new user", () => {
  const logger = createSpyLogger("app");
  const store = new InMemoryTestStorage();

  // A child logger writes into the same recording as its parent.
  logger.child({ name: "users" }).info("user saved", { userId: "u_1" });
  store.set("users:u_1", { id: "u_1" });

  expect(logger.calls).toHaveLength(1);
  expect(logger.findByMessage("saved")).toHaveLength(1);
  expect(logger.findByMetadata("userId", "u_1")).toHaveLength(1);

  expect(store.has("users:u_1")).toBe(true);
  expect(store.size).toBe(1);
});
```

**What you should see:** a pass. Loggers made with `child()` or `withContext()` share the parent's recording, so you can assert on the parent no matter which derived logger the code used. `child({ metadata })` metadata appears on every call the child writes (call metadata wins) and `child({ level })` overrides the level. The logger honours its level: `createSpyLogger("app", 2)` records fatal, error and warn only.

### Expiry in `InMemoryTestStorage`

`set(key, value, ttlMs)` takes an optional time-to-live in milliseconds. The entry carries a deadline of `Date.now() + ttlMs`, and the next `get`, `has`, `keys()` or `size` drops it once that deadline has passed. Only an omitted (or `undefined`) TTL means "never expires". A `NaN` TTL throws a `RangeError` (`TTL for "k" is NaN; pass a number of milliseconds or omit it.`); before 1.2.0 it was stored and silently never expired. `delete()` returns `false` for a key that has already expired, as if it were not there.

```ts
const store = new InMemoryTestStorage();

store.set("fresh", 1);              // no TTL — never expires
store.set("stale", 1, 0);           // deadline of now — already expired

expect(store.has("fresh")).toBe(true);
expect(store.has("stale")).toBe(false);
expect(store.get("stale")).toBeNull();
expect(store.size).toBe(1);
```

> **Changed in v1.1.2:** a TTL of `0` is now a real deadline of "now", so the entry is already expired on the next read. Before v1.1.2 a zero TTL was treated as falsy and stored no deadline at all, so `set(key, value, 0)` produced an entry that *never* expired — the opposite of what a test writing `0` to mean "already stale" intended. If a test of yours relied on `0` meaning "no expiry", drop the argument instead.

### Example: recording event bus

The test bus publishes through a real `EventBus` and keeps a copy of every publication. Dispose it when the test ends.

```ts
import { it, expect } from "vitest";
import {
  createTestEventBus,
  assertEventPublished,
  assertEventNotPublished,
} from "@zudojs/testing";

it("publishes user.created and nothing else", async () => {
  const testBus = createTestEventBus();

  await testBus.publish({ type: "user.created", payload: { id: "u_1" } });

  expect(testBus.published).toHaveLength(1);
  assertEventPublished(testBus.published, "user.created");
  assertEventNotPublished(testBus.published, "user.deleted");

  testBus.dispose();
});
```

**What you should see:** a pass. `testBus.published` hands back a copy, so holding on to it will not show later publications. `createTestMessageBus` works the same way with `send()` and `dispatched`, and `createTestQueue` with `add()` and `jobs`.

### Every path is recorded

In a real test you rarely call `publish` yourself. You hand the bus to the code under test and it publishes however it likes. Since 1.2.0 the doubles record every way in: the test event bus *is* an `EventBus` (so you can pass it wherever one is expected), and it records `publish`, `publishEvent` and `emit`. `testBus.bus` is the same object, kept so older tests still compile.

```ts
import { it, expect } from "vitest";
import { createTestEventBus } from "@zudojs/testing";
import type { EventBus } from "@zudojs/events";

// The code under test only knows it gets an EventBus.
async function registerUser(events: EventBus, name: string): Promise<void> {
  await events.publishEvent({ type: "user.created", payload: { name } });
}

it("records a publish made by code that was handed the bus", async () => {
  const events = createTestEventBus();

  await registerUser(events, "ann");     // the double itself is an EventBus
  await registerUser(events.bus, "bob"); // .bus is the same object

  expect(events.bus).toBe(events);
  expect(events.findByType("user.created")).toHaveLength(2);
  console.log(events.published.map((entry) => entry.event.payload));
  // [ { name: 'ann' }, { name: 'bob' } ]

  events.dispose();
});
```

**What you should see:** a pass, and the two payloads printed. `publish` now accepts a full `Event`, as `EventBus.publish` does, as well as the short `{ type, payload }` input it always took. The same goes for the other doubles: `createTestMessageBus()` is a `MessageBus` that records both `send` and `dispatch`, and `createTestQueue()` is a `Queue` that records `add` whether you call it on the double or on `testQueue.queue`. Destructured methods (`const { publish } = createTestEventBus()`) keep working.

The test queue also passes `onJobReady` through to the real queue, so a `Worker` from [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) running on a test queue wakes up as soon as a job is added instead of waiting for its next poll.

> **Changed in v1.2.0:** before this release only the double's own wrapper method recorded. `createTestEventBus().bus.publishEvent(...)`, `createTestMessageBus().bus.send(...)` and `createTestQueue().queue.add(...)` ran but recorded nothing, so a test asserting on `published`, `dispatched` or `jobs` could pass while checking an empty list. If one of your assertions such as `toHaveLength(0)` now fails, it was hiding a real publication.

### A test application: quiet and fixed in time

`createTestApplication()` gives you a container, a logger, a clock and a cleanup manager in one object. By default it prints nothing and always starts at the same moment. The logger is a `createSpyLogger(name)` that records every line in `app.logger.calls`, and the clock is a test clock pinned at `DEFAULT_TEST_APPLICATION_TIME` (2026-01-01T00:00:00.000Z).

```ts
import { it, expect } from "vitest";
import { createTestApplication, DEFAULT_TEST_APPLICATION_TIME } from "@zudojs/testing";

it("logs quietly and reads a fixed time", async () => {
  const app = createTestApplication({ name: "billing" });

  app.logger.info("invoice created", { invoiceId: "inv_1" }); // prints nothing

  expect(app.logger.calls).toHaveLength(1);
  expect(app.logger.findByMessage("invoice")).toHaveLength(1);
  console.log(app.clock.now.toISOString()); // 2026-01-01T00:00:00.000Z
  expect(app.clock.timestamp).toBe(DEFAULT_TEST_APPLICATION_TIME);

  await app.dispose(); // closes the container, then the logger
});
```

**What you should see:** a pass, the date `2026-01-01T00:00:00.000Z` printed, and no log line in the output. To opt back in to the old behaviour, pass `logger: createLogger({ name })` from [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) to print, `clock` for a clock of your own, or `startTime` to move the default clock (`startTime: Date.now()` for the wall-clock time). `app.logger` is typed as the logger you passed, or as a `SpyLogger` when you passed none.

> **Changed in v1.2.0:** the application used to get a real logger that printed to the console and a clock that started at the current time. A test that read `app.clock.now` and expected "today" now gets 2026-01-01; pass `startTime: Date.now()` if it really needs the current time.

## API REFERENCE

Everything below is exported from the package root: `import { … } from "@zudojs/testing"`.

### Factories

| Name | What it does | Notes |
| --- | --- | --- |
| `createMockFn(default?)` | Fake function that records calls and returns configured values. | Pass a default return value, or nothing. |
| `createSpyFn(fn)` | Wraps a function, recording calls, results and errors. | Clear with `reset()`. |
| `createSpyMethod(obj, key)` | Replaces a method in place with a recording wrapper. | Undo with `restore()`; throws if the property is not a function. |
| `createStub<T>(overrides?)` | Object whose methods return `undefined` unless overridden. | Safe to `await`. A generated no-op is memoised per property, so `stub.a === stub.a` (since v1.1.2). |
| `createStubClass(C, overrides?)` | Constructor whose instances pass `instanceof C`. | Non-overridden methods become no-ops. |
| `createTestClock(initialTime?)` | Clock you move by hand. | Accepts `Date` / string / number; throws on an unparseable value. |
| `createCleanupManager(options?)` | Runs registered cleanups in reverse order. | Options: `label`, `onError`. |
| `createTestContext(options?)` | Clock + cleanup + log/event/message recorders. | Options: `clock`, `cleanup`. |
| `createLogRecorder()` `createEventRecorder()` `createMessageRecorder()` | The individual recorders, if you want them on their own. | Used internally by `createTestContext`. |
| `createTestContainer(options?)` | Started DI container with `overrides` registered. | Exposes `resolve`, `has`, `dispose`. |
| `createTestApplication(options?)` | Container, logger, clock and cleanup in one object. | Options: `name`, `container`, `logger` (default: silent `createSpyLogger(name)`), `clock`, `startTime` (default: `DEFAULT_TEST_APPLICATION_TIME`), `cleanup`. `dispose()` closes the container, then the logger. See [A test application](#test-application). |
| `createSpyLogger(name?, level?)` | Recording logger; children share the recording. | Defaults: name `"test"`, level `LEVELS.trace`. |
| `createTestConfigManager(values?, options?)` | Config manager pre-loaded with values. | `autoLoad` is off by default. |
| `createTestEventBus(options?)` | Started `EventBus` that records `publish`, `publishEvent` and `emit`. | `.bus` is the same instance. `published`, `findByType`, `clear`. Call `dispose()`. |
| `createTestMessageBus(options?)` | `MessageBus` that records `send` and `dispatch`. | `dispatched`, `findByType`, `clear`. Call `dispose()`. |
| `createTestQueue(name, options?)` | In-memory `Queue` that records `add`, on the double and on `.queue`. | `jobs`, `findByName`, `clear`; forwards `onJobReady`. Call `close()`. |
| `createHttpTestClient(target, options?)` | Sends real HTTP requests to your app, supertest style. | Options: `cleanup`, `timeout`, `headers`, `cookies`, `kind`, `origin`, `adapter`. See [Testing an HTTP app](#http-test-client). |
| `createHttpTestCookieJar()` | A standalone cookie jar, the one the client uses. | `get`, `set`, `delete`, `clear`, `toJSON`, `size`. |
| `createTestHTTPRequest()` | Fluent request builder. | Finish with `build()`. |
| `createHTTPRequest(method, path, options?)` | Request in one call. | Options: `headers`, `query`, `body`, `params`. `query` and `params` are copied, so changing your object afterwards does not change the request. |
| `createTestHTTPResponse()` | Fluent response builder. | `json` / `text` / `html` set the content type. |
| `createHTTPResponse(status, body?, headers?)` | Response in one call. | Always marked `sent`. |
| `jsonResponse` `createdResponse` `noContentResponse` `badRequestResponse` `notFoundResponse` `serverErrorResponse` | Ready-made 200 / 201 / 204 / 400 / 404 / 500 responses. | The 4xx and 5xx ones use a `{ error }` body. |
| `createEvent` `createEventInput` `createEvents` | Event fixtures. | Defaults to type `"test.event"`. |
| `createMessage` `createMessageInput` `createMessages` | Message fixtures. | Defaults to type `"test.message"`. |

### Assertions and comparison

| Name | What it does | Notes |
| --- | --- | --- |
| `deepEqual(a, b)` | Structural equality. `Set` members and `Map` keys are matched by value, not identity. | Returns a boolean; never throws. |
| `findDifference(actual, expected, rootPath?)` | First difference as `{ path, reason }`. | `undefined` when equal; root path defaults to `"value"`. |
| `describeValue(value, depth?)` | Renders a value for a message. | Handles circular and `BigInt` input. |
| `assertResponseStatus` `assertOK` `assertCreated` `assertNoContent` `assertBadRequest` `assertNotFound` `assertServerError` | Status-code checks on a test response. | — |
| `assertResponseHeader(response, name, value)` | Exact header match. | Name is lower-cased first. |
| `assertResponseBody(response, expected)` | Whole-body structural match. | Extra keys in the body fail. |
| `assertResponseBodyContains(response, expected)` | Partial match on the listed keys. | Body must be an object. |
| `assertEventType` `assertRecordedEventType` `assertEventPayload` | Checks on a single event. | Payload is compared structurally. |
| `assertEventPublished` `assertEventNotPublished` | Checks over an array of recorded events. | Pass `bus.published`. |
| `assertMessageDispatched` `assertMessageNotDispatched` | Checks over an array of recorded messages. | Pass `bus.dispatched`. |
| `assertThrows(fn, message?)` | Requires a synchronous throw; returns the error. Passing an async (promise-returning) function throws "use assertRejects" and handles the rejection, so nothing leaks as an unhandled rejection. | `message` is a substring. |
| `assertRejects(fn, message?)` | Requires a rejection; resolves to the error. | Must be awaited. |
| `assertErrorType(error, Class)` | Requires `instanceof Class`. | Narrows the type for TypeScript. |
| `assertErrorCode(error, code)` | Checks a Zudojs error's `code`. | — |
| `assertErrorMetadata(error, key, value)` | Checks one metadata entry. | Compared structurally. |
| `assertSerializesCorrectly` `assertSerializesTo` `assertDeserializesTo` `assertTypePreservesRoundTrip` | Serialization round-trip checks. | `assertSerializesCorrectly` and `assertDeserializesTo` compare structurally; `assertSerializesTo` compares the JSON string. See the note above. |

### Classes, constants and helpers

| Name | What it does | Notes |
| --- | --- | --- |
| `InMemoryTestStorage` | Key-value store: `get`, `set`, `delete`, `has`, `clear`, `keys()`, `size`. | `set(key, value, ttlMs)` expires entries at `now + ttlMs`; `ttlMs: 0` is already expired and only an omitted TTL never expires (changed in v1.1.2). A `NaN` TTL throws a `RangeError`, and `delete` returns `false` for an expired key (both since v1.2.0). `has` tells a stored `null` from a miss. |
| `DEFAULT_TEST_APPLICATION_TIME` | Where `createTestApplication`'s default clock starts. | `Date.UTC(2026, 0, 1)`, i.e. 2026-01-01T00:00:00.000Z. |
| `LEVELS` | Numeric log levels: fatal 0 → trace 5. | Use with `createSpyLogger`'s second argument. |
| `createRecordingLogger`, `deepMatches`, `mergeContext`, `mergeLoggerContext` | Internals the spy logger is built from. | Exported, but rarely needed directly. |

### Types

HTTP test client: `HttpTestClient`, `HttpTestClientOptions`, `HttpTestTarget`, `HttpTestTargetKind`, `HttpTestRequest`, `HttpTestResponse`, `HttpTestExpectation`, `HttpTestCookieJar`, `FetchHandler`, `FetchApplication` and `NodeRequestListener`.

All of these are exported as types only. Mocking: `MockFn`, `SpyFn`, `SpyMethod`. Clock and cleanup: `TestClock`, `CleanupManager`, `CleanupEntry`, `CleanupManagerOptions`. Context: `TestContext`, `TestContextOptions`, `LogRecorder`, `EventRecorder`, `MessageRecorder`, `CapturedLogEntry`, `CapturedEvent`, `CapturedMessage`. Services: `TestContainer`, `TestContainerOptions`, `DependencyOverride`, `TestApplication`, `TestApplicationOptions`, `TestConfigManager`, `TestEventBus`, `RecordedEvent`, `TestMessageBus`, `RecordedMessage`, `TestQueue`, `RecordedJob`. HTTP: `TestHTTPRequest`, `HTTPRequestBuilder`, `TestHTTPResponse`, `HTTPResponseBuilder`. Logger: `SpyLogger`, `LogCall`, `Recorder`, `DerivedOptions`. Fixtures and comparison: `CreateEventOptions`, `CreateMessageOptions`, `Difference`.

## COMMON MISTAKES

- **Expecting `mockRejectedValue` to throw as you call it.** Your `expect(() => mock()).toThrow()` fails and the rejection surfaces later as an unhandled promise. *Fix:* `await expect(mock()).rejects.toThrow("boom")`.
- **Not awaiting `cleanup.dispose()`.** A failing cleanup rejects with an `AggregateError` that lands on whichever test happens to be running. *Fix:* `await ctx.dispose()` in `afterEach`.
- **Reusing a cleanup manager after disposing it.** `register()` throws "Cannot register cleanup after manager has been disposed." *Fix:* build a fresh manager (or a fresh test context) per test.
- **Expecting `clock.reset()` to return to the time you started with.** It jumps to the real current time, so later expiry checks silently pass. *Fix:* call `clock.set(startTime)` with your fixed time instead.
- **Passing the bus itself to an event assertion.** `assertEventPublished(bus, "user.created")` is a type error, and at runtime nothing matches. *Fix:* pass the recorded array — `assertEventPublished(bus.published, "user.created")`.
- **Checking a `Map` or `Set` with `assertSerializesTo`.** It compares JSON strings, and those types stringify to `{}`, so `assertSerializesTo(new Map([["a", 1]]), "{}")` passes while the contents are lost. *Fix:* use `assertSerializesCorrectly`, which compares the round-tripped value structurally, or `assertTypePreservesRoundTrip` with your own checker.
- **Expecting `createTestApplication()` to print its logs or use today's date.** Since v1.2.0 its logger is silent and its clock starts at 2026-01-01. *Fix:* read `app.logger.calls`, or pass `logger` / `startTime: Date.now()`.
- **Not awaiting an HTTP test request.** `client.get("/users/7").expect(200)` on its own sends nothing and checks nothing, so the test passes whatever the app does. *Fix:* `await` every chain.
- **Forgetting `spy.restore()` after `createSpyMethod`.** The object keeps the wrapper for the rest of the file, and later tests count calls they did not make. *Fix:* restore in `afterEach`, or register it with the cleanup manager.

## RELATED PACKAGES

- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — the dependency injection container that `createTestContainer` wraps; read it to understand tokens and overrides.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — the `Logger` interface that `createSpyLogger` implements, including levels and child loggers.
- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — the real event bus behind `createTestEventBus`, and the `Event` shape the fixtures build.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — jobs, retries and queue options for `createTestQueue`.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the router, server and adapter that `createHttpTestClient` serves on a free port.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the error classes whose `code` and `metadata` the error assertions read.

## COMPLETE EXPORT INDEX

Every name `@zudojs/testing` exports from its package root at v1.2.4 — **125** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 125 exports**

Classes (1)

`InMemoryTestStorage`

Functions (70)

`assertBadRequest` `assertCreated` `assertDeserializesTo` `assertErrorCode` `assertErrorMetadata` `assertErrorType` `assertEventNotPublished` `assertEventPayload` `assertEventPublished` `assertEventType` `assertMessageDispatched` `assertMessageNotDispatched` `assertNoContent` `assertNotFound` `assertOK` `assertRecordedEventType` `assertRejects` `assertResponseBody` `assertResponseBodyContains` `assertResponseHeader` `assertResponseStatus` `assertSerializesCorrectly` `assertSerializesTo` `assertServerError` `assertThrows` `assertTypePreservesRoundTrip` `badRequestResponse` `createCleanupManager` `createdResponse` `createEvent` `createEventInput` `createEventRecorder` `createEvents` `createHTTPRequest` `createHTTPResponse` `createHttpTestClient` `createHttpTestCookieJar` `createLogRecorder` `createMessage` `createMessageInput` `createMessageRecorder` `createMessages` `createMockFn` `createRecordingLogger` `createSpyFn` `createSpyLogger` `createSpyMethod` `createStub` `createStubClass` `createTestApplication` `createTestClock` `createTestConfigManager` `createTestContainer` `createTestContext` `createTestEventBus` `createTestHTTPRequest` `createTestHTTPResponse` `createTestMessageBus` `createTestQueue` `deepEqual` `deepMatches` `describeValue` `findDifference` `findPartialDifference` `jsonResponse` `mergeContext` `mergeLoggerContext` `noContentResponse` `notFoundResponse` `serverErrorResponse`

Interfaces (43)

`CapturedEvent` `CapturedLogEntry` `CapturedMessage` `CleanupEntry` `CleanupManager` `CleanupManagerOptions` `CreateEventOptions` `CreateMessageOptions` `DependencyOverride` `DerivedOptions` `Difference` `EventRecorder` `FetchApplication` `HTTPRequestBuilder` `HTTPResponseBuilder` `HttpTestClient` `HttpTestClientOptions` `HttpTestCookieJar` `HttpTestRequest` `HttpTestRequestSummary` `HttpTestResponse` `LogRecorder` `MessageRecorder` `MockFn` `RecordedEvent` `RecordedJob` `RecordedMessage` `Recorder` `SpyFn` `SpyMethod` `TestApplication` `TestApplicationOptions` `TestClock` `TestConfigManager` `TestContainer` `TestContainerOptions` `TestContext` `TestContextOptions` `TestEventBus` `TestHTTPRequest` `TestHTTPResponse` `TestMessageBus` `TestQueue`

Type aliases (9)

`FetchHandler` `HttpTestAdapterOptions` `HttpTestBody` `HttpTestExpectation` `HttpTestQuery` `HttpTestQueryValue` `HttpTestTarget` `HttpTestTargetKind` `NodeRequestListener`

Constants (2)

`DEFAULT_TEST_APPLICATION_TIME` `LEVELS`
