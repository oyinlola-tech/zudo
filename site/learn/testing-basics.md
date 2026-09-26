---
title: "Testing fundamentals — ZudoJS Academy"
description: "Test a backend with Node's built-in runner: unit, integration and end-to-end tests, assertions, mocks and spies, isolated tests and a fresh test database."
source: https://zudojs.oyinlola.site/learn/testing-basics
---

LEVEL 7 · LESSON 6 OF 15

Testing Core

# Testing fundamentals

Test a backend with Node's built-in runner: unit, integration and end-to-end tests, assertions, mocks and spies, isolated tests and a fresh test database.

- **45 min** to read and try
- **You need:** Joins, grouping and transactions, HTTP in depth, and Testing TypeScript
- **You build:** A test suite for a task list, a task store on a real test database, and an HTTP endpoint

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell unit, integration and end-to-end tests apart, and pick the level for a check
- Write tests with node:assert/strict and node:test, and run them with npm test
- Replace an e-mail sender or another edge with mock.fn and mock.method, and restore it
- Keep tests isolated with beforeEach and a fresh PGlite database per test
- Test an HTTP endpoint end to end on a free port
- Translate node:test tests to Vitest and back

## Why test?

In [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) you tested pure functions and types with Vitest. A backend is harder to test. Its code talks to a database, sends e-mail, and answers HTTP requests, and every change can break something that used to work. Nobody re-checks forty endpoints by hand after each commit. An **automated test** is a small program that runs your code with known input and checks the result. You write it once, and it runs again in seconds, as often as you like: before every commit, and on every pull request, where CI runs it for you ([Professional Git](https://zudojs.oyinlola.site/learn/git-collaboration#pull-requests)).

This lesson tests a small task list, a task store on a real database, and an HTTP endpoint. It uses the test runner built into Node.js, `node:test`, which needs nothing installed; the rest of this course uses it too. Everything carries over to Vitest, and the [last section](#vitest) shows how the names map.

Tests come in three sizes:

| Kind | Tests | Speed | Example |
| --- | --- | --- | --- |
| **Unit** | One function or class, alone | Milliseconds | `validateTitle(" ")` throws |
| **Integration** | Several parts together, such as your code and a real database | Tenths of a second | The task store saves a row and reads it back |
| **End-to-end** (e2e) | The whole system from the outside, like a user or client | Seconds | `POST /tasks` over HTTP returns 201 |

Most projects write many unit tests, a good number of integration tests, and a few end-to-end tests: the fast ones catch most bugs, the slow ones prove the parts really fit together. This lesson writes all three.

## Assertions

An **assertion** is a check that throws an error when something is not as expected. At its heart, a test is just that:

check.js

```ts
function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const slug = (title) => title.trim().toLowerCase().replaceAll(" ", "-");

assertEqual(slug("Buy milk"), "buy-milk");
console.log("test 1 passed");
try {
  assertEqual(slug("  Call Ada "), "call-ada ");
} catch (error) {
  console.log("test 2 failed:", error.message);
}
```

Output of `node check.js` and of the browser terminal

```ts
test 1 passed
test 2 failed: Expected "call-ada ", got "call-ada"
```

Test 2 failed because the *test* was wrong: it expected a trailing space that `trim` removes. That happens too. A failing test means "look here", not always "the code is broken".

Node.js has a complete set of assertions built in, in `node:assert/strict`. The `strict` version compares with `===`, which is what you want:

assert.jsNode.js only

```ts
import assert from "node:assert/strict";

assert.equal(2 + 2, 4);
assert.deepEqual({ id: 1, tags: ["home"] }, { id: 1, tags: ["home"] });
assert.throws(() => JSON.parse("{oops"), SyntaxError);
await assert.rejects(Promise.reject(new Error("db down")), /db down/);
console.log("all four passed");

try {
  assert.deepEqual({ id: 1, done: false }, { id: 1, done: true });
} catch (error) {
  console.log(error.message);
}
```

Output of `node assert.js`

```ts
all four passed
Expected values to be strictly deep-equal:
+ actual - expected

  {
+   done: false,
-   done: true,
    id: 1
  }
```

- `equal` compares simple values. `deepEqual` compares objects and arrays by their content, not by identity.
- `throws` checks that a function throws, here a `SyntaxError`. `rejects` does the same for a promise, and needs `await`.
- When an assertion fails, it throws an `AssertionError` whose message shows the difference: `+` is what you got (actual), `-` is what you expected.

## Node's test runner: describe and it

Node.js also has a **test runner** built in, `node:test`. It runs your tests, keeps going when one fails, and prints a report. Here is the code to test, a small task list:

tasks.jsNode.js only

```ts
export function validateTitle(title) {
  if (typeof title !== "string") {
    throw new TypeError("title must be a string");
  }
  const trimmed = title.trim();
  if (trimmed.length < 3 || trimmed.length > 100) {
    throw new RangeError("title must be 3 to 100 characters");
  }
  return trimmed;
}

export class TaskList {
  constructor(notify = () => {}) {
    this.tasks = [];
    this.notify = notify;
  }

  add(title) {
    const task = { id: this.tasks.length + 1, title: validateTitle(title), done: false };
    this.tasks.push(task);
    this.notify("task.added", task);
    return task;
  }

  complete(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.done = true;
    return task;
  }
}
```

`describe` groups tests, and `it` defines one test: a name that reads like a sentence, and a function. By convention test files end in `.test.js`:

tasks.test.jsNode.js only

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskList, validateTitle } from "./tasks.js";

describe("validateTitle", () => {
  it("trims spaces", () => {
    assert.equal(validateTitle("  Buy milk "), "Buy milk");
  });

  it("rejects titles that are too short", () => {
    assert.throws(() => validateTitle(" a "), RangeError);
  });

  it("rejects values that are not strings", () => {
    assert.throws(() => validateTitle(42), { message: "title must be a string" });
  });
});

describe("TaskList", () => {
  it("adds and completes a task", () => {
    const list = new TaskList();
    const task = list.add("Buy milk");
    assert.deepEqual(list.complete(task.id), { id: 1, title: "Buy milk", done: true });
  });
});
```

Output of `node tasks.test.js`

```ts
▶ validateTitle
  ✔ trims spaces (2.541186ms)
  ✔ rejects titles that are too short (1.549167ms)
  ✔ rejects values that are not strings (1.874239ms)
✔ validateTitle (10.946031ms)
▶ TaskList
  ✔ adds and completes a task (2.317796ms)
✔ TaskList (5.625268ms)
ℹ tests 4
ℹ suites 2
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 54.887707
```

A `✔` marks each passing test, with its duration in milliseconds. Your times will be different; everything else should match. The summary counts tests, suites (the `describe` groups) and results.

To run it on your computer, put `tasks.js` and `tasks.test.js` in a new folder, `tasks`, with `"type": "module"` in its `package.json`. You can run one file with `node tasks.test.js`, as above, or let Node find every test file in the project with `node --test`. Put that in `package.json` as the `test` script, so the whole team and your CI use one command, `npm test`:

Terminal on your computer

```bash
$ npm pkg set scripts.test="node --test"
$ npm test

> tasks@1.0.0 test
> node --test

▶ validateTitle
  ✔ trims spaces (2.568283ms)
  ✔ rejects titles that are too short (1.988112ms)
  ✔ rejects values that are not strings (3.709841ms)
✔ validateTitle (18.530572ms)
▶ TaskList
  ✔ adds and completes a task (2.234005ms)
✔ TaskList (2.728223ms)
ℹ tests 4
ℹ suites 2
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 420.674511
```

When a test fails, the runner says which one, where, and why. Here someone "simplified" `validateTitle` to `const trimmed = title;`. Two tests caught it: the title is no longer trimmed, and `" a "` now counts as 3 characters, so it is no longer rejected (the long stack traces are shortened with …):

Terminal on your computer

```bash
$ npm test

> tasks@1.0.0 test
> node --test

▶ validateTitle
  ✖ trims spaces (4.55542ms)
  ✖ rejects titles that are too short (0.995711ms)
  ✔ rejects values that are not strings (4.712584ms)
✖ validateTitle (15.031252ms)
▶ TaskList
  ✔ adds and completes a task (2.296583ms)
✔ TaskList (2.937544ms)
ℹ tests 4
ℹ suites 2
ℹ pass 2
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 235.543004

✖ failing tests:

test at tasks.test.js:6:3
✖ trims spaces (4.55542ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + '  Buy milk '
  - 'Buy milk'

      at TestContext.<anonymous> (file://~/tasks/tasks.test.js:7:12)
      …

test at tasks.test.js:10:3
✖ rejects titles that are too short (0.995711ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception (RangeError).
      at TestContext.<anonymous> (file://~/tasks/tasks.test.js:11:12)
      …
```

The exit code is 1 when any test fails. That is how CI knows to block a pull request.

## Mocks and spies

`TaskList` calls a `notify` function whenever a task is added. In the real app it might send an e-mail. In a test you do not want e-mails; you want to know that `notify` *was called, with the right arguments*. A **mock function** is a fake that records every call. `mock.fn()` makes one:

notify.test.jsNode.js only

```ts
import { it, mock } from "node:test";
import assert from "node:assert/strict";
import { TaskList } from "./tasks.js";

it("notifies once per added task", () => {
  const notify = mock.fn();
  const list = new TaskList(notify);

  list.add("Buy milk");
  list.add("Call Ada");

  assert.equal(notify.mock.callCount(), 2);
  assert.deepEqual(notify.mock.calls[1].arguments, ["task.added", { id: 2, title: "Call Ada", done: false }]);
});

it("does not notify when the title is invalid", () => {
  const notify = mock.fn();
  const list = new TaskList(notify);
  assert.throws(() => list.add("x"));
  assert.equal(notify.mock.callCount(), 0);
});
```

Output of `node notify.test.js`

```ts
✔ notifies once per added task (16.356168ms)
✔ does not notify when the title is invalid (0.777526ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 102.868739
```

`notify.mock.calls` is an array with one entry per call, and each entry has the `arguments`. The second test checks something that must *not* happen, which is just as important.

Sometimes the code under test does not take the function as an argument, but calls a method on an object it imports. `mock.method(object, "name", fake)` replaces that method for the test and records calls. Wrapping a real method to watch it without changing what it does is called a **spy**:

mailer.test.jsNode.js only

```ts
import { afterEach, it, mock } from "node:test";
import assert from "node:assert/strict";

const mailer = {
  send(to, text) {
    throw new Error("tests must never send real e-mail");
  },
};

async function inviteUser(email) {
  await mailer.send(email, "Welcome to the Task API");
  return { invited: email };
}

afterEach(() => mock.restoreAll());

it("sends a welcome mail", async () => {
  const send = mock.method(mailer, "send", async () => {});
  const result = await inviteUser("ada@example.com");
  assert.deepEqual(result, { invited: "ada@example.com" });
  assert.deepEqual(send.mock.calls[0].arguments, ["ada@example.com", "Welcome to the Task API"]);
});

it("spies on a real method without replacing it", () => {
  const spy = mock.method(Math, "max");
  assert.equal(Math.max(3, 7), 7);
  assert.equal(spy.mock.callCount(), 1);
});
```

Output of `node mailer.test.js`

```ts
✔ sends a welcome mail (5.566413ms)
✔ spies on a real method without replacing it (1.128211ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26.539801
```

`mock.restoreAll()` in `afterEach` puts the real methods back after every test, so one test's fake can never leak into the next.

> TIP
>
> Mock the edges of your system (e-mail, payment providers, other services, the clock), not your own logic. A test that mocks everything only proves that the mocks work. [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies#doubles), later in this course, sorts stand-ins into dummies, stubs, spies, mocks and fakes, and shows when each one fits.

## Test isolation

Each test must pass on its own and in any order. If test B only passes because test A added a task first, then running B alone, or changing A, breaks B for no visible reason. The fix is to give every test a **fresh** start. `beforeEach` runs before every test in its `describe`:

isolation.test.jsNode.js only

```ts
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskList } from "./tasks.js";

describe("TaskList ids", () => {
  let list;

  beforeEach(() => {
    list = new TaskList();
    list.add("Buy milk");
  });

  it("gives the next task id 2", () => {
    assert.equal(list.add("Call Ada").id, 2);
  });

  it("still gives id 2 in the next test", () => {
    assert.equal(list.add("Fix bike").id, 2);
  });
});
```

Output of `node isolation.test.js`

```ts
▶ TaskList ids
  ✔ gives the next task id 2 (4.504445ms)
  ✔ still gives id 2 in the next test (1.123982ms)
✔ TaskList ids (10.533501ms)
ℹ tests 2
ℹ suites 1
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 51.843746
```

Both tests see a list with exactly one task. Without `beforeEach`, a shared list would give the second test id 3, and the result would depend on the order the tests run in. There are also `afterEach`, `before` (once, before all tests) and `after` (once, at the end).

## Integration tests with a test database

REASON IT OUT

### Mock the database, or use a real one?

You want to test `createTask(db, userId, title)`, which runs an `insert`. You could pass a fake `db` whose `query` just records the SQL it was given, or a real PostgreSQL. Before choosing, answer:

- Which bugs would a test with a fake `db` catch? Which would it miss?
- What does the real database cost you in speed and setup?
- Test A inserts "Buy milk". Test B checks that the table is empty. What happens if they share one database?

**Show the reasoning**

A fake `db` can only check that your function sent *some* text. A typo in a column name, a missing `returning`, a `check` constraint the data breaks, a wrong placeholder number: the fake accepts them all, and the test passes while the code is broken. For code whose whole job is SQL, only a real database tests anything. (Mocks are right at the edges you do not control, such as the e-mail sender above.)

The cost is time: starting PostgreSQL takes a moment, even in-process with PGlite. And shared state: if tests A and B use one database, B passes or fails depending on whether A ran first. So each test gets its own clean copy, made cheaply, as below.

A task store that runs SQL is best tested against a **real** database: a mock would not notice a typo in the SQL or a broken constraint. The same isolation rule applies, so each test needs its own clean database. PGlite from [How databases work](https://zudojs.oyinlola.site/learn/databases) makes that easy. Creating a database takes a few seconds, so the file builds one **template** with the schema in `before`, and `beforeEach` gives every test its own copy with `clone()`, which is much faster:

store.test.jsNode.js only

```ts
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

async function createTask(db, userId, title) {
  const { rows } = await db.query("insert into tasks (user_id, title) values ($1, $2) returning id, title", [userId, title]);
  return rows[0];
}

async function listTasks(db, userId) {
  return (await db.query("select title from tasks where user_id = $1 order by id", [userId])).rows;
}

describe("task store", () => {
  let template;
  let db;

  before(async () => {
    template = new PGlite();
    await template.exec(`create table tasks (
      id integer generated always as identity primary key,
      user_id integer not null,
      title text not null check (title <> ''))`);
  });
  beforeEach(async () => {
    db = await template.clone();
  });
  afterEach(() => db.close());
  after(() => template.close());

  it("creates a task and gives it an id", async () => {
    assert.deepEqual(await createTask(db, 1, "Buy milk"), { id: 1, title: "Buy milk" });
  });

  it("starts empty again and lists only the user's own tasks", async () => {
    await createTask(db, 1, "Buy milk");
    await createTask(db, 2, "Fix bike");
    assert.deepEqual(await listTasks(db, 1), [{ title: "Buy milk" }]);
  });

  it("lets the database reject an empty title", async () => {
    await assert.rejects(createTask(db, 1, ""), { code: "23514" });
  });
});
```

Output of `node store.test.js`

```ts
▶ task store
  ✔ creates a task and gives it an id (1540.780516ms)
  ✔ starts empty again and lists only the user's own tasks (1759.484352ms)
  ✔ lets the database reject an empty title (1726.781556ms)
✔ task store (14172.84682ms)
ℹ tests 3
ℹ suites 1
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14192.553736
```

The second test got id 1 again for "Buy milk": its database really was a fresh copy. The third test checks that the `check` constraint works; `23514` is PostgreSQL's code for a check violation. Each test's time includes making its copy in `beforeEach`, and the suite's total also includes building the template in `before`. Your times will differ, but a copy is ready several times faster than a new database.

Against a real PostgreSQL server you would do the same with a separate test database, never your development or production one, and either recreate its tables or wrap each test in a transaction that is rolled back at the end.

## Testing over HTTP

An end-to-end test talks to your API the way a client does. Start the server on a free port in `before`, send real requests with `fetch`, and close it in `after`:

api.test.jsNode.js only

```ts
import http from "node:http";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskList } from "./tasks.js";

function createServer(list) {
  return http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const task = list.add(JSON.parse(body).title);
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify(task));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
    }
  });
}

describe("POST /tasks", () => {
  let server;
  let url;

  before(async () => {
    server = createServer(new TaskList());
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}/tasks`;
  });
  after(() => server.close());

  const post = (body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });

  it("creates a task", async () => {
    const res = await post(JSON.stringify({ title: "Buy milk" }));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: 1, title: "Buy milk", done: false });
  });

  it("answers 400 for a bad title", async () => {
    const res = await post(JSON.stringify({ title: "x" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "title must be 3 to 100 characters" });
  });
});
```

Output of `node api.test.js`

```ts
▶ POST /tasks
  ✔ creates a task (144.357192ms)
  ✔ answers 400 for a bad title (15.63144ms)
✔ POST /tasks (178.785677ms)
ℹ tests 2
ℹ suites 1
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 206.130498
```

This test checks the status codes and JSON bodies a client really receives. It would catch a wrong header or a crash in the request handling that a unit test of `TaskList` cannot see.

## The same tests in Vitest

You set up **Vitest** in [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing#setup). It is the runner ZudoJS projects use: it has a watch mode, nicer output, and runs TypeScript without setup. `node:test` needs nothing installed, which is why this course's backend lessons use it. The ideas are identical; only the names differ:

| node:test and node:assert | Vitest |
| --- | --- |
| `import { describe, it } from "node:test"` | `import { describe, it, expect, vi } from "vitest"` |
| `assert.equal(actual, expected)` | `expect(actual).toBe(expected)` |
| `assert.deepEqual(actual, expected)` | `expect(actual).toEqual(expected)` |
| `assert.throws(fn, RangeError)` | `expect(fn).toThrow(RangeError)` |
| `await assert.rejects(promise, /db down/)` | `await expect(promise).rejects.toThrow(/db down/)` |
| `mock.fn()`, `fn.mock.callCount()` | `vi.fn()`, `expect(fn).toHaveBeenCalledTimes(n)` |
| `mock.method(object, "name")`, `mock.restoreAll()` | `vi.spyOn(object, "name")`, `vi.restoreAllMocks()` |
| `before`, `beforeEach`, `afterEach`, `after` | `beforeAll`, `beforeEach`, `afterEach`, `afterAll` |
| `node --test` | `vitest run` (plain `vitest` starts watch mode) |

Here is part of this lesson's suite, translated:

tasks.test.js

```ts
import { describe, expect, it, vi } from "vitest";
import { TaskList, validateTitle } from "./tasks.js";

describe("validateTitle", () => {
  it("trims spaces", () => {
    expect(validateTitle("  Buy milk ")).toBe("Buy milk");
  });

  it("rejects titles that are too short", () => {
    expect(() => validateTitle(" a ")).toThrow(RangeError);
  });
});

describe("TaskList", () => {
  it("notifies once per added task", () => {
    const notify = vi.fn();
    new TaskList(notify).add("Buy milk");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("task.added", { id: 1, title: "Buy milk", done: false });
  });
});
```

A project uses one test runner: each would also try to run the other's test files. [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing) builds on Vitest.

## Practice

TRY IT YOURSELF

### Test complete()

Write tests for `TaskList.complete`: it marks the task as done, and it throws `Task 9 not found` for an id that does not exist. Use `beforeEach` for a fresh list.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`assert.equal(actual, expected)` checks a value. `list.complete(1)` returns the task, so check its `.done` property.

HINT 2

For the throw: `assert.throws(() => list.complete(9), { message: "Task 9 not found" })`. Note the arrow function: `assert.throws` must call it itself, not receive an already-thrown error.

SOLUTION

complete.test.jsNode.js only

```ts
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskList } from "./tasks.js";

describe("TaskList.complete", () => {
  let list;
  beforeEach(() => {
    list = new TaskList();
    list.add("Buy milk");
  });

  it("marks the task as done", () => {
    assert.equal(list.complete(1).done, true);
  });

  it("throws for a missing id", () => {
    assert.throws(() => list.complete(9), { message: "Task 9 not found" });
  });
});
```

Output of `node complete.test.js`

```ts
▶ TaskList.complete
  ✔ marks the task as done (3.525656ms)
  ✔ throws for a missing id (2.660301ms)
✔ TaskList.complete (10.265716ms)
ℹ tests 2
ℹ suites 1
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.078475
```

TRY IT YOURSELF

### Which kind of test?

Unit, integration or end-to-end? (a) `slug("Buy milk")` returns `buy-milk`; (b) `GET /v1/tasks?limit=0` returns a 400 problem details body; (c) the task store's SQL returns only the current user's tasks from PGlite; (d) `parseListQuery` reports an invalid `sort`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Does the test call a plain function directly, talk to a real database or dependency, or go in through HTTP the way a real client would?

HINT 2

(b) and (c) both touch something outside pure logic; what is the difference between "through HTTP" and "with a real database, but not through the network"?

SOLUTION

(a) Unit. (b) End-to-end: it goes through HTTP. (c) Integration: your code together with a real database. (d) Unit: it is a pure function.

## Recap

- Automated tests re-check your code in seconds after every change. Write many unit tests, some integration tests and a few end-to-end tests.
- `node:assert/strict` gives you `equal`, `deepEqual`, `throws` and `rejects`. `node:test` gives you `describe`, `it` and `node --test`.
- `mock.fn()` records calls; `mock.method()` replaces or spies on a method. Restore mocks after each test, and mock only the edges.
- Every test gets a fresh start with `beforeEach`, including a fresh database: a PGlite template and a `clone()` per test.
- Vitest works the same way with `expect` and `vi.fn()`, and ZudoJS projects use it.

Next: [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node), where the backend code becomes typed, starting with environment variables, files, requests and streams.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
