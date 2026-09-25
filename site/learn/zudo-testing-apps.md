---
title: "Testing a ZudoJS application layer by layer — ZudoJS Academy"
description: "Test the Task API one layer at a time with Vitest: services, PGlite repositories, auth sessions, events and queues, CQRS buses, HTTP routes and a full workflow."
source: https://zudojs.oyinlola.site/learn/zudo-testing-apps
---

LEVEL 14 · LESSON 11 OF 18

Quality and insight Advanced

# Testing a ZudoJS application layer by layer

Test the Task API one layer at a time with Vitest: services, PGlite repositories, auth sessions, events and queues, CQRS buses, HTTP routes and a full workflow.

- **60 min** to read and try
- **You need:** Testing a ZudoJS app, and the lessons on auth, events, queues and CQRS
- **You build:** A Vitest suite of 36 tests that covers every layer of the Task API, from the service rules to an end-to-end workflow over HTTP

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decide which layer of an app to test for which bug
- Unit-test a service with a fake repository and a test clock
- Run one contract suite against a fake and a real PostgreSQL repository
- Test sessions, token expiry, events, queues and CQRS buses without waiting or flakiness
- Write HTTP and end-to-end tests that drive the real app through its composition root

## Green tests, broken app

In [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing) you tested a task service with doubles all around it, and every test passed. Here is a bug that such a suite can never catch. The service asks its repository for tasks and keeps the overdue ones. The unit test uses a fake repository that returns tidy objects. The real repository returns database rows, and someone forgot to map one column name:

green-but-broken.js

```ts
const now = new Date("2026-10-03T09:00:00Z");

function overdue(tasks) {
  return tasks.filter((task) => task.dueAt < now).map((task) => task.title);
}

// What the fake repository in the unit test returns
const fromFake = [{ title: "Buy milk", dueAt: new Date("2026-10-02T09:00:00Z") }];
// What PostgreSQL returns when the row is not mapped: due_at, not dueAt
const fromPostgres = [{ title: "Buy milk", due_at: new Date("2026-10-02T09:00:00Z") }];

console.log("unit test with the fake:", overdue(fromFake));
console.log("production with PostgreSQL:", overdue(fromPostgres));
```

Output of `node green-but-broken.js` and of the browser terminal

```ts
unit test with the fake: [ 'Buy milk' ]
production with PostgreSQL: []
```

`undefined < now` is `false`, so in production nothing is ever overdue, and no reminder is ever sent. The unit test is right about the service and says nothing about the repository. Other bugs hide in the same way: a route that forgot its login check, an event nobody subscribed to, a job that is queued but never processed, a command handler that reads the user from the request body.

Each **layer** of an application (the rules, the database access, the login, the messages, the HTTP routes) can break in a way that only a test of *that* layer notices. This lesson tests the Task API one layer at a time, with the cheapest test that can catch each kind of bug, and finishes with one test that drives the whole app like a user.

## The app and its layers

The Task API in this lesson lets users sign in, create tasks, assign them to someone else and complete them. When a task is assigned, the assignee gets an e-mail. A request travels through these layers:

```ts
 HTTP request
     │
     ▼
 http.ts          routes, login check, body validation, status codes
     │
     ▼
 task.cqrs.ts     commands and queries; who is asking comes from the context
     │
     ▼
 task.service.ts  the rules: who may assign, who may complete, due dates
     │                    │
     ▼                    ▼ publishes task.assigned
 task.repository  notifications.ts ──► email queue ──► mailer
 (PostgreSQL)
```

The Task API's layers. auth.ts and users.ts sit beside the HTTP layer; app.ts connects everything.

A **unit test** checks one piece with doubles around it, an **integration test** checks a piece together with a real dependency such as the database, and an **end-to-end test** drives the whole app from the outside. The plan for this app:

| Layer | A typical bug | Test | Real | Replaced |
| --- | --- | --- | --- | --- |
| Service | A non-owner can assign a task | Unit | The service | Repository, event bus, clock |
| Repository | Wrong SQL, unmapped column, missing constraint | Integration | PostgreSQL (PGlite) | Nothing |
| Auth | A token that outlives its logout | Integration | `@zudojs/auth` | Time (Vitest fake `Date`) |
| Events and queue | No e-mail, two e-mails, no retry | Unit | Event bus, queue | Mailer |
| CQRS | The user taken from the payload | Unit | Buses, middleware, service | Repository |
| HTTP | A route without the login check, a leaked error | Integration | Everything but mail | Mailer, clock |
| Workflow | The pieces do not fit together | End-to-end | Everything but mail | Mailer, clock |

Most tests sit in the top rows: they are fast and point at the exact line that broke. The last rows are slower and fewer, but they are the only ones that prove the layers fit. That shape, many small tests and a few big ones, is the **test pyramid** from [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies).

REASON IT OUT

### Before you write a single test

Take any layer, for example the service. Answer four questions before you open a test file:

1. What does this layer decide *on its own*? That is what its tests must pin down.
2. What does it *trust* from the layer below? Those promises need their own tests, in the layer that makes them.
3. What would a bug here look like to a user?
4. Which dependency is slow, random or outside your control, and must be replaced?

**Show the reasoning**

For the service: it decides the rules (only the owner assigns; the owner or the assignee completes; a task is completed once; the due date is "now plus n days"). It trusts the repository to store and find tasks correctly, so the repository gets its own tests. A bug looks like "Bola assigned Ada's task to himself" or "the task is due on the wrong day". The clock is outside your control (it changes every run), so it must be replaced. The event bus is replaced by a recording one, so a test can see what was announced.

For the repository the answers are different: it decides almost nothing, but it translates between objects and SQL, and the database enforces rules of its own (unique titles, allowed statuses). Nothing about that can be tested with a fake, so its tests use a real PostgreSQL. Asking these four questions per layer is how you get the table above.

## Running Vitest on this page

The whole suite lives in one project. Vitest reads its settings from `vitest.config.ts`. The database tests start PostgreSQL, which takes a few seconds, so the time limits are higher than Vitest's defaults (5 seconds per test, 10 per hook):

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
```

On your computer you run `npx vitest run`. So that you can see real results on this page, each example below runs one test file through Vitest's own programming interface, `startVitest`, and prints one line per test: `✓` for a pass, `×` and the error for a failure. You can ignore how it works; it is the same Vitest, without the colours:

vitest-run.ts

```ts
import { startVitest } from "vitest/node";

/** Runs test files with Vitest and prints one line per test. */
export async function runTests(...files: string[]): Promise<void> {
  const vitest = await startVitest("test", files, { watch: false, reporters: [] });
  for (const file of vitest.state.getTestModules()) {
    for (const error of file.errors()) console.log(`× ${file.relativeModuleId}: ${error.message}`);
    for (const test of file.children.allTests()) {
      const { state, errors = [] } = test.result();
      console.log(`${state === "passed" ? "✓" : "×"} ${test.fullName}`);
      for (const error of errors) console.log(`    ${error.message}`);
    }
  }
  await vitest.close();
}
```

## Service unit tests

The service works with an interface, `TaskRepository`, never with SQL. That interface is the seam where a test can put a fake. Here are the types and the interface; the PostgreSQL class that implements it comes in the next section:

src/task.repository.ts

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";

export type TaskStatus = "open" | "done";
export interface Task {
  readonly id: number;
  readonly ownerId: string;
  readonly assigneeId: string | null;
  readonly title: string;
  readonly status: TaskStatus;
  readonly dueAt: Date;
}
export type NewTask = Pick<Task, "ownerId" | "title" | "dueAt">;
export type TaskChanges = Partial<Pick<Task, "assigneeId" | "status">>;

export interface TaskRepository {
  create(input: NewTask): Promise<Task>;
  findById(id: number): Promise<Task | undefined>;
  update(id: number, changes: TaskChanges): Promise<Task>;
  listVisibleTo(userId: string, status?: TaskStatus): Promise<Task[]>;
}

/** PGlite, a PGlite transaction and a pg Pool all have this method. */
export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface TaskRow {
  id: number; owner_id: string; assignee_id: string | null; title: string; status: TaskStatus; due_at: Date;
}
const toTask = (row: TaskRow): Task => ({
  id: row.id, ownerId: row.owner_id, assigneeId: row.assignee_id, title: row.title, status: row.status, dueAt: row.due_at,
});

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: NewTask): Promise<Task> {
    try {
      const { rows } = await this.db.query<TaskRow>(
        "INSERT INTO tasks (owner_id, title, due_at) VALUES ($1, $2, $3) RETURNING *",
        [input.ownerId, input.title, input.dueAt],
      );
      return toTask(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictError(`You already have a task called "${input.title}"`);
      throw error;
    }
  }

  async findById(id: number): Promise<Task | undefined> {
    const { rows } = await this.db.query<TaskRow>("SELECT * FROM tasks WHERE id = $1", [id]);
    return rows[0] === undefined ? undefined : toTask(rows[0]);
  }

  async update(id: number, changes: TaskChanges): Promise<Task> {
    const { rows } = await this.db.query<TaskRow>(
      `UPDATE tasks SET assignee_id = CASE WHEN $2 THEN $3 ELSE assignee_id END,
                        status = COALESCE($4, status)
       WHERE id = $1 RETURNING *`,
      [id, "assigneeId" in changes, changes.assigneeId ?? null, changes.status ?? null],
    );
    if (rows[0] === undefined) throw new NotFoundError(`Task ${id} not found`);
    return toTask(rows[0]);
  }

  async listVisibleTo(userId: string, status?: TaskStatus): Promise<Task[]> {
    const { rows } = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE (owner_id = $1 OR assignee_id = $1) AND ($2::text IS NULL OR status = $2)
       ORDER BY due_at, id`,
      [userId, status ?? null],
    );
    return rows.map(toTask);
  }
}
```

The service receives its three dependencies. `events` needs only a `publishEvent` method, and `now` is a function, so a test can hand in a clock it controls. Notice the rules: a task you cannot see is "not found" (a 404 later, so outsiders learn nothing), and a task you can see but do not own cannot be assigned (a 403):

src/task.service.ts

```ts
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";
import type { Task, TaskRepository, TaskStatus } from "./task.repository.js";

export interface TaskEvents {
  publishEvent(input: { type: string; payload: unknown }): Promise<unknown>;
}
export interface TaskServiceDeps {
  readonly tasks: TaskRepository;
  readonly events: TaskEvents;
  readonly now: () => Date;
}

const DAY = 86_400_000;

export function createTaskService({ tasks, events, now }: TaskServiceDeps) {
  async function visibleTask(userId: string, taskId: number): Promise<Task> {
    const task = await tasks.findById(taskId);
    if (task === undefined || (task.ownerId !== userId && task.assigneeId !== userId)) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  return {
    async create(ownerId: string, title: string, dueInDays: number): Promise<Task> {
      const clean = title.trim();
      if (clean.length < 3 || clean.length > 200) throw new ValidationError("A title needs 3 to 200 characters");
      if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) throw new ValidationError("dueInDays must be 0 to 365");
      return tasks.create({ ownerId, title: clean, dueAt: new Date(now().getTime() + dueInDays * DAY) });
    },

    async assign(actorId: string, taskId: number, assigneeId: string): Promise<Task> {
      const task = await visibleTask(actorId, taskId);
      if (task.ownerId !== actorId) throw new AuthorizationError("Only the owner can assign a task");
      const saved = await tasks.update(taskId, { assigneeId });
      await events.publishEvent({ type: "task.assigned", payload: { taskId, title: task.title, assigneeId } });
      return saved;
    },

    async complete(actorId: string, taskId: number): Promise<Task> {
      const task = await visibleTask(actorId, taskId);
      if (task.status === "done") throw new ConflictError(`Task ${taskId} is already done`);
      const saved = await tasks.update(taskId, { status: "done" });
      await events.publishEvent({ type: "task.completed", payload: { taskId, by: actorId } });
      return saved;
    },

    list(userId: string, status?: TaskStatus): Promise<Task[]> {
      return tasks.listVisibleTo(userId, status);
    },

    async overdue(userId: string): Promise<Task[]> {
      const open = await tasks.listVisibleTo(userId, "open");
      return open.filter((task) => task.dueAt < now());
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
```

The fake repository keeps tasks in a `Map`. It is a **fake**, a small working implementation, not a mock: many tests can use it without setting up answers one by one. It copies the real repository's behaviour, including the duplicate-title rule and the sort order, and the next section proves that it does:

tests/memory-task-repository.ts

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { NewTask, Task, TaskChanges, TaskRepository, TaskStatus } from "../src/task.repository.js";

export class MemoryTaskRepository implements TaskRepository {
  private readonly rows = new Map<number, Task>();

  async create(input: NewTask): Promise<Task> {
    for (const row of this.rows.values()) {
      if (row.ownerId === input.ownerId && row.title === input.title) {
        throw new ConflictError(`You already have a task called "${input.title}"`);
      }
    }
    const task: Task = { ...input, id: this.rows.size + 1, assigneeId: null, status: "open" };
    this.rows.set(task.id, task);
    return task;
  }

  async findById(id: number): Promise<Task | undefined> {
    return this.rows.get(id);
  }

  async update(id: number, changes: TaskChanges): Promise<Task> {
    const row = this.rows.get(id);
    if (row === undefined) throw new NotFoundError(`Task ${id} not found`);
    const updated = { ...row, ...changes };
    this.rows.set(id, updated);
    return updated;
  }

  async listVisibleTo(userId: string, status?: TaskStatus): Promise<Task[]> {
    return [...this.rows.values()]
      .filter((t) => (t.ownerId === userId || t.assigneeId === userId) && (status === undefined || t.status === status))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id - b.id);
  }
}
```

Now the tests. `createTestClock` and `createTestEventBus` come from `@zudojs/testing`, as in the previous lesson. `it.each` runs one test per row of a table; `%s` puts the row's first value into the test name:

tests/task.service.test.ts

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { assertEventPublished, assertRejects, createTestClock, createTestEventBus } from "@zudojs/testing";
import type { TestClock, TestEventBus } from "@zudojs/testing";
import { createTaskService, type TaskService } from "../src/task.service.js";
import { MemoryTaskRepository } from "./memory-task-repository.js";

let clock: TestClock;
let events: TestEventBus;
let service: TaskService;

beforeEach(() => {
  clock = createTestClock("2026-10-01T09:00:00Z");
  events = createTestEventBus();
  service = createTaskService({ tasks: new MemoryTaskRepository(), events, now: () => clock.now });
});

describe("TaskService", () => {
  it("trims the title and sets the due date from the clock", async () => {
    const task = await service.create("ada", "  Buy milk ", 2);
    expect(task.title).toBe("Buy milk");
    expect(task.dueAt.toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });

  it.each([
    ["a two-letter title", "no", 1, "3 to 200 characters"],
    ["a 201-letter title", "x".repeat(201), 1, "3 to 200 characters"],
    ["a due date in the past", "Buy milk", -1, "0 to 365"],
    ["half a day", "Buy milk", 1.5, "0 to 365"],
  ])("refuses %s", async (_case, title, days, message) => {
    await assertRejects(() => service.create("ada", title, days), message);
  });

  it("lets only the owner assign, and announces it", async () => {
    const task = await service.create("ada", "Buy milk", 1);
    await assertRejects(() => service.assign("bola", task.id, "bola"), "not found");
    await service.assign("ada", task.id, "bola");
    await assertRejects(() => service.assign("bola", task.id, "chidi"), "Only the owner");
    assertEventPublished(events.published, "task.assigned");
    expect(events.findByType("task.assigned").map((r) => r.event.payload))
      .toEqual([{ taskId: task.id, title: "Buy milk", assigneeId: "bola" }]);
  });

  it("completes once, and only for people who can see the task", async () => {
    const task = await service.create("ada", "Buy milk", 1);
    await service.assign("ada", task.id, "bola");
    await assertRejects(() => service.complete("chidi", task.id), "not found");
    expect((await service.complete("bola", task.id)).status).toBe("done");
    await assertRejects(() => service.complete("ada", task.id), "already done");
    expect(events.findByType("task.completed")).toHaveLength(1);
  });

  it("finds overdue tasks by the clock", async () => {
    await service.create("ada", "Buy milk", 1);
    await service.create("ada", "File taxes", 7);
    clock.add({ days: 2 });
    expect((await service.overdue("ada")).map((t) => t.title)).toEqual(["Buy milk"]);
  });
});
```

run-service.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/task.service.test.ts");
```

Output of `npx tsx run-service.ts`

```ts
✓ TaskService > trims the title and sets the due date from the clock
✓ TaskService > refuses a two-letter title
✓ TaskService > refuses a 201-letter title
✓ TaskService > refuses a due date in the past
✓ TaskService > refuses half a day
✓ TaskService > lets only the owner assign, and announces it
✓ TaskService > completes once, and only for people who can see the task
✓ TaskService > finds overdue tasks by the clock
```

These eight tests run in milliseconds and need no database. Each one pins a rule: the trimmed title, the due date computed from the clock, the four kinds of bad input, who may assign, who may complete and how often, and which tasks are overdue after two days of fake time. When one fails, the test name says which rule broke.

Notice what they do *not* check: SQL, HTTP status codes or e-mails. Those belong to other layers.

## Repository integration tests with PGlite

The real repository writes SQL for PostgreSQL. The table and the repository class:

src/db.ts

```ts
import type { PGlite } from "@electric-sql/pglite";

export const SCHEMA = `
  CREATE TABLE tasks (
    id          SERIAL PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    assignee_id TEXT,
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    due_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (owner_id, title)
  );
`;

export async function migrate(db: PGlite): Promise<void> {
  await db.exec(SCHEMA);
}
```

The class is already in `src/task.repository.ts` above: `PgTaskRepository`. It depends on a tiny `Queryable` interface, not on PGlite, so the same class works with PGlite in tests and with a `pg` connection pool in production. Its `toTask` function is the mapping that the opening example forgot.

### One contract, two implementations

The fake from the last section is only useful if it behaves like the real thing. So write the repository's tests *once*, as a function that takes a way to make a repository, and run them against both. This is a **contract test**: the tests describe what every `TaskRepository` must do:

tests/task.repository.contract.ts

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { assertRejects } from "@zudojs/testing";
import type { TaskRepository } from "../src/task.repository.js";

const monday = new Date("2026-10-05T09:00:00Z");
const tuesday = new Date("2026-10-06T09:00:00Z");

export function taskRepositoryContract(name: string, makeRepository: () => Promise<TaskRepository>): void {
  describe(`${name} (TaskRepository contract)`, () => {
    let repo: TaskRepository;
    beforeEach(async () => {
      repo = await makeRepository();
    });

    it("creates an open, unassigned task and reads it back", async () => {
      const created = await repo.create({ ownerId: "ada", title: "Buy milk", dueAt: monday });
      expect(created).toMatchObject({ ownerId: "ada", assigneeId: null, status: "open", title: "Buy milk" });
      expect(await repo.findById(created.id)).toEqual(created);
      expect(await repo.findById(999)).toBeUndefined();
    });

    it("refuses the same title twice for one owner, but not for another", async () => {
      await repo.create({ ownerId: "ada", title: "Buy milk", dueAt: monday });
      await assertRejects(() => repo.create({ ownerId: "ada", title: "Buy milk", dueAt: monday }), "already have");
      await expect(repo.create({ ownerId: "bola", title: "Buy milk", dueAt: monday })).resolves.toBeDefined();
    });

    it("updates only the fields it is given", async () => {
      const task = await repo.create({ ownerId: "ada", title: "Buy milk", dueAt: monday });
      await repo.update(task.id, { assigneeId: "bola" });
      const done = await repo.update(task.id, { status: "done" });
      expect(done).toMatchObject({ assigneeId: "bola", status: "done" });
      await assertRejects(() => repo.update(999, { status: "done" }), "not found");
    });

    it("lists what a user owns or is assigned, by due date", async () => {
      const later = await repo.create({ ownerId: "ada", title: "File taxes", dueAt: tuesday });
      const sooner = await repo.create({ ownerId: "bola", title: "Fix bike", dueAt: monday });
      await repo.create({ ownerId: "chidi", title: "Not for Ada", dueAt: monday });
      await repo.update(sooner.id, { assigneeId: "ada" });
      await repo.update(later.id, { status: "done" });
      expect((await repo.listVisibleTo("ada")).map((t) => t.title)).toEqual(["Fix bike", "File taxes"]);
      expect((await repo.listVisibleTo("ada", "open")).map((t) => t.title)).toEqual(["Fix bike"]);
    });
  });
}
```

Starting PostgreSQL takes seconds, so the test file starts one database for all its tests and gives each test a clean state. A popular trick is to open a transaction before each test and roll it back after:

tests/task.repository.test.ts

```ts
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/db.js";
import { PgTaskRepository } from "../src/task.repository.js";
import { MemoryTaskRepository } from "./memory-task-repository.js";
import { taskRepositoryContract } from "./task.repository.contract.js";

const db = new PGlite();
beforeAll(() => migrate(db));
beforeEach(() => db.exec("BEGIN"));
afterEach(() => db.exec("ROLLBACK"));
afterAll(() => db.close());

taskRepositoryContract("MemoryTaskRepository", async () => new MemoryTaskRepository());
taskRepositoryContract("PgTaskRepository", async () => new PgTaskRepository(db));
```

run-repository.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/task.repository.test.ts");
```

Output of `npx tsx run-repository.ts`

```ts
✓ MemoryTaskRepository (TaskRepository contract) > creates an open, unassigned task and reads it back
✓ MemoryTaskRepository (TaskRepository contract) > refuses the same title twice for one owner, but not for another
✓ MemoryTaskRepository (TaskRepository contract) > updates only the fields it is given
✓ MemoryTaskRepository (TaskRepository contract) > lists what a user owns or is assigned, by due date
✓ PgTaskRepository (TaskRepository contract) > creates an open, unassigned task and reads it back
× PgTaskRepository (TaskRepository contract) > refuses the same title twice for one owner, but not for another
    promise rejected "error: current transaction is aborted, co… { …(18) }" instead of resolving
✓ PgTaskRepository (TaskRepository contract) > updates only the fields it is given
✓ PgTaskRepository (TaskRepository contract) > lists what a user owns or is assigned, by due date
```

The fake passes everything. PostgreSQL fails the duplicate test, and the message is the clue: "current transaction is aborted". When a statement fails inside a PostgreSQL transaction, the whole transaction is broken, and every following statement is refused until the rollback. In production the duplicate insert would not be inside a transaction, and the insert for "bola" would work. The test setup changed the behaviour it was supposed to test.

> TEST SETUP CAN CHANGE WHAT YOU TEST
>
> Wrapping each test in a transaction also hides bugs in code that opens its own transactions, and it is invisible to a second connection. Use it only for tests that never expect an error from the database.

The fix: empty the table before each test. `TRUNCATE … RESTART IDENTITY` removes every row and resets the id counter, so the first task is id 1 again, and it takes about a millisecond. One more test checks a rule that only the database enforces, the `CHECK` on `status`: code `23514` is PostgreSQL's "check constraint violated":

tests/task.repository.test.ts

```ts
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/db.js";
import { PgTaskRepository } from "../src/task.repository.js";
import { MemoryTaskRepository } from "./memory-task-repository.js";
import { taskRepositoryContract } from "./task.repository.contract.js";

const db = new PGlite();
beforeAll(() => migrate(db));
beforeEach(() => db.exec("TRUNCATE tasks RESTART IDENTITY"));
afterAll(() => db.close());

taskRepositoryContract("MemoryTaskRepository", async () => new MemoryTaskRepository());
taskRepositoryContract("PgTaskRepository", async () => new PgTaskRepository(db));

it("lets PostgreSQL refuse a status the code does not know", async () => {
  const insert = "INSERT INTO tasks (owner_id, title, due_at, status) VALUES ('ada', 'Buy milk', now(), 'shipped')";
  await expect(db.query(insert)).rejects.toMatchObject({ code: "23514" });
});
```

run-repository-fixed.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/task.repository.test.ts");
```

Output of `npx tsx run-repository-fixed.ts`

```ts
✓ MemoryTaskRepository (TaskRepository contract) > creates an open, unassigned task and reads it back
✓ MemoryTaskRepository (TaskRepository contract) > refuses the same title twice for one owner, but not for another
✓ MemoryTaskRepository (TaskRepository contract) > updates only the fields it is given
✓ MemoryTaskRepository (TaskRepository contract) > lists what a user owns or is assigned, by due date
✓ PgTaskRepository (TaskRepository contract) > creates an open, unassigned task and reads it back
✓ PgTaskRepository (TaskRepository contract) > refuses the same title twice for one owner, but not for another
✓ PgTaskRepository (TaskRepository contract) > updates only the fields it is given
✓ PgTaskRepository (TaskRepository contract) > lists what a user owns or is assigned, by due date
✓ lets PostgreSQL refuse a status the code does not know
```

The contract passes for both, so the service tests that use the fake are telling the truth. If someone changes the SQL sort order, or the fake forgets the duplicate rule, the contract fails for one implementation and not the other. `db.ts` is also what production runs to create the table, so the tests use the real schema, not a copy.

## Auth tests: sessions and tokens

Login is built on `@zudojs/auth`, from [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth). The user directory keeps users in memory and hashes their passwords. It also answers `emailOf`, which the notifications need later:

src/users.ts

```ts
import { hashPassword, normalizeLoginIdentifier, toUserId, verifyPassword } from "@zudojs/auth";
import type { AuthUser, UserId } from "@zudojs/auth";

interface UserRow {
  readonly user: AuthUser;
  readonly passwordHash: string;
}

export function createUserDirectory() {
  const byId = new Map<string, UserRow>();
  const find = (email: string) => [...byId.values()].find((row) => row.user.email === normalizeLoginIdentifier(email));

  return {
    async register(id: string, email: string, password: string): Promise<AuthUser> {
      const user: AuthUser = {
        id: toUserId(id), email: normalizeLoginIdentifier(email), roles: ["user"], active: true, createdAt: new Date(),
      };
      byId.set(id, { user, passwordHash: await hashPassword(password) });
      return user;
    },
    findUser: async (email: string) => find(email)?.user ?? null,
    findUserById: async (id: UserId) => byId.get(id)?.user ?? null,
    verifyPassword: async (id: UserId, password: string) => {
      const row = byId.get(id);
      return row !== undefined && verifyPassword(password, row.passwordHash);
    },
    emailOf: async (id: string) => byId.get(id)?.user.email,
  };
}

export type UserDirectory = ReturnType<typeof createUserDirectory>;
```

src/auth.ts

```ts
import { createAuthService, createMemorySessionStore, createMemoryTokenRevocationStore } from "@zudojs/auth";
import type { TokenConfig } from "@zudojs/auth";
import type { UserDirectory } from "./users.js";

export function createAuth(token: TokenConfig, users: UserDirectory) {
  return createAuthService({
    token,
    sessionStore: createMemorySessionStore(),
    sessionTtlSeconds: 30 * 60,
    absoluteSessionTtlSeconds: 7 * 24 * 60 * 60,
    findUser: users.findUser,
    findUserById: users.findUserById,
    verifyPassword: users.verifyPassword,
    revocationStore: createMemoryTokenRevocationStore(),
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

You do not test that HS256 works: the package's own tests do that. You test *your* decisions: the session lengths you chose, that logout really ends access, that the two login failures look the same. Test users and fake secrets go in a **fixtures** file, shared by every test that needs them. Secrets in tests are made-up constants, never your real ones:

tests/fixtures.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import { createUserDirectory } from "../src/users.js";

export const testTokens: TokenConfig = {
  accessSecret: "test-access-secret-that-is-at-least-32-chars",
  refreshSecret: "test-refresh-secret-that-is-at-least-32-chars",
  accessTtl: 15 * 60,
  refreshTtl: 7 * 24 * 60 * 60,
  issuer: "task-api",
  audience: "task-api",
};

export const PASSWORD = "correct horse battery staple";

export async function usersWithAdaAndBola() {
  const users = createUserDirectory();
  await users.register("ada", "ada@example.com", PASSWORD);
  await users.register("bola", "bola@example.com", PASSWORD);
  return users;
}
```

Tokens and sessions depend on the time, and `createAuthService` has no option for a test clock. Vitest can replace the global `Date` instead: `vi.useFakeTimers({ toFake: ["Date"] })` fakes only `Date` and leaves real timers alone, and `vi.setSystemTime` moves it. `afterEach` puts the real clock back, even when a test fails:

tests/auth.test.ts

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@zudojs/auth";
import { assertRejects } from "@zudojs/testing";
import { createAuth, type Auth } from "../src/auth.js";
import { PASSWORD, testTokens, usersWithAdaAndBola } from "./fixtures.js";

let auth: Auth;
const ada = { identifier: "ada@example.com", password: PASSWORD };

beforeEach(async () => {
  auth = createAuth(testTokens, await usersWithAdaAndBola());
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sessions and tokens", () => {
  it("gives a token that names the user and the session", async () => {
    const { tokens, sessionId } = await auth.login({ ...ada, identifier: " ADA@example.com " });
    const payload = await auth.verifyToken(tokens.accessToken);
    expect(payload).toMatchObject({ sub: "ada", sid: sessionId, roles: ["user"] });
  });

  it("answers a wrong password and an unknown email the same way", async () => {
    const wrong = await assertRejects(() => auth.login({ ...ada, password: "guess" }));
    const unknown = await assertRejects(() => auth.login({ identifier: "eve@example.com", password: PASSWORD }));
    expect([wrong.message, (wrong as AuthError).statusCode]).toEqual([unknown.message, (unknown as AuthError).statusCode]);
  });

  it("kills the access token at logout, not 15 minutes later", async () => {
    const { tokens, sessionId } = await auth.login(ada);
    await auth.logout(sessionId, tokens.refreshToken);
    await assertRejects(() => auth.verifyToken(tokens.accessToken), "no longer active");
  });

  it("treats a replayed refresh token as theft", async () => {
    const { tokens } = await auth.login(ada);
    const next = await auth.refresh(tokens.refreshToken);
    await assertRejects(() => auth.refresh(tokens.refreshToken), "already been used");
    await assertRejects(() => auth.verifyToken(next.accessToken), "no longer active");
  });

  it("expires the token after 15 minutes and the session after 30 idle ones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const at = (time: string) => vi.setSystemTime(new Date(`2026-10-01T${time}:00Z`));
    at("09:00");
    const first = await auth.login(ada);
    at("09:16");
    await assertRejects(() => auth.verifyToken(first.tokens.accessToken), "Token expired");
    const second = await auth.refresh(first.tokens.refreshToken);
    await expect(auth.verifyToken(second.accessToken)).resolves.toMatchObject({ sub: "ada" });
    at("09:47");
    await assertRejects(() => auth.refresh(second.refreshToken), "no longer active");
  });
});
```

run-auth.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/auth.test.ts");
```

Output of `npx tsx run-auth.ts`

```ts
✓ sessions and tokens > gives a token that names the user and the session
✓ sessions and tokens > answers a wrong password and an unknown email the same way
✓ sessions and tokens > kills the access token at logout, not 15 minutes later
✓ sessions and tokens > treats a replayed refresh token as theft
✓ sessions and tokens > expires the token after 15 minutes and the session after 30 idle ones
```

The last test lives through 47 minutes in a moment. At 09:16 the 15-minute access token is dead but the session is alive, so a refresh works. At 09:47 nobody has used the session for 31 minutes, so it is gone, and so is the refresh. That is the exact behaviour of the `sessionTtlSeconds` and `accessTtl` you configured.

> NOTE
>
> Faking the global `Date` works, but it is a blunt tool: it changes the time for every library in the test. An injected clock, as `createTaskService` takes, is easier to reason about. When a library does not accept one, fake `Date` for as short a time as possible.

## Event and queue tests

Assigning a task publishes `task.assigned`. The notifications module listens, looks up the assignee's e-mail address and queues a job. A separate processor sends the e-mail. The route never waits for the mail server:

src/notifications.ts

```ts
import { JobDuplicateError } from "@zudojs/errors";
import type { Event, EventBus } from "@zudojs/events";
import type { Queue } from "@zudojs/queue";

export interface EmailJob {
  readonly to: string;
  readonly subject: string;
}
export interface Mailer {
  send(to: string, subject: string): Promise<void>;
}
export interface Directory {
  emailOf(userId: string): Promise<string | undefined>;
}
interface TaskAssigned {
  readonly taskId: number;
  readonly title: string;
  readonly assigneeId: string;
}

export function registerNotifications(events: EventBus, emails: Queue<EmailJob>, directory: Directory): void {
  events.on<Event<TaskAssigned>>("task.assigned", async ({ payload }) => {
    const to = await directory.emailOf(payload.assigneeId);
    if (to === undefined) return;
    try {
      await emails.add("send-email", { to, subject: `New task for you: ${payload.title}` }, {
        deduplicationKey: `assigned:${payload.taskId}:${payload.assigneeId}`,
      });
    } catch (error) {
      if (!(error instanceof JobDuplicateError)) throw error;
    }
  });
}

export function processEmails(emails: Queue<EmailJob>, mailer: Mailer): void {
  emails.process("send-email", async (job) => {
    await mailer.send(job.data.to, job.data.subject);
  });
}
```

Three things can go wrong here: no job (the handler was never registered, or the lookup failed), two jobs (the same event arrived twice), and a job that fails and is lost. The tests use a `createTestEventBus` and a `createTestQueue`, which are real buses and queues that also record everything.

A queue runs its jobs in the background, on its own timers. A test that "waits a bit" for them is slow when the wait is long and flaky when it is short. Instead, create the queue with `autoProcess: false` and run the jobs yourself. `claimNextJob` takes the next due job and `runJob` runs it through the processor, retries and dead-letter handling included:

tests/drain.ts

```ts
import type { Queue } from "@zudojs/queue";

/** Runs every job, including retries, until nothing is left to do. */
export async function drain<T>(queue: Queue<T>): Promise<void> {
  for (;;) {
    const job = await queue.claimNextJob();
    if (job !== null) {
      await queue.runJob(job);
      continue;
    }
    const stats = await queue.getStats();
    if (stats.retrying === 0 && stats.delayed === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

The retry policy (`attempts` and `backoff`) is set on the queue, not in `notifications.ts`. Production passes exponential backoff starting at a second; the test passes a 1 ms fixed backoff, so three attempts take no time. For the mailer the tests use Vitest's `vi.fn`, because `mockRejectedValueOnce` makes "fail once, then work" a one-liner:

tests/notifications.test.ts

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixedBackoff, createQueueName } from "@zudojs/queue";
import { createTestEventBus, createTestQueue } from "@zudojs/testing";
import type { TestEventBus, TestQueue } from "@zudojs/testing";
import { processEmails, registerNotifications, type EmailJob, type Mailer } from "../src/notifications.js";
import { drain } from "./drain.js";

const directory = { emailOf: async (id: string) => ({ bola: "bola@example.com" })[id] };
const assigned = (taskId: number, assigneeId: string) =>
  ({ type: "task.assigned", payload: { taskId, title: "Buy milk", assigneeId } });

let events: TestEventBus;
let emails: TestQueue<EmailJob>;
let send: ReturnType<typeof vi.fn<Mailer["send"]>>;

beforeEach(() => {
  events = createTestEventBus();
  emails = createTestQueue<EmailJob>(createQueueName("emails"), {
    autoProcess: false,
    defaultJobOptions: { attempts: 3, backoff: createFixedBackoff(1) },
  });
  send = vi.fn<Mailer["send"]>();
  registerNotifications(events, emails, directory);
});
afterEach(async () => {
  events.dispose();
  await emails.close();
});

describe("task.assigned -> email job", () => {
  it("queues one email for the assignee", async () => {
    await events.publishEvent(assigned(1, "bola"));
    expect(emails.findByName("send-email").map((r) => r.job.data))
      .toEqual([{ to: "bola@example.com", subject: "New task for you: Buy milk" }]);
  });

  it("queues nothing for a user without an email address", async () => {
    await events.publishEvent(assigned(1, "ghost"));
    expect(emails.jobs).toHaveLength(0);
  });

  it("queues the same assignment only once", async () => {
    await events.publishEvent(assigned(1, "bola"));
    const result = await events.publishEvent(assigned(1, "bola"));
    expect(result.failed).toBe(0);
    expect(emails.jobs).toHaveLength(1);
  });
});

describe("email worker", () => {
  it("retries when the mail server fails, and sends once", async () => {
    send.mockRejectedValueOnce(new Error("SMTP 421 try again later")).mockResolvedValue(undefined);
    processEmails(emails, { send });
    await events.publishEvent(assigned(1, "bola"));
    await drain(emails);
    expect(send.mock.calls).toEqual([
      ["bola@example.com", "New task for you: Buy milk"],
      ["bola@example.com", "New task for you: Buy milk"],
    ]);
    expect(await emails.getStats()).toMatchObject({ succeeded: 1, retried: 1, deadLettered: 0 });
  });

  it("dead-letters the job after three failures", async () => {
    send.mockRejectedValue(new Error("SMTP 550 mailbox unavailable"));
    processEmails(emails, { send });
    await events.publishEvent(assigned(1, "bola"));
    await drain(emails);
    expect(send).toHaveBeenCalledTimes(3);
    const [dead] = await emails.getDeadLetterJobs();
    expect(dead?.job.data.to).toBe("bola@example.com");
  });
});
```

run-notifications.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/notifications.test.ts");
```

Output of `npx tsx run-notifications.ts`

```ts
✓ task.assigned -> email job > queues one email for the assignee
✓ task.assigned -> email job > queues nothing for a user without an email address
✓ task.assigned -> email job > queues the same assignment only once
✓ email worker > retries when the mail server fails, and sends once
✓ email worker > dead-letters the job after three failures
```

The duplicate test publishes the same event twice and still finds one job: the `deduplicationKey` refused the second job, and the handler caught `JobDuplicateError` instead of failing (`result.failed` is 0). The last two tests prove that a mail outage is survived and that a job that keeps failing ends up in the dead-letter list, where someone can see it, instead of vanishing.

## CQRS tests

The HTTP layer does not call the service directly. It sends commands and queries, as in [the CQRS lesson](https://zudojs.oyinlola.site/learn/zudo-cqrs). Each handler is one line, and the user always comes from the execution context:

src/task.cqrs.ts

```ts
import { createCommandBus, createQueryBus, errorMiddleware } from "@zudojs/cqrs";
import type { CommandOf, CqrsContext, CqrsMiddleware, QueryOf } from "@zudojs/cqrs";
import { AuthenticationError } from "@zudojs/errors";
import type { Task, TaskStatus } from "./task.repository.js";
import type { TaskService } from "./task.service.js";

export type CreateTask = CommandOf<"CreateTask", { title: string; dueInDays: number }>;
export type AssignTask = CommandOf<"AssignTask", { taskId: number; assigneeId: string }>;
export type CompleteTask = CommandOf<"CompleteTask", { taskId: number }>;
export type ListMyTasks = QueryOf<"ListMyTasks", { status?: TaskStatus }>;

function userOf(context?: CqrsContext): string {
  if (!context?.userId) throw new AuthenticationError("Sign in first");
  return context.userId;
}

export function createTaskBuses(service: TaskService, audit: CqrsMiddleware[] = []) {
  const commands = createCommandBus({ middleware: [...audit, errorMiddleware()] });
  const queries = createQueryBus({ middleware: [errorMiddleware()] });

  commands.register<CreateTask, Task>("CreateTask", (c, ctx) => service.create(userOf(ctx), c.title, c.dueInDays));
  commands.register<AssignTask, Task>("AssignTask", (c, ctx) => service.assign(userOf(ctx), c.taskId, c.assigneeId));
  commands.register<CompleteTask, Task>("CompleteTask", (c, ctx) => service.complete(userOf(ctx), c.taskId));
  queries.register<ListMyTasks, Task[]>("ListMyTasks", (q, ctx) => service.list(userOf(ctx), q.status));

  return { commands, queries };
}

export type TaskBuses = ReturnType<typeof createTaskBuses>;
```

The handlers are too thin to have rules of their own, so what is there to test? The *wiring*: that every command is registered, that identity comes only from the context, that middleware sees every command, and that an unexpected error does not leak its details. These tests use the real service with the fake repository:

tests/task.cqrs.test.ts

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, withUser } from "@zudojs/cqrs";
import type { CqrsMiddleware } from "@zudojs/cqrs";
import { BaseError } from "@zudojs/errors";
import { assertRejects, createTestEventBus } from "@zudojs/testing";
import { createTaskBuses, type CompleteTask, type CreateTask, type ListMyTasks, type TaskBuses } from "../src/task.cqrs.js";
import type { Task } from "../src/task.repository.js";
import { createTaskService, type TaskService } from "../src/task.service.js";
import { MemoryTaskRepository } from "./memory-task-repository.js";

const request = createExecutionContext({ source: "http" });
const ada = withUser(request, "ada");
const chidi = withUser(request, "chidi");

let audit: string[];
let buses: TaskBuses;

function build(service?: TaskService): TaskBuses {
  const real = createTaskService({
    tasks: new MemoryTaskRepository(), events: createTestEventBus(), now: () => new Date("2026-10-01T09:00:00Z"),
  });
  const auditor: CqrsMiddleware = async (req, ctx, next) => {
    audit.push(`${ctx?.userId ?? "anonymous"} ${req.type}`);
    return next(req, ctx);
  };
  return createTaskBuses(service ?? real, [auditor]);
}

beforeEach(() => {
  audit = [];
  buses = build();
});

describe("task buses", () => {
  it("has a handler for every command the HTTP layer sends", () => {
    expect([...buses.commands.getCommandTypes()].sort()).toEqual(["AssignTask", "CompleteTask", "CreateTask"]);
    expect(buses.queries.has("ListMyTasks")).toBe(true);
  });

  it("takes the user from the context, never from the payload", async () => {
    const task = await buses.commands.execute<CreateTask, Task>({ type: "CreateTask", title: "Buy milk", dueInDays: 1 }, ada);
    const forged = { type: "CompleteTask", taskId: task.id, userId: "ada" } as CompleteTask;
    await assertRejects(() => buses.commands.execute(forged, chidi), "not found");
    await assertRejects(() => buses.commands.execute(forged), "Sign in first");
    expect(audit).toEqual(["ada CreateTask", "chidi CompleteTask", "anonymous CompleteTask"]);
  });

  it("shows a write to the next read", async () => {
    await buses.commands.execute<CreateTask, Task>({ type: "CreateTask", title: "Buy milk", dueInDays: 1 }, ada);
    const mine = await buses.queries.execute<ListMyTasks, Task[]>({ type: "ListMyTasks" }, ada);
    const theirs = await buses.queries.execute<ListMyTasks, Task[]>({ type: "ListMyTasks" }, chidi);
    expect(mine.map((t) => t.title)).toEqual(["Buy milk"]);
    expect(theirs).toEqual([]);
  });

  it("hides the details of an unexpected failure", async () => {
    const broken = { create: async () => { throw new Error("connection reset by 10.0.0.12:5432"); } } as unknown as TaskService;
    buses = build(broken);
    const error = await assertRejects(
      () => buses.commands.execute({ type: "CreateTask", title: "Buy milk", dueInDays: 1 }, ada),
      "connection reset",
    );
    expect(error).toBeInstanceOf(BaseError);
    expect(error).toMatchObject({ name: "CqrsError", statusCode: 500, expose: false });
  });
});
```

run-cqrs.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/task.cqrs.test.ts");
```

Output of `npx tsx run-cqrs.ts`

```ts
✓ task buses > has a handler for every command the HTTP layer sends
✓ task buses > takes the user from the context, never from the payload
✓ task buses > shows a write to the next read
✓ task buses > hides the details of an unexpected failure
```

- The forged command carries `userId: "ada"`, as if Chidi had put it in a request body. The handler ignores it and uses the context, so Chidi gets "not found". The `as CompleteTask` cast is deliberate: TypeScript would refuse the extra field, and the test lies to the compiler to prove the *runtime* is safe too.
- The audit log shows all three attempts, including the anonymous one: middleware runs before the handler refuses.
- The last test replaces the service with a broken stub. `errorMiddleware` wraps the unknown error in a `CqrsError` with status 500 and `expose: false`. The message still names the database host, which is fine for your logs; the HTTP layer must not send it to the client. The next section checks that.

## HTTP tests

The HTTP layer parses bodies, checks the token, turns the URL into a command and maps errors to status codes:

src/http.ts

```ts
import { AuthError, parseBearerToken } from "@zudojs/auth";
import { createExecutionContext, withUser } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import { badRequest, createResponseContext, createRouter, notFound } from "@zudojs/http";
import type { HttpMiddleware, HttpRouter, HttpRouterContext } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import type { Auth } from "./auth.js";
import type { AssignTask, CompleteTask, CreateTask, ListMyTasks, TaskBuses } from "./task.cqrs.js";

const Login = schema.object({ email: schema.string().max(254), password: schema.string().max(1024) });
const NewTask = schema.object({ title: schema.string().max(200), dueInDays: schema.number().int() });
const Assign = schema.object({ assigneeId: schema.string().min(1).max(64) });

function body(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("Body must be JSON");
  }
}
function taskId(ctx: HttpRouterContext): number {
  const id = Number(ctx.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound("Task not found");
  return id;
}
const json = (status: number, data: unknown) => createResponseContext().setStatus(status).json(data);

export function createHttpApi(auth: Auth, { commands, queries }: TaskBuses): HttpRouter {
  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader("authorization"));
    const payload = token === null ? null : await auth.verifyToken(token).catch((error: unknown) => {
      if (error instanceof AuthError) return null;
      throw error;
    });
    if (payload === null) return json(401, { error: "Login required" });
    ctx.state.set("cqrs", withUser(createExecutionContext({ source: "http" }), payload.sub));
    return next();
  };
  const as = (ctx: HttpRouterContext) => ctx.state.get("cqrs") as CqrsContext;
  const guarded = { middleware: [requireUser] };
  const router = createRouter();

  router.post("/auth/login", async (ctx) => {
    const { email, password } = Login.parse(body(ctx));
    const { tokens } = await auth.login({ identifier: email, password });
    return json(200, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  });
  router.post("/tasks", async (ctx) => {
    const input = NewTask.parse(body(ctx));
    return json(201, await commands.execute<CreateTask, unknown>({ type: "CreateTask", ...input }, as(ctx)));
  }, guarded);
  router.get("/tasks", async (ctx) => {
    const status = ctx.query.status === "open" || ctx.query.status === "done" ? ctx.query.status : undefined;
    return json(200, await queries.execute<ListMyTasks, unknown>({ type: "ListMyTasks", status }, as(ctx)));
  }, guarded);
  router.post("/tasks/:id/assign", async (ctx) => {
    const { assigneeId } = Assign.parse(body(ctx));
    return json(200, await commands.execute<AssignTask, unknown>({ type: "AssignTask", taskId: taskId(ctx), assigneeId }, as(ctx)));
  }, guarded);
  router.post("/tasks/:id/complete", async (ctx) => {
    return json(200, await commands.execute<CompleteTask, unknown>({ type: "CompleteTask", taskId: taskId(ctx) }, as(ctx)));
  }, guarded);
  return router;
}
```

One file builds the whole app from its parts. This is the **composition root**, from [the DI architecture lesson](https://zudojs.oyinlola.site/learn/zudo-di-architecture). Everything that differs between production and a test comes in through `AppDeps`: the database, the users, the mailer, the token secrets, the clock and the queue options:

src/app.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import { createEventBus } from "@zudojs/events";
import { createExponentialBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import type { QueueOptions } from "@zudojs/queue";
import { createAuth } from "./auth.js";
import { createHttpApi } from "./http.js";
import { processEmails, registerNotifications, type EmailJob, type Mailer } from "./notifications.js";
import { createTaskBuses } from "./task.cqrs.js";
import { PgTaskRepository, type Queryable } from "./task.repository.js";
import { createTaskService } from "./task.service.js";
import type { UserDirectory } from "./users.js";

export interface AppDeps {
  readonly db: Queryable;
  readonly users: UserDirectory;
  readonly mailer: Mailer;
  readonly tokens: TokenConfig;
  readonly now?: () => Date;
  readonly emailQueue?: QueueOptions;
}

/** The composition root: the one place that builds and connects every part. */
export function createApp(deps: AppDeps) {
  const events = createEventBus();
  const emails = createInMemoryQueue<EmailJob>(createQueueName("emails"), deps.emailQueue ?? {
    defaultJobOptions: { attempts: 5, backoff: createExponentialBackoff(1_000, { maxDelay: 60_000 }) },
  });
  const service = createTaskService({ tasks: new PgTaskRepository(deps.db), events, now: deps.now ?? (() => new Date()) });
  const buses = createTaskBuses(service);
  const auth = createAuth(deps.tokens, deps.users);
  registerNotifications(events, emails, deps.users);
  processEmails(emails, deps.mailer);

  return {
    router: createHttpApi(auth, buses),
    emails,
    async dispose(): Promise<void> {
      await emails.close();
      events.dispose();
    },
  };
}
```

Because the tests build the app with the same `createApp` as production, they test the real wiring. A test **harness** hides the setup. The slow parts (PostgreSQL and the password hashes) are made once per file; each test gets a fresh app with empty tables, new buses, a new queue and no sessions:

tests/app-harness.ts

```ts
import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createCleanupManager, createHttpTestClient } from "@zudojs/testing";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import type { Mailer } from "../src/notifications.js";
import type { UserDirectory } from "../src/users.js";
import { PASSWORD, testTokens, usersWithAdaAndBola } from "./fixtures.js";

/** Slow parts, made once per test file: the database and the password hashes. */
export async function createSharedParts() {
  const db = new PGlite();
  await migrate(db);
  return { db, users: await usersWithAdaAndBola() };
}

/** A fresh Task API for one test: empty tables, new buses, queue and sessions. */
export async function startTestApp({ db, users }: { db: PGlite; users: UserDirectory }) {
  await db.exec("TRUNCATE tasks RESTART IDENTITY");
  const cleanup = createCleanupManager();
  const mailer = { send: vi.fn<Mailer["send"]>().mockResolvedValue(undefined) };
  const app = createApp({
    db, users, mailer, tokens: testTokens,
    now: () => new Date("2026-10-01T09:00:00Z"),
    emailQueue: { autoProcess: false },
  });
  cleanup.register(() => app.dispose(), "app");
  const client = createHttpTestClient(app.router, { cleanup });

  async function login(email: string): Promise<string> {
    const res = await client.post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }
  return { app, client, mailer, login, dispose: () => cleanup.dispose() };
}
```

The HTTP tests check what only this layer decides: the login check, body validation and the status code of every rule. `vi.spyOn(shared.db, "query")` makes the real database fail once, with an error that names an internal host:

tests/http.test.ts

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedParts, startTestApp } from "./app-harness.js";

let shared: Awaited<ReturnType<typeof createSharedParts>>;
let t: Awaited<ReturnType<typeof startTestApp>>;
let ada: string;
let bola: string;

beforeAll(async () => {
  shared = await createSharedParts();
});
beforeEach(async () => {
  t = await startTestApp(shared);
  ada = await t.login("ada@example.com");
  bola = await t.login("bola@example.com");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.dispose();
});
afterAll(() => shared.db.close());

describe("HTTP API", () => {
  it("wants a valid token on every task route", async () => {
    await t.client.get("/tasks").expect(401).expectJson({ error: "Login required" });
    await t.client.get("/tasks").auth("not-a-token").expect(401);
  });

  it("answers 201 with the task, 400 for a body it cannot use, 409 for a duplicate", async () => {
    await t.client.post("/tasks").auth(ada).send({ title: "Buy milk", dueInDays: 1 })
      .expect(201).expectJson({ id: 1, title: "Buy milk", status: "open", ownerId: "ada" });
    await t.client.post("/tasks").auth(ada).send("title=Buy milk").expect(400);
    await t.client.post("/tasks").auth(ada).send({ title: "Buy milk", dueInDays: "soon" }).expect(400);
    await t.client.post("/tasks").auth(ada).send({ title: "Buy milk", dueInDays: 1 }).expect(409);
  });

  it("maps the service's rules to status codes", async () => {
    await t.client.post("/tasks").auth(ada).send({ title: "Buy milk", dueInDays: 1 }).expect(201);
    await t.client.post("/tasks/1/complete").auth(bola).expect(404);
    await t.client.post("/tasks/abc/complete").auth(ada).expect(404);
    await t.client.post("/tasks/1/assign").auth(ada).send({ assigneeId: "bola" }).expect(200);
    await t.client.post("/tasks/1/assign").auth(bola).send({ assigneeId: "bola" }).expect(403);
    await t.client.post("/tasks/1/complete").auth(bola).expect(200).expectJson({ status: "done" });
    await t.client.post("/tasks/1/complete").auth(ada).expect(409);
  });

  it("never shows the reason for a 500", async () => {
    vi.spyOn(shared.db, "query").mockRejectedValueOnce(new Error("connection reset by 10.0.0.12:5432"));
    await t.client.get("/tasks").auth(ada).expect(500).expectJson({ error: "Internal Server Error" });
  });
});
```

run-http.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/http.test.ts");
```

Output of `npx tsx run-http.ts`

```ts
✓ HTTP API > wants a valid token on every task route
✓ HTTP API > answers 201 with the task, 400 for a body it cannot use, 409 for a duplicate
✓ HTTP API > maps the service's rules to status codes
✓ HTTP API > never shows the reason for a 500
```

One test per behaviour of the layer: 401 for a missing or broken token, 400 for a body that is not JSON or has a wrong type, 409 for the duplicate title from the database, 404 for a task you cannot see or an id that is not a number, 403 for a non-owner assigning, and a 500 whose body is only `{ error: "Internal Server Error" }`. The database's message, host included, never reaches the client. `vi.restoreAllMocks()` in `afterEach` removes the spy, so the next test gets a working database.

## An end-to-end workflow

Every layer is tested. One question is left: do they work *together*, in the order a real user uses them? An end-to-end test tells one complete story through the public interface, HTTP, and checks what the user would see, including the e-mail.

REASON IT OUT

### What makes an end-to-end test flaky?

A **flaky** test passes and fails without any change to the code. Before writing the workflow test, list what could make its result change from one run to the next, and decide how to remove each cause.

**Show the reasoning**

- **Time.** The due date depends on "now". The harness passes a fixed `now`, so the test can check the exact date.
- **Background work.** The e-mail is sent by a queue on its own timers. With `autoProcess: false` and `drain`, the test decides when jobs run, and `drain` returns only when nothing is left.
- **Shared state.** Rows or sessions left over from another test. The harness truncates the table and builds a new app, with new sessions and a new queue, for every test.
- **Ports and the network.** The HTTP test client starts the server on a free port, and the mail server is a fake. Nothing depends on another program on the machine.
- **Order.** Ids are only predictable because the table is reset; the test reads the id from the response anyway, instead of assuming 1.

tests/workflow.e2e.test.ts

```ts
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { createSharedParts, startTestApp } from "./app-harness.js";
import { drain } from "./drain.js";

let shared: Awaited<ReturnType<typeof createSharedParts>>;
let t: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  shared = await createSharedParts();
});
beforeEach(async () => {
  t = await startTestApp(shared);
});
afterEach(() => t.dispose());
afterAll(() => shared.db.close());

it("Ada plans a task, Bola is told, does it, and Ada sees it done", async () => {
  const ada = await t.login("ada@example.com");
  const bola = await t.login("bola@example.com");

  const created = await t.client.post("/tasks").auth(ada).send({ title: "Restock the shop", dueInDays: 2 }).expect(201);
  const { id } = created.body as { id: number };
  await t.client.post(`/tasks/${id}/assign`).auth(ada).send({ assigneeId: "bola" }).expect(200);

  await drain(t.app.emails);
  expect(t.mailer.send.mock.calls).toEqual([["bola@example.com", "New task for you: Restock the shop"]]);

  await t.client.get("/tasks?status=open").auth(bola).expect(200).expectJson([{ id, assigneeId: "bola" }]);
  await t.client.post(`/tasks/${id}/complete`).auth(bola).expect(200);
  await t.client.get("/tasks?status=done").auth(ada).expect(200)
    .expectJson([{ id, status: "done", dueAt: "2026-10-03T09:00:00.000Z" }]);
  await t.client.get("/tasks?status=open").auth(ada).expect(200).expectJson([]);
});
```

run-workflow.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/workflow.e2e.test.ts");
```

Output of `npx tsx run-workflow.ts`

```ts
✓ Ada plans a task, Bola is told, does it, and Ada sees it done
```

This single test crosses every layer: two real logins, a command through HTTP, the service rule, a PostgreSQL write, an event, a queued job, the processor, the fake mail server, a query filtered by status, and the due date computed from the fixed clock. If `createApp` forgot `registerNotifications`, every earlier test would still pass and this one would fail.

Keep end-to-end tests few and focused on the most important journeys: signing in, the main thing users do, paying. They are the slowest tests you have, and when one fails it only tells you *that* the journey broke. The layer tests tell you *where*.

## The whole suite, and running it in CI

On your computer, run everything at once. Vitest runs the files in parallel, each in its own worker process with its own PGlite:

Terminal on your computer

```bash
$ npx vitest run

 RUN  v5.0.1 ~/task-api


 Test Files  7 passed (7)
      Tests  36 passed (36)
   Start at  23:37:38
   Duration  9.62s (tests 73%, import 25%, transform 2%)
```

While you work on one layer, run only its file, for example `npx vitest run tests/task.service.test.ts`, or keep `npx vitest` running in watch mode. Before you push, run everything.

### Production concerns

- **Keep the slow tests separate.** The naming convention `*.e2e.test.ts` lets CI run fast tests on every push and the end-to-end tests on every merge: `npx vitest run --exclude "**/*.e2e.test.ts"`.
- **One database per worker.** Parallel test files must never share a database, or one file's `TRUNCATE` deletes another file's rows mid-test. PGlite gives each file its own. Against a real PostgreSQL server in CI, create one database per worker (Vitest sets `VITEST_POOL_ID` for this).
- **Run the real migrations.** The tests created the table with the same `migrate` function as production. A hand-written test schema drifts from the real one.
- **Never point tests at production.** Tests truncate tables. Test settings, secrets included, are constants in the test files or come from a separate CI configuration.
- **Treat a flaky test as a bug.** Find the cause (time, order, shared state, background work) and remove it. A suite that is "usually green" teaches everyone to ignore red.
- **Coverage is a map, not a goal.** `npx vitest run --coverage` shows which lines no test runs. Look there for untested branches, such as the `JobDuplicateError` catch; do not chase 100%.

## Practice

TRY IT YOURSELF

### Sign out everywhere

After a password change, the Task API calls `auth.logoutAll(userId)`. Write an auth test that logs Ada in on a laptop and a phone, calls `logoutAll`, and checks that both access tokens are refused, while Bola's session keeps working.

**Show a solution**

tests/logout-all.test.ts

```ts
import { expect, it } from "vitest";
import { toUserId } from "@zudojs/auth";
import { assertRejects } from "@zudojs/testing";
import { createAuth } from "../src/auth.js";
import { PASSWORD, testTokens, usersWithAdaAndBola } from "./fixtures.js";

it("signs Ada out on every device, and nobody else", async () => {
  const auth = createAuth(testTokens, await usersWithAdaAndBola());
  const laptop = await auth.login({ identifier: "ada@example.com", password: PASSWORD });
  const phone = await auth.login({ identifier: "ada@example.com", password: PASSWORD });
  const bola = await auth.login({ identifier: "bola@example.com", password: PASSWORD });

  await auth.logoutAll(toUserId("ada"));

  await assertRejects(() => auth.verifyToken(laptop.tokens.accessToken), "no longer active");
  await assertRejects(() => auth.verifyToken(phone.tokens.accessToken), "no longer active");
  await expect(auth.verifyToken(bola.tokens.accessToken)).resolves.toMatchObject({ sub: "bola" });
});
```

run-logout-all.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/logout-all.test.ts");
```

Output of `npx tsx run-logout-all.ts`

```ts
✓ signs Ada out on every device, and nobody else
```

Checking that Bola is *not* affected matters as much as checking that Ada is: an implementation that deleted every session would pass the first half.

TRY IT YOURSELF

### Pin down a tie in the contract

Two tasks with the same due date: in which order do they come back? The contract does not say, so the fake and PostgreSQL could disagree, and some day a user would see their list jump around. Decide on "by id" and write a test that runs against both repositories.

**Show a solution**

tests/ordering.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/db.js";
import { PgTaskRepository, type TaskRepository } from "../src/task.repository.js";
import { MemoryTaskRepository } from "./memory-task-repository.js";

const db = new PGlite();
beforeAll(() => migrate(db));
afterAll(() => db.close());

const makers: [string, () => TaskRepository][] = [
  ["MemoryTaskRepository", () => new MemoryTaskRepository()],
  ["PgTaskRepository", () => new PgTaskRepository(db)],
];

describe.each(makers)("%s", (_name, make) => {
  it("lists tasks with the same due date by id", async () => {
    const repo = make();
    const due = new Date("2026-10-05T09:00:00Z");
    const packBags = await repo.create({ ownerId: "bola", title: "Pack bags", dueAt: due });
    await repo.create({ ownerId: "bola", title: "Book taxi", dueAt: due });
    await repo.create({ ownerId: "bola", title: "Call Ada", dueAt: due });
    await repo.update(packBags.id, { assigneeId: "ada" });
    expect((await repo.listVisibleTo("bola")).map((t) => t.title)).toEqual(["Pack bags", "Book taxi", "Call Ada"]);
  });
});
```

run-ordering.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/ordering.test.ts");
```

Output of `npx tsx run-ordering.ts`

```ts
✓ MemoryTaskRepository > lists tasks with the same due date by id
✓ PgTaskRepository > lists tasks with the same due date by id
```

Both pass, because the SQL says `ORDER BY due_at, id` and the fake sorts by `dueAt`, then `id`. The `update` in the middle is what gives the test its teeth. PostgreSQL writes an updated row to a new place in the table, and without a tie-breaker it returns tied rows in storage order. Remove `, id` from the SQL and this test fails for PostgreSQL with "Book taxi" first; without the update it would still pass by luck. In a real project, add the test to the contract function itself.

TRY IT YOURSELF

### Which test catches it?

For each bug, name the cheapest test in this lesson that fails: (1) someone shortens the SQL in `listVisibleTo` to `ORDER BY id`; (2) the route for `POST /tasks/:id/complete` loses its `guarded` option; (3) `createApp` forgets to call `processEmails`; (4) the service lets the assignee assign; (5) the notifications handler queues `to: payload.assigneeId` instead of the looked-up address.

**Show a solution**

1. The repository contract, "lists what a user owns or is assigned, by due date", for `PgTaskRepository` only. The service tests stay green, because they use the fake.
2. The HTTP test "maps the service's rules to status codes". Without the middleware no user reaches the context, so Bola's valid token gets `401 {"error":"Sign in first"}` from the command bus instead of the expected 404. That is **defence in depth**: even with the login check missing, the CQRS layer refused to act for nobody.
3. Only the end-to-end test: the job is queued, but no processor runs it, and the mailer is never called. Every layer test builds its own wiring, so none of them notices.
4. The service unit test "lets only the owner assign, and announces it".
5. The notifications test "queues one email for the assignee", which compares the job data exactly.

Notice bug 3: a composition mistake can only be caught by a test that uses the composition root. That is the one job no layer test can do.

## Recap

- Every layer can break in a way only its own tests see. Ask what each layer decides, what it trusts, what a bug looks like, and which dependency must be replaced.
- Service unit tests use a fake repository, a recording event bus and a test clock. A repository contract suite runs against the fake and PGlite, so the fake stays honest.
- Test setup can change behaviour: a per-test transaction broke the duplicate test. `TRUNCATE … RESTART IDENTITY` resets a shared database cheaply.
- Test your auth decisions (session lengths, logout, equal failures) with fake `Date`; run queue jobs yourself with `autoProcess: false` and `drain`; test CQRS wiring and identity from the context.
- HTTP and end-to-end tests build the app with the production `createApp`, with a harness that shares slow parts and resets the rest. Keep end-to-end tests few; they find wiring bugs nothing else can.

Next, you make the Task API tell you what it is doing in production, with [structured logs](https://zudojs.oyinlola.site/learn/zudo-logging).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
