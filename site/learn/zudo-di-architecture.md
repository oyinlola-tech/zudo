---
title: "DI architecture with ZudoJS — ZudoJS Academy"
description: "Decide where every object in a ZudoJS app is built: one composition root, constructor or factory injection, fakes in tests and frozen wiring in production."
source: https://zudojs.oyinlola.site/learn/zudo-di-architecture
---

LEVEL 12 · LESSON 11 OF 19

Dependency injection Core

# DI architecture with ZudoJS

Decide where every object in a ZudoJS app is built: one composition root, constructor or factory injection, fakes in tests and frozen wiring in production.

- **50 min** to read and try
- **You need:** "Dependency injection with @zudojs/container", and "The application runtime and lifecycle"
- **You build:** A Task API whose wiring lives in one place, is checked at startup, is frozen in production, and can be swapped piece by piece in tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Find the composition root of a generated ZudoJS project and explain why src/container.ts and the @zudojs/container container are two different things
- Choose between constructor injection, a factory registration and an injected factory function for a given dependency
- Recognise the service locator pattern and show the two failures it causes in @zudojs/container
- Replace dependencies in tests with fresh containers, replace and snapshots, and avoid stale references
- Make production wiring fail at startup instead of during a request, and freeze it once the app runs

## The problem: two task lists

A tester files a bug against the Task API: "I created *Buy milk* with `POST /tasks` and it appears in `GET /tasks`. But the store module's log, and the readiness check that counts tasks, never see it." Nobody changed the store. Here is a small copy of what happened. Two files each built the objects they needed:

domain.ts

```ts
import { createToken } from "@zudojs/container";
import type { Clock } from "@zudojs/types";

export type { Clock };
export { systemClock } from "@zudojs/types";

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
}

export class TaskStore {
  readonly tasks = new Map<number, Task>();
  private lastId = 0;
  nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}

export class TaskService {
  constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  create(title: string): Task {
    const task = { id: this.store.nextId(), title, createdAt: new Date(this.clock.now()).toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  list(): Task[] {
    return [...this.store.tasks.values()];
  }
}

export interface Mailer {
  send(to: string, text: string): void;
}

export class TaskNotifier {
  constructor(private readonly mailer: Mailer) {}
  taskDone(task: Task): void {
    this.mailer.send("ada@example.com", `"${task.title}" is done`);
  }
}

export const CLOCK = createToken<Clock>("Clock");
export const MAILER = createToken<Mailer>("Mailer");
```

two-lists.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import { TaskService, TaskStore, systemClock } from "./domain.js";

// app.ts: the runtime's container gives the modules their store
const container = createContainer();
container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
const moduleStore = container.resolve(TaskStore);
moduleStore.tasks.set(moduleStore.nextId(), { id: 1, title: "Read the runtime lesson", createdAt: "2026-09-23" });

// container.ts: hand-written dependencies for the routes
function createDependencies() {
  return { tasks: new TaskService(new TaskStore(), systemClock) };
}

const deps = createDependencies();
deps.tasks.create("Buy milk");
console.log("GET /tasks sees:  ", deps.tasks.list().map((t) => `#${t.id} ${t.title}`));
console.log("store module sees:", [...moduleStore.tasks.values()].map((t) => `#${t.id} ${t.title}`));
```

Output of `npx tsx two-lists.ts` and of the browser terminal

```ts
GET /tasks sees:   [ '#1 Buy milk' ]
store module sees: [ '#1 Read the runtime lesson' ]
```

Two stores exist, and each one numbers its tasks from 1. Each piece of code works on its own. The bug is in the *wiring*: two places decided, separately, how a `TaskStore` is made. The type checker cannot catch it, because both lines are correct TypeScript.

In [Dependency injection with @zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container) you learned the tools: tokens, providers, lifetimes and scopes. This lesson is about the **architecture** around them: where objects are created, who is allowed to ask the container for things, how tests replace parts, and how production wiring fails early instead of in the middle of a request.

## One composition root

The **composition root** is the one place in a program where the concrete objects are created and connected. You met the term in [Design principles](https://zudojs.oyinlola.site/learn/design-principles#composition). Three rules keep it useful:

- **One place.** Every decision of the form "which class, which lifetime, which settings" is made there, once. The bug above came from two places.
- **At the edge.** It runs at startup, next to the entry point. Services, repositories and controllers never create their own collaborators.
- **Only there may you call `resolve`.** Everything else receives what it needs. You will see why in [the service locator section](#locator).

### Where it is in a generated project

This is the confusing part of a generated ZudoJS project, so it is worth being precise. There are **two different wiring mechanisms**, and the names do not help:

```ts
src/server.ts      entry point: loads config, calls createApp, builds the router
   │
   ├─▶ src/app.ts        createContainer()          a @zudojs/container container
   │                     → given to createRuntime    (generated EMPTY; you filled it
   │                                                  with registerServices)
   │
   └─▶ src/container.ts  createDependencies()       plain TypeScript, no container:
                         new ExamplesController(      `zudojs generate resource`
                           new ExamplesService(       writes these `new` chains
                             new InMemoryExamples…))  between the markers
```

The file called `container.ts` does not contain the @zudojs/container container; `app.ts` does.

- `src/app.ts` creates a real `@zudojs/container` with `createContainer()` and hands it to the runtime, which keeps it as `runtime.context.container`. The generator puts nothing in it. As generated, nothing reads it either.
- `src/container.ts` is a **hand-written** composition root: `createDependencies` calls constructors directly. The CLI calls it the composition root, and `zudojs generate resource` adds its `new` chains there.

Neither is wrong. Hand wiring is clearer for a few objects with no shared parts. A container earns its place once objects are shared, have lifetimes, need disposing, or must be swapped in tests. The Task API now has both, and that is fine, as long as each object is built by exactly one of them. After [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container#task-api) the split is:

| Object | Built by | Why there |
| --- | --- | --- |
| `TaskStore`, `TaskService`, `CLOCK` | The container, through `registerServices` in `src/container.ts` | Shared by modules and routes, singletons, the clock is replaced in tests |
| `StoreModule`, `TasksModule` | `new` in `src/app.ts`, with the store resolved from the container | The runtime owns their lifecycle, not the container |
| `ExamplesController` and its service and repository | `new` in `createDependencies` | Generated, used by one route file, nothing shared |

So in this project the composition root is two files that work together: `src/container.ts` says *how* things are built (`registerServices`, `createDependencies`), and `src/app.ts` and `src/server.ts` say *when* (at startup, before the server listens). No other file creates a shared object or calls `resolve`.

REASON IT OUT

### Where should each object be built?

Before reading the answer, decide for each object below whether it belongs in the container, in hand-written wiring, or nowhere near the composition root. Think about who shares it, how long it lives, who cleans it up, and whether a test needs to replace it.

- A PostgreSQL connection pool.
- The loaded `AppConfig` object.
- An audit log that collects one request's events and writes them when the request ends.
- A `Task` object for a newly created task.
- The generated `ExamplesController`.

**Show the reasoning**

- **The pool**: the container, as a singleton. It is shared by every repository, must be closed at shutdown (the container disposes singletons newest first), and tests replace it with an in-memory database. It needs an `await` to connect, which matters: see [production composition](#production).
- **The config**: loaded once in `server.ts` and handed to the composition root. Register it as a value (`registerValue(CONFIG, config)`) if services need it; the container did not create it, so it will not dispose it.
- **The audit log**: the container, as **scoped**. One per request, disposed when the request's scope ends.
- **A `Task`**: nowhere near it. Data objects are created by your code while it runs (`TaskService.create` builds them). A container builds the *machinery* of the app, not the data flowing through it.
- **`ExamplesController`**: leave it in `createDependencies`, where the CLI keeps it up to date. Move it into the container only when something else needs to share its parts.

## Constructor injection

**Constructor injection** means a class lists everything it needs as constructor parameters. It is the default style, for three reasons:

- **Visible**: the constructor is the complete list of dependencies. A reader, a test and the container all see the same list.
- **Complete**: once `new` returns, the object works. There is no moment where it exists but is not ready.
- **Immutable**: with `private readonly`, nothing can swap a dependency behind the object's back.

Compare the alternative, **property injection**, where a dependency is assigned after construction. It looks flexible, and it creates a half-built object:

half-built.ts

```ts
import type { Clock, Task } from "./domain.js";

class ReportService {
  clock?: Clock;

  dueToday(tasks: Task[]): string {
    const today = new Date(this.clock!.now()).toISOString().slice(0, 10);
    return `${tasks.filter((t) => t.createdAt.startsWith(today)).length} task(s) created today`;
  }
}

const reports = new ReportService();
try {
  console.log(reports.dueToday([]));
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
```

Output of `npx tsx half-built.ts` and of the browser terminal

```ts
TypeError Cannot read properties of undefined (reading 'now')
```

Somebody forgot to set `clock`, and the failure appears only when the method runs, far from the forgetting. The `!` told TypeScript to stop checking. With `constructor(private readonly clock: Clock)`, the same mistake is a compile error at the `new`.

### Class registration or factory registration

You have two ways to register a constructor-injected class. `registerClass(TaskService, TaskService, { inject: [TaskStore, CLOCK] })` is short, but, as the container lesson warned, its `inject` list is not compared with the constructor. A factory registration is checked, because its parameters are typed from the `inject` list:

factory-registration.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, TaskService, TaskStore } from "./domain.js";

const container = createContainer();
container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
container.registerFactory(TaskService, (store, clock) => new TaskService(store, clock), [TaskStore, CLOCK], {
  scope: ContainerScope.SINGLETON,
});

console.log(container.resolve(TaskService).create("Buy milk"));
```

Output of `npx tsx factory-registration.ts` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', createdAt: '2026-09-24T09:00:00.000Z' }
```

Swap `TaskStore` and `CLOCK` in that list and the arrow function no longer type-checks. That costs you one short arrow function per class, and every piece of wiring is then checked by the compiler. This lesson uses factory registrations for every class with dependencies.

> TIP
>
> A constructor with seven parameters is not a DI problem; it is a design message. The class probably does several jobs. Split it (see [cohesion](https://zudojs.oyinlola.site/learn/design-principles#cohesion)) rather than hiding the parameters in an "options bag" or a service locator.

## Factory injection

"Factory injection" is used for two different ideas. Both are useful, and both keep the container out of your services.

### 1. A factory registration that decides

Sometimes the composition root must choose *which* implementation to build, based on settings. That decision belongs in a factory registration, not in the service. In development the Task API should print e-mails; in production it should send them:

choose.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { MAILER, TaskNotifier } from "./domain.js";
import type { Mailer } from "./domain.js";

interface MailSettings {
  readonly transport: "console" | "smtp";
  readonly smtpHost: string;
}
const MAIL_SETTINGS = createToken<MailSettings>("MailSettings");

class ConsoleMailer implements Mailer {
  send(to: string, text: string): void {
    console.log(`  [console mail] to ${to}: ${text}`);
  }
}
class SmtpMailer implements Mailer {
  constructor(private readonly host: string) {}
  send(to: string, text: string): void {
    console.log(`  [smtp ${this.host}] to ${to}: ${text}`);
  }
}

function compose(settings: MailSettings) {
  const container = createContainer();
  container.registerValue(MAIL_SETTINGS, settings);
  container.registerFactory(
    MAILER,
    (mail) => (mail.transport === "smtp" ? new SmtpMailer(mail.smtpHost) : new ConsoleMailer()),
    [MAIL_SETTINGS],
    { scope: ContainerScope.SINGLETON },
  );
  container.registerFactory(TaskNotifier, (mailer) => new TaskNotifier(mailer), [MAILER]);
  return container;
}

const task = { id: 1, title: "Pay the ₦45,000 electricity bill", createdAt: "2026-09-24" };
for (const transport of ["console", "smtp"] as const) {
  console.log(transport);
  compose({ transport, smtpHost: "mail.tasks.example.com" }).resolve(TaskNotifier).taskDone(task);
}
```

Output of `npx tsx choose.ts` and of the browser terminal

```ts
console
  [console mail] to ada@example.com: "Pay the ₦45,000 electricity bill" is done
smtp
  [smtp mail.tasks.example.com] to ada@example.com: "Pay the ₦45,000 electricity bill" is done
```

`TaskNotifier` has no `if` about environments. It asked for "a mailer" and got the right one. When a third transport arrives, you change one factory, not every class that sends e-mail.

### 2. Injecting a factory function

The second idea: a service needs to create objects *while it runs*, several times, or with data it only learns later. An importer that reads tasks from a CSV file needs a fresh report for every import. It cannot receive one report in its constructor, because that single report would be shared by every import. It receives a **factory function** instead:

inject-factory.ts

```ts
import { createContainer, createToken } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK } from "./domain.js";
import type { Clock } from "./domain.js";

class ImportReport {
  readonly lines: string[] = [];
  constructor(readonly source: string, private readonly clock: Clock) {}
  add(line: string): void {
    this.lines.push(line);
  }
  summary(): string {
    return `${this.source}: ${this.lines.length} task(s) at ${new Date(this.clock.now()).toISOString().slice(11, 16)}`;
  }
}

type ReportFactory = (source: string) => ImportReport;
const REPORT_FACTORY = createToken<ReportFactory>("ImportReportFactory");

class TaskImporter {
  constructor(private readonly newReport: ReportFactory) {}
  importCsv(source: string, csv: string): string {
    const report = this.newReport(source);
    for (const line of csv.split("\n").filter(Boolean)) report.add(line);
    return report.summary();
  }
}

const container = createContainer();
container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-24T08:30:00Z")));
container.registerFactory(REPORT_FACTORY, (clock) => (source: string) => new ImportReport(source, clock), [CLOCK]);
container.registerFactory(TaskImporter, (newReport) => new TaskImporter(newReport), [REPORT_FACTORY]);

const importer = container.resolve(TaskImporter);
console.log(importer.importCsv("monday.csv", "Buy milk\nWalk the dog\n"));
console.log(importer.importCsv("tuesday.csv", "Water the plants\n"));
```

Output of `npx tsx inject-factory.ts` and of the browser terminal

```ts
monday.csv: 2 task(s) at 08:30
tuesday.csv: 1 task(s) at 08:30
```

Each import got its own report, and the report still received its clock from the composition root. `TaskImporter` knows only one thing: "I can make a report from a source name". It cannot reach anything else, and a test can pass `(source) => fakeReport` without any container at all.

| You need | Use |
| --- | --- |
| One collaborator for the object's whole life | Constructor injection |
| The composition root must pick an implementation or build it from settings | A factory registration |
| New objects at run time, many of them, or built from run-time data | Inject a typed factory function |

## The service locator trap

There is a tempting shortcut: give a class the container itself, and let it `resolve` whatever it needs, when it needs it. That pattern is called a **service locator**. It looks like less wiring. It moves two failures from startup into production.

### Failure 1: a missing registration is found late

A reminder job e-mails users about tasks due today. Written as a locator, its only visible dependency is the container. The composition root below forgot to register a mailer, and the startup check, which resolves every service once, does not notice:

locator-late.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import type { Container } from "@zudojs/container";
import { MAILER } from "./domain.js";

class DueTodayReminder {
  constructor(private readonly container: Container) {}
  run(): void {
    this.container.resolve(MAILER).send("ada@example.com", "2 tasks are due today");
  }
}

const container = createContainer();
container.registerFactory(DueTodayReminder, () => new DueTodayReminder(container), [], {
  scope: ContainerScope.SINGLETON,
});

const reminder = container.resolve(DueTodayReminder);
console.log("startup check passed");

try {
  reminder.run(); // the next morning at 08:00
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
```

Output of `npx tsx locator-late.ts` and of the browser terminal

```ts
startup check passed
RegistrationNotFoundError No registration found for token "Mailer".
```

The server started, passed its checks, and failed the next morning when the job ran. Now the same class with constructor injection:

locator-early.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import { MAILER } from "./domain.js";
import type { Mailer } from "./domain.js";

class DueTodayReminder {
  constructor(private readonly mailer: Mailer) {}
  run(): void {
    this.mailer.send("ada@example.com", "2 tasks are due today");
  }
}

const container = createContainer();
container.registerFactory(DueTodayReminder, (mailer) => new DueTodayReminder(mailer), [MAILER], {
  scope: ContainerScope.SINGLETON,
});

try {
  container.resolve(DueTodayReminder);
  console.log("startup check passed");
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
```

Output of `npx tsx locator-early.ts` and of the browser terminal

```ts
DependencyResolutionError Failed to resolve DueTodayReminder: No registration found for token "Mailer". (chain: DueTodayReminder)
```

The missing mailer stops the app at startup, with the chain that needed it. A deploy that fails to start is rolled back before a single user notices; a job that fails at 08:00 is a bug report.

### Failure 2: the container cannot see the dependency

A factory that calls `container.resolve` inside its body, instead of listing tokens in `inject`, is a locator too, even though it sits in the composition root. The container does not know the dependency exists. When a test replaces the clock, the container rebuilds every singleton that listed `CLOCK`, and only those:

locator-replace.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, TaskService, TaskStore } from "./domain.js";

const container = createContainer();
container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });

class ListedService extends TaskService {}
class HiddenService extends TaskService {}
container.registerFactory(ListedService, (store, clock) => new ListedService(store, clock), [TaskStore, CLOCK], {
  scope: ContainerScope.SINGLETON,
});
container.registerFactory(
  HiddenService,
  () => new HiddenService(container.resolve(TaskStore), container.resolve(CLOCK)),
  [],
  { scope: ContainerScope.SINGLETON },
);

container.resolve(ListedService);
container.resolve(HiddenService);
container.replace(CLOCK, { useValue: new FixedClock(Date.parse("2030-01-01T00:00:00Z")) });

console.log("listed:", container.resolve(ListedService).create("Buy milk").createdAt);
console.log("hidden:", container.resolve(HiddenService).create("Buy bread").createdAt);
```

Output of `npx tsx locator-replace.ts` and of the browser terminal

```ts
listed: 2030-01-01T00:00:00.000Z
hidden: 2026-09-24T09:00:00.000Z
```

The hidden service still uses the old clock, so a test that replaced the clock gets a date from 2026 and fails in a confusing way. The same blindness defeats the lifetime checks: the container refuses a singleton that *lists* a scoped dependency (a `CaptiveDependencyError`), but it cannot refuse one it was never told about.

### Who may call resolve

- The composition root: `src/app.ts` (to hand the store to modules) and `createDependencies` (to hand services to routes).
- Edge code that creates a per-request scope, shown in [the next section](#request-scope).
- Tests.

Nobody else. A service, repository or controller that takes a `Container` parameter is a locator. The [module context](https://zudojs.oyinlola.site/learn/zudo-core#module-context) of `@zudojs/core` follows the same idea: it does not hand modules the container, only what they need.

## Replacing parts in tests

A good test uses the *production* wiring and replaces only the outside world: the clock, the mailer, the payment gateway. Then a wiring mistake shows up in the test run, not in production. Put the production registrations in a function that both the app and the tests call:

registrations.ts

```ts
import { ContainerScope } from "@zudojs/container";
import type { Container } from "@zudojs/container";
import { CLOCK, MAILER, TaskNotifier, TaskService, TaskStore, systemClock } from "./domain.js";

/** The production wiring. The app and every test call this one function. */
export function registerTaskServices(container: Container): void {
  container.registerValue(CLOCK, systemClock);
  container.registerValue(MAILER, { send: (to, text) => console.log(`SMTP to ${to}: ${text}`) });
  container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
  container.registerFactory(TaskService, (store, clock) => new TaskService(store, clock), [TaskStore, CLOCK], {
    scope: ContainerScope.SINGLETON,
  });
  container.registerFactory(TaskNotifier, (mailer) => new TaskNotifier(mailer), [MAILER], {
    scope: ContainerScope.SINGLETON,
  });
}
```

### A fresh container per test

The simplest and safest approach: every test builds its own container, calls the real registration function, then replaces what it needs. Nothing leaks from one test to the next:

fresh.ts

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, MAILER, TaskNotifier, TaskService } from "./domain.js";
import { registerTaskServices } from "./registrations.js";

function testContainer(fakes: { now?: string; sent?: string[] } = {}) {
  const container = createContainer({ name: "test" });
  registerTaskServices(container);
  if (fakes.now !== undefined) {
    container.replace(CLOCK, { useValue: new FixedClock(Date.parse(fakes.now)) });
  }
  const sent = fakes.sent;
  if (sent) {
    container.replace(MAILER, { useValue: { send: (_to, text) => void sent.push(text) } });
  }
  return container;
}

function check(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

const first = testContainer({ now: "2026-09-24T09:00:00Z" });
check("uses the fixed clock", first.resolve(TaskService).create("Buy milk").createdAt === "2026-09-24T09:00:00.000Z");

const sent: string[] = [];
const second = testContainer({ sent });
const task = second.resolve(TaskService).create("Walk the dog");
second.resolve(TaskNotifier).taskDone(task);
check("records the e-mail instead of sending it", sent[0] === '"Walk the dog" is done');
check("tests do not share a store", second.resolve(TaskService).list().length === 1);
```

Output of `npx tsx fresh.ts` and of the browser terminal

```ts
PASS uses the fixed clock
PASS records the e-mail instead of sending it
PASS tests do not share a store
```

`replace` is type-checked against the token, so a fake clock without `now()` does not compile. And because both tests went through `registerTaskServices`, a missing or broken registration fails them, exactly as it would fail the app.

### Snapshots on a shared container

When building the container is expensive, tests can share one and put it back after each change. `snapshot()` saves the registrations, `restoreSnapshot()` brings them back and rebuilds every singleton made from the changed set. Watch what happens to an object someone resolved *before* the replacement:

snapshot.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, TaskService, TaskStore } from "./domain.js";

class Reports {
  constructor(readonly tasks: TaskService) {}
  dispose(): void {
    console.log("  old Reports disposed");
  }
}

const container = createContainer();
container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
container.registerFactory(TaskService, (store, clock) => new TaskService(store, clock), [TaskStore, CLOCK], {
  scope: ContainerScope.SINGLETON,
});
container.registerFactory(Reports, (tasks) => new Reports(tasks), [TaskService], { scope: ContainerScope.SINGLETON });

const keptByHand = container.resolve(Reports);
const saved = container.snapshot();

console.log("replace the clock:");
container.replace(CLOCK, { useValue: new FixedClock(Date.parse("2030-01-01T00:00:00Z")) });
console.log("fresh resolve:", container.resolve(Reports).tasks.create("Buy milk").createdAt);
console.log("kept by hand: ", keptByHand.tasks.create("Buy bread").createdAt);

console.log("store before restore:", container.resolve(TaskService).list().length, "task(s)");

container.restoreSnapshot(saved);
const restored = container.resolve(Reports).tasks;
console.log("after restore:", restored.create("Buy eggs").createdAt, "|", restored.list().length, "task(s)");
```

Output of `npx tsx snapshot.ts` and of the browser terminal

```ts
replace the clock:
  old Reports disposed
fresh resolve: 2030-01-01T00:00:00.000Z
kept by hand:  2026-09-24T09:00:00.000Z
store before restore: 2 task(s)
  old Reports disposed
after restore: 2026-09-24T09:00:00.000Z | 1 task(s)
```

Three lessons in one output:

- `replace` rebuilt `Reports`, because it depends on the clock through `TaskService`, and **disposed** the old instance. `TaskStore` does not depend on the clock, so it was kept: the store held two tasks before the restore.
- The object resolved before the replacement did not change. `keptByHand` still points at the old, already disposed, service with the 2026 clock. A replacement only reaches code that resolves *after* it. In tests, replace first, then resolve.
- A snapshot holds registrations, not instances. The restore disposed the 2030 `Reports` (the second "disposed" line) and every other singleton, then built fresh ones on the original clock, including a new, empty store. Singletons are rebuilt, not rolled back to their old contents.

> SNAPSHOTS DO NOT MAKE PARALLEL TESTS SAFE
>
> A shared container is shared state. If two tests run at the same time and one replaces the clock, the other sees it. Test runners such as Vitest run files in parallel. Keep a shared container inside one test file, or use a fresh container per test.

## Production composition

In production you want the opposite of test flexibility: the wiring must be complete before the first request, and nothing may change it afterwards.

### Check every registration at startup

A container is lazy: it builds an object the first time someone asks for it. A broken registration that nobody asks for at startup waits for the first request that needs it. A small helper resolves every registration once, scoped ones inside a throwaway scope, and reports all the problems at once:

verify.ts

```ts
import { describeToken, isScopedRegistration } from "@zudojs/container";
import type { Container } from "@zudojs/container";

/** Resolves every registration once; throws one error listing every one that fails. */
export async function verifyContainer(container: Container): Promise<number> {
  const problems: string[] = [];
  const scope = container.createScope({ name: "startup-check" });
  const registrations = container.getRegistrations();
  for (const registration of registrations) {
    try {
      (isScopedRegistration(registration) ? scope : container).resolve(registration.token);
    } catch (error) {
      problems.push(`${describeToken(registration.token)}: ${(error as Error).message}`);
    }
  }
  await scope.dispose();
  if (problems.length > 0) {
    throw new AggregateError([], `Wiring is broken:\n- ${problems.join("\n- ")}`);
  }
  return registrations.length;
}
```

verify-run.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { MAILER, TaskNotifier } from "./domain.js";
import { registerTaskServices } from "./registrations.js";
import { verifyContainer } from "./verify.js";

const good = createContainer();
registerTaskServices(good);
console.log("registrations checked:", await verifyContainer(good));

interface PaymentGateway {
  charge(kobo: number): void;
}
const PAYMENTS = createToken<PaymentGateway>("PaymentGateway");
class InvoiceService {
  constructor(readonly payments: PaymentGateway) {}
}

const broken = createContainer();
broken.registerFactory(TaskNotifier, (mailer) => new TaskNotifier(mailer), [MAILER]);
broken.registerFactory(InvoiceService, (payments) => new InvoiceService(payments), [PAYMENTS], {
  scope: ContainerScope.SCOPED,
});
try {
  await verifyContainer(broken);
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx verify-run.ts` and of the browser terminal

```ts
registrations checked: 5
Wiring is broken:
- TaskNotifier: Failed to resolve TaskNotifier: No registration found for token "Mailer". (chain: TaskNotifier)
- InvoiceService: Failed to resolve InvoiceService: No registration found for token "PaymentGateway". (chain: InvoiceService)
```

Both mistakes, including the one in a scoped registration that only a request would have reached, are reported before the app accepts traffic. Call the helper in the composition root, right after registering. The same call in a test checks the production wiring on every test run.

### Freeze the wiring

Once the app runs, nothing should be able to register or replace a service. A later `register` call is either a bug or someone patching production at run time. Two container options make that impossible:

- `freezeRegistrations: true`: the registration set is frozen when the container starts, which happens at the first `resolve`. Later `register`, `replace`, `remove` and `restoreSnapshot` calls throw.
- `resolution: { autoRegisterClasses: false }`: resolving a class that was never registered fails, instead of quietly building a new transient instance.

freeze.ts

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, TaskService } from "./domain.js";
import { registerTaskServices } from "./registrations.js";

class ForgottenService {}

const container = createContainer({
  name: "task-api",
  freezeRegistrations: true,
  resolution: { autoRegisterClasses: false },
});
registerTaskServices(container);
container.resolve(TaskService);
console.log("started:", container.isStarted());

for (const attempt of [
  () => container.replace(CLOCK, { useValue: new FixedClock(0) }),
  () => container.resolve(ForgottenService),
]) {
  try {
    attempt();
  } catch (error) {
    console.log((error as Error).name, (error as Error).message);
  }
}
```

Output of `npx tsx freeze.ts` and of the browser terminal

```ts
started: true
ContainerError Registrations for container "task-api" are frozen.
RegistrationNotFoundError No registration found for token "ForgottenService".
```

Freeze only the production container. Test containers stay unfrozen, because replacing parts is their job. That is another reason to keep the registrations in one function and let the caller create the container.

### Resources that need await

The container is synchronous: `resolve` returns a value, not a promise. A database pool or a cache client usually needs `await connect()` first. A singleton factory that returns a promise is refused:

async-resource.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

class Pool {
  static async connect(url: string): Promise<Pool> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Pool(url);
  }
  private constructor(readonly url: string) {}
  async dispose(): Promise<void> {
    console.log("pool closed");
  }
}
const POOL = createToken<Pool>("Pool");

const wrong = createContainer();
wrong.registerFactory(POOL, () => Pool.connect("postgres://localhost/tasks") as unknown as Pool, [], {
  scope: ContainerScope.SINGLETON,
});
try {
  wrong.resolve(POOL);
} catch (error) {
  console.log((error as Error).name);
}

const right = createContainer();
const pool = await Pool.connect("postgres://localhost/tasks");
right.registerValue(POOL, pool);
console.log("connected to", right.resolve(POOL).url);
await right.dispose();
await pool.dispose();
```

Output of `npx tsx async-resource.ts` and of the browser terminal

```ts
AsyncProviderError
connected to postgres://localhost/tasks
pool closed
```

The fix is to `await` the resource in the composition root and register the finished object with `registerValue`. The type checker hid the problem only because of the `as unknown as Pool` cast; without it, TypeScript refuses the factory. Note the last two lines: the container did not create the pool, so disposing the container did not close it. Whoever opened it closes it. In the Task API, that is a job for a runtime module or an integration, whose `stop` runs at shutdown.

### A scope per request

Scoped registrations need a scope, and in an HTTP app the natural scope is one request. The edge of the app, a middleware, is part of the composition root's job: it creates the scope, puts it on the request, and disposes it when the response is done:

request-scope.tsNode.js only

```ts
import { ContainerScope, createContainer } from "@zudojs/container";
import type { ContainerScopeContext } from "@zudojs/container";
import { createRequestContext, createResponseContext, createRouter, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware, HttpRequestContext } from "@zudojs/http";

class AuditLog {
  readonly entries: string[] = [];
  dispose(): void {
    console.log(`audit written: ${this.entries.join(", ")}`);
  }
}
class TaskCommands {
  constructor(private readonly audit: AuditLog) {}
  create(title: string) {
    this.audit.entries.push(`created "${title}"`);
    return { title };
  }
}

const container = createContainer();
container.registerClass(AuditLog, AuditLog, { scope: ContainerScope.SCOPED });
container.registerFactory(TaskCommands, (audit) => new TaskCommands(audit), [AuditLog], { scope: ContainerScope.SCOPED });

const REQUEST_SCOPE = Symbol("request scope");
const requestScope: HttpMiddleware = async (context, next) => {
  const scope = container.createScope({ name: context.request.id });
  context.request.setState(REQUEST_SCOPE, scope);
  try {
    return await next();
  } finally {
    await scope.dispose();
  }
};
function scopeOf(request: HttpRequestContext): ContainerScopeContext {
  const scope = request.getState<ContainerScopeContext>(REQUEST_SCOPE);
  if (!scope) throw new Error("the requestScope middleware is not installed");
  return scope;
}

const router = createRouter();
router.post("/tasks", (ctx) => scopeOf(ctx.request).resolve(TaskCommands).create("Buy milk"));

const pipeline = new HttpMiddlewarePipeline({
  middlewares: [requestScope, async (context) => (await router.dispatch(context.request)).response],
});
for (const id of ["req-1", "req-2"]) {
  const response = await pipeline.execute(createRequestContext({ id, method: "POST", url: "/tasks" }), createResponseContext());
  console.log(id, response.status, response.body);
}
```

Output of `npx tsx request-scope.ts`

```ts
audit written: created "Buy milk"
req-1 200 {"title":"Buy milk"}
audit written: created "Buy milk"
req-2 200 {"title":"Buy milk"}
```

Each request got its own `AuditLog`, and each log was written when its request finished, even if the route had thrown, thanks to `finally`. The route calls `resolve` on the request's scope. That is the one resolve per request, at the edge; everything below it receives its dependencies through constructors.

## Put it in the Task API

Apply this lesson to the Task API in three small edits. The files from the previous lessons (`tasks.store.ts`, `tasks.dto.ts`, `tasks.service.ts` and the two modules) do not change.

First, in `src/container.ts`, register `TaskService` with a factory so the compiler checks its wiring, and add the startup check next to it. Add `describeToken` and `isScopedRegistration` to the existing `@zudojs/container` import:

src/container.ts (part)Node.js only

```ts
import { ContainerScope, createToken, describeToken, isScopedRegistration } from "@zudojs/container";
import type { Container } from "@zudojs/container";

/** The clock the Task API uses; a test can replace it with a fixed one. */
export const CLOCK = createToken<Clock>("Clock");

/** Tells the runtime's container how to build the shared task services. */
export function registerServices(container: Container): void {
  container.registerValue(CLOCK, systemClock);
  container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
  container.registerFactory(TaskService, (store, clock) => new TaskService(store, clock), [TaskStore, CLOCK], {
    scope: ContainerScope.SINGLETON,
  });
}

/** Resolves every registration once; throws one error listing every one that fails. */
export async function verifyContainer(container: Container): Promise<number> {
  const problems: string[] = [];
  const scope = container.createScope({ name: "startup-check" });
  const registrations = container.getRegistrations();
  for (const registration of registrations) {
    try {
      (isScopedRegistration(registration) ? scope : container).resolve(registration.token);
    } catch (error) {
      problems.push(`${describeToken(registration.token)}: ${(error as Error).message}`);
    }
  }
  await scope.dispose();
  if (problems.length > 0) {
    throw new AggregateError([], `Wiring is broken:\n- ${problems.join("\n- ")}`);
  }
  return registrations.length;
}
```

Second, in `src/app.ts`, create the production container frozen and strict. `createApp` is synchronous, so it cannot await the check; it only creates the container. Change the one line:

src/app.ts (part)Node.js only

```ts
const container = createContainer({
  name: "task-api",
  freezeRegistrations: true,
  resolution: { autoRegisterClasses: false },
});
registerServices(container);
const store = container.resolve(TaskStore);
```

The `resolve` on the next line starts the container, so from here on its registrations are frozen. The runtime works with a frozen container: it only reads from it, and disposes it on stop if you set `disposeContainerOnStop`, as [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware#task-api) will.

Third, in `src/server.ts`, run the check before the runtime starts. The generated file already uses top-level `await`, so add one line after `createApp`, and import `verifyContainer` next to `createDependencies`:

src/server.ts (part)Node.js only

```ts
import { createDependencies, verifyContainer } from "./container.js";

const config = await loadConfig();
const httpServer = createServer();
const runtime = createApp({ config, httpServer });
await verifyContainer(runtime.context.container);
```

A broken registration now stops `npm run dev` with one message listing every problem, before the port opens. To see both sides, save this check script as `src/check-wiring.ts`. It builds the frozen production container through `createApp`, and a test container through the same `registerServices`:

src/check-wiring.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { createApp } from "./app.js";
import { loadConfig } from "./configs/index.js";
import { CLOCK, registerServices, verifyContainer } from "./container.js";
import { TaskService } from "./services/tasks.service.js";

// Production: the real composition root, frozen.
const runtime = createApp({ config: await loadConfig({}) });
const production = runtime.context.container;
console.log("production registrations:", await verifyContainer(production));
try {
  production.replace(CLOCK, { useValue: new FixedClock(0) });
} catch (error) {
  console.log("production replace:", (error as Error).message);
}

// A test: the same registrations, a fixed clock.
const test = createContainer({ name: "test" });
registerServices(test);
test.replace(CLOCK, { useValue: new FixedClock(Date.parse("2026-09-24T09:00:00Z")) });
console.log("test registrations:", await verifyContainer(test));
console.log(test.resolve(TaskService).create({ title: "Buy milk" }).createdAt);
```

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx src/check-wiring.ts
production registrations: 3
production replace: Registrations for container "task-api" are frozen.
test registrations: 3
2026-09-24T09:00:00.000Z
```

The production container refused to change, while the test container took a fixed clock through the very same `registerServices`. When you add a service in a later lesson, register it in `registerServices`, and the startup check covers it automatically.

> NOTE
>
> The next lesson hands `TaskService` to the routes: `createDependencies` will receive `runtime.context.container` and call `resolve(TaskService)`. That is a resolve in the composition root, which is where it belongs. The generated `ExamplesController` line between the markers stays hand-wired.

## Practice

TRY IT YOURSELF

### Remove a service locator

This invoice sender pulls its collaborators from the container. Rewrite it with constructor injection, register it with a factory, and show that a forgotten `CLOCK` registration now fails when the sender is resolved, not when it runs.

invoice-locator.ts

```ts
class InvoiceSender {
  constructor(private readonly container: Container) {}
  sendMonthly(customer: string): void {
    const month = new Date(this.container.resolve(CLOCK).now()).toISOString().slice(0, 7);
    this.container.resolve(MAILER).send(customer, `Your invoice for ${month}: ₦12,500`);
  }
}
```

**Show a solution**

invoice-injected.ts

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, MAILER } from "./domain.js";
import type { Clock, Mailer } from "./domain.js";

class InvoiceSender {
  constructor(private readonly clock: Clock, private readonly mailer: Mailer) {}
  sendMonthly(customer: string): void {
    const month = new Date(this.clock.now()).toISOString().slice(0, 7);
    this.mailer.send(customer, `Your invoice for ${month}: ₦12,500`);
  }
}

function compose(withClock: boolean) {
  const container = createContainer();
  if (withClock) container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
  container.registerValue(MAILER, { send: (to, text) => console.log(`to ${to}: ${text}`) });
  container.registerFactory(InvoiceSender, (clock, mailer) => new InvoiceSender(clock, mailer), [CLOCK, MAILER]);
  return container;
}

compose(true).resolve(InvoiceSender).sendMonthly("chiamaka@example.com");
try {
  compose(false).resolve(InvoiceSender);
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx invoice-injected.ts` and of the browser terminal

```ts
to chiamaka@example.com: Your invoice for 2026-09: ₦12,500
Failed to resolve InvoiceSender: No registration found for token "Clock". (chain: InvoiceSender)
```

The class now states its two dependencies, a test can build it with `new InvoiceSender(fakeClock, fakeMailer)` and no container, and a missing registration surfaces at resolve time, which the startup check turns into a failed deploy.

TRY IT YOURSELF

### A test container with typed overrides

Write `buildTestContainer(overrides)` for the `di` project. `overrides` may contain a `clock` and a `mailer`. It must use `registerTaskServices`, replace only what was given, and run `verifyContainer`. Show two containers with different clocks that do not affect each other.

**Show a solution**

test-container.ts

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, MAILER, TaskService } from "./domain.js";
import type { Clock, Mailer } from "./domain.js";
import { registerTaskServices } from "./registrations.js";
import { verifyContainer } from "./verify.js";

interface Overrides {
  readonly clock?: Clock;
  readonly mailer?: Mailer;
}

async function buildTestContainer(overrides: Overrides = {}) {
  const container = createContainer({ name: "test" });
  registerTaskServices(container);
  if (overrides.clock) container.replace(CLOCK, { useValue: overrides.clock });
  if (overrides.mailer) container.replace(MAILER, { useValue: overrides.mailer });
  await verifyContainer(container);
  return container;
}

const at = (iso: string): Clock => new FixedClock(Date.parse(iso));
const monday = await buildTestContainer({ clock: at("2026-09-21T09:00:00Z") });
const friday = await buildTestContainer({ clock: at("2026-09-25T17:00:00Z") });

console.log(monday.resolve(TaskService).create("Plan the week").createdAt);
console.log(friday.resolve(TaskService).create("Send the report").createdAt);
console.log(monday.resolve(TaskService).list().length, friday.resolve(TaskService).list().length);
```

Output of `npx tsx test-container.ts` and of the browser terminal

```ts
2026-09-21T09:00:00.000Z
2026-09-25T17:00:00.000Z
1 1
```

Because `Overrides` uses the real `Clock` and `Mailer` interfaces, a fake with the wrong shape does not compile. Each call builds a separate container, so the two tests have separate stores and clocks.

TRY IT YOURSELF

### Pick the storage at the composition root

The Task API will get a PostgreSQL repository. Define a `TaskRepository` interface with `save(title)` and `count()`, an in-memory and a (fake) PostgreSQL implementation, and a `TASK_REPOSITORY` token. Register it with a factory that reads a `storage: "memory" | "postgres"` setting. `TaskService`-like code must not contain an `if` about storage.

**Show a solution**

choose-storage.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

interface TaskRepository {
  save(title: string): void;
  count(): number;
}
class MemoryTaskRepository implements TaskRepository {
  private readonly titles: string[] = [];
  save(title: string): void {
    this.titles.push(title);
  }
  count(): number {
    return this.titles.length;
  }
}
class PostgresTaskRepository extends MemoryTaskRepository {
  override save(title: string): void {
    console.log(`  INSERT INTO tasks (title) VALUES ('${title}')`);
    super.save(title);
  }
}

const STORAGE = createToken<"memory" | "postgres">("Storage");
const TASK_REPOSITORY = createToken<TaskRepository>("TaskRepository");

class TaskRecorder {
  constructor(private readonly repository: TaskRepository) {}
  record(title: string): string {
    this.repository.save(title);
    return `${this.repository.count()} task(s) stored`;
  }
}

for (const storage of ["memory", "postgres"] as const) {
  const container = createContainer();
  container.registerValue(STORAGE, storage);
  container.registerFactory(
    TASK_REPOSITORY,
    (kind) => (kind === "postgres" ? new PostgresTaskRepository() : new MemoryTaskRepository()),
    [STORAGE],
    { scope: ContainerScope.SINGLETON },
  );
  container.registerFactory(TaskRecorder, (repository) => new TaskRecorder(repository), [TASK_REPOSITORY]);
  console.log(storage);
  console.log(" ", container.resolve(TaskRecorder).record("Buy milk"));
}
```

Output of `npx tsx choose-storage.ts` and of the browser terminal

```ts
memory
  1 task(s) stored
postgres
  INSERT INTO tasks (title) VALUES ('Buy milk')
  1 task(s) stored
```

The only `if` about storage is in the factory. The real PostgreSQL repository in [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database) must use parameterised queries, never a title pasted into SQL as this fake does for display.

## Recap

- The **composition root** is the one place where objects are created and connected. In a generated project it is `src/container.ts` together with `src/app.ts` and `src/server.ts`. The generated `app.ts` creates an empty `@zudojs/container` container, while `src/container.ts` wires the example resource by hand. Build each object with exactly one of them.
- **Constructor injection** is the default: visible, complete, immutable. Register such classes with `registerFactory`, so the compiler checks the order of the `inject` list.
- **Factory injection**: a factory registration chooses an implementation from settings; an injected factory function lets a service create objects at run time.
- A **service locator** (a class or factory that calls `container.resolve`) hides dependencies. Missing registrations then surface late, and `replace` and the lifetime checks cannot see them. Only the composition root, per-request edge code and tests call `resolve`.
- Tests reuse the production registrations and `replace` the outside world, in a fresh container per test or with `snapshot`/`restoreSnapshot`. Resolve after replacing; earlier references keep the old objects.
- Production: verify every registration at startup, create the container with `freezeRegistrations: true` and `autoRegisterClasses: false`, `await` async resources before `registerValue`, and give each request its own scope, disposed in `finally`.

The Task API's services are wired and checked, but nothing reaches them over the network yet. Next, [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http) gives them HTTP routes.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
