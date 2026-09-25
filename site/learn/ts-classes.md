---
title: "Classes in TypeScript — ZudoJS Academy"
description: "Type class properties, use access modifiers and #private, write abstract classes and classes that implement interfaces, and inject dependencies."
source: https://zudojs.oyinlola.site/learn/ts-classes
---

LEVEL 5 · LESSON 17 OF 23

Classes, modules and configuration Foundation

# Classes in TypeScript

Type class properties, use access modifiers and #private, write abstract classes and classes that implement interfaces, and inject dependencies.

- **40 min** to read and try
- **You need:** Generics, Advanced and utility types, and this, prototypes and classes
- **You build:** A TaskService that depends on interfaces, wired by hand in main.ts and tested with a fake repository and a fixed clock

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Declare class properties with types and satisfy strictPropertyInitialization
- Use parameter properties, and know why Node's type stripping refuses them
- Choose between private and #private, knowing which one survives JSON.stringify
- Write abstract classes and classes that implement interfaces
- Inject dependencies through the constructor and swap in fakes for tests

## Properties and constructors

You learned classes in [the JavaScript classes lesson](https://zudojs.oyinlola.site/learn/js-classes). In JavaScript, a constructor can create any property just by assigning `this.title = …`. TypeScript wants to know every property up front, with its type, so it can check every use. You **declare** them at the top of the class:

task.ts

```ts
export class Task {
  done = false;
  tags: string[] = [];
  id: number;
  title: string;

  constructor(id: number, title: string) {
    this.id = id;
    this.title = title;
  }

  complete(): this {
    this.done = true;
    return this;
  }

  describe(): string {
    return `${this.done ? "[x]" : "[ ]"} #${this.id} ${this.title}`;
  }
}

const milk = new Task(1, "Buy milk").complete();
console.log(milk.describe());
console.log(milk);
```

Output of `npx tsx task.ts` and of the browser terminal

```json
[x] #1 Buy milk
Task { done: true, tags: [], id: 1, title: 'Buy milk' }
```

`done = false` declares the property and gives it a starting value, so TypeScript infers `boolean`. `complete()` returns `this`, the object itself, so calls can be chained. Now the two mistakes this catches:

task.ts

```ts
export class Task {
  id: number;
  done: boolean;

  constructor(id: number, title: string) {
    this.id = id;
    this.title = title;
  }
}
```

What `npx tsc --noEmit` prints

```ts
task.ts:3:3 - error TS2564: Property 'done' has no initializer and is not definitely assigned in the constructor.

3   done: boolean;
    ~~~~

task.ts:7:10 - error TS2339: Property 'title' does not exist on type 'Task'.

7     this.title = title;
           ~~~~~


Found 2 errors in the same file, starting at: task.ts:3
```

- **TS2564**: `done` is declared as a `boolean`, but nothing ever sets it, so it would be `undefined`. `strict` checks that every property gets a value.
- **TS2339**: `title` was never declared. In JavaScript this line silently adds a property; in TypeScript a typo like `this.titel = …` would be caught the same way.

## Parameter properties

Declaring a property, taking a parameter, and copying one into the other is so common that TypeScript has a shortcut. Put `public`, `private`, `protected` or `readonly` in front of a constructor parameter, and it becomes a property automatically. These are called **parameter properties**:

short.ts

```ts
class Task {
  constructor(
    public readonly id: number,
    public title: string,
    public done = false,
  ) {}
}

const task = new Task(1, "Buy milk");
task.title = "Buy oat milk";
console.log(task);
```

Output of `npx tsx short.ts` and of the browser terminal

```ts
Task { id: 1, title: 'Buy oat milk', done: false }
```

Three properties, declared and filled in far fewer lines. `public done = false` also shows that a parameter property can have a default value. `readonly` means the id is set once in the constructor and can never change; `task.id = 2` would be error TS2540.

> NOT ERASABLE
>
> Parameter properties generate code (the `this.id = id` lines), so Node's built-in type stripping, from [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup#run), refuses them, and `erasableSyntaxOnly` reports them ([What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#not-erased)). `tsx`, `tsc` and the browser terminal all handle them. ZudoJS itself uses them, so this course runs code with `tsx`.

## public, private, protected and #private

TypeScript has three **access modifiers** that say who may use a property or method:

- `public` (the default): anyone.
- `private`: only code inside this class.
- `protected`: code inside this class and classes that `extends` it.

access.ts

```ts
class Account {
  protected balance = 0;
  private readonly history: number[] = [];

  deposit(amount: number): void {
    this.balance += amount;
    this.history.push(amount);
  }
}

class SavingsAccount extends Account {
  addInterest(rate: number): void {
    this.balance += this.balance * rate;
    this.history.push(-1);
  }
}

const account = new SavingsAccount();
account.deposit(100);
console.log(account.balance);
```

What `npx tsc --noEmit` prints

```ts
access.ts:14:10 - error TS2341: Property 'history' is private and only accessible within class 'Account'.

14     this.history.push(-1);
            ~~~~~~~

access.ts:20:21 - error TS2445: Property 'balance' is protected and only accessible within class 'Account' and its subclasses.

20 console.log(account.balance);
                       ~~~~~~~


Found 2 errors in the same file, starting at: access.ts:14
```

The subclass may use `balance` (protected) but not `history` (private), and outside code may use neither.

### private is a compile-time check; #private is real

You met JavaScript's own private fields, written `#name`, in the classes lesson. They look similar to `private`, but there is an important difference. TypeScript's `private` is a type, and like all types it is **erased**. When the program runs, the property is an ordinary, public property. A `#` field is enforced by JavaScript itself:

secret.ts

```ts
class UserA {
  constructor(
    public email: string,
    private passwordHash: string,
  ) {}
}

class UserB {
  #passwordHash: string;

  constructor(public email: string, passwordHash: string) {
    this.#passwordHash = passwordHash;
  }

  hasHash(): boolean {
    return this.#passwordHash.length > 0;
  }
}

const a = new UserA("ada@example.com", "$argon2id$v=19$...");
const b = new UserB("ada@example.com", "$argon2id$v=19$...");

console.log(JSON.stringify(a));
console.log(JSON.stringify(b));
console.log(Object.keys(a), Object.keys(b));
console.log(a["passwordHash"]);
```

Output of `npx tsx secret.ts` and of the browser terminal

```json
{"email":"ada@example.com","passwordHash":"$argon2id$v=19$..."}
{"email":"ada@example.com"}
[ 'email', 'passwordHash' ] [ 'email' ]
$argon2id$v=19$...
```

This file compiles without errors, and look at the first line: the `private` password hash went straight into the JSON. If this object were an API response, every client would receive the hash. TypeScript even allows `a["passwordHash"]` with square brackets, as a deliberate escape hatch.

The `#passwordHash` in `UserB` is not in the JSON, not in `Object.keys`, and cannot be read from outside at all. The rule:

- Use `private` to organise your own code: "this is an internal detail, do not call it".
- Use `#private` for anything that must really stay hidden, such as secrets. And better still, never put secrets in objects you might send; build the response with only the fields you choose, as in [the public user exercise](https://zudojs.oyinlola.site/learn/ts-advanced#practice).

## Abstract classes

An **abstract class** is a class that is only a starting point. You cannot create one with `new`. It can contain finished methods, and **abstract methods**: a name and a type, with no body, that every subclass must write.

notifier.ts

```ts
abstract class Notifier {
  constructor(protected readonly appName: string) {}

  protected abstract send(to: string, text: string): Promise<void>;

  async taskDue(to: string, title: string): Promise<void> {
    await this.send(to, `[${this.appName}] "${title}" is due today`);
  }
}

class ConsoleNotifier extends Notifier {
  protected async send(to: string, text: string): Promise<void> {
    console.log(`to ${to}: ${text}`);
  }
}

const notifier = new ConsoleNotifier("Tasks");
await notifier.taskDue("ada@example.com", "File taxes");
```

Output of `npx tsx notifier.ts` and of the browser terminal

```ts
to ada@example.com: [Tasks] "File taxes" is due today
```

`Notifier` decides *what* the message says; each subclass decides *how* it is delivered: console, e-mail, SMS. The compiler holds both sides to the deal:

notifier.ts

```ts
abstract class Notifier {
  protected abstract send(to: string, text: string): Promise<void>;
}

class EmailNotifier extends Notifier {}

const notifier = new Notifier();
```

What `npx tsc --noEmit` prints

```ts
notifier.ts:5:7 - error TS2515: Non-abstract class 'EmailNotifier' does not implement inherited abstract member send from class 'Notifier'.

5 class EmailNotifier extends Notifier {}
        ~~~~~~~~~~~~~

notifier.ts:7:18 - error TS2511: Cannot create an instance of an abstract class.

7 const notifier = new Notifier();
                   ~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: notifier.ts:5
```

## Implementing interfaces

An abstract class shares code. Often you only need to share a **contract**: "anything that stores tasks must have these methods". That is an interface, and a class promises to follow it with `implements`. Here is the start of a small multi-file project. First the contracts:

contracts.ts

```ts
export interface Task {
  readonly id: number;
  title: string;
  dueDate: Date;
  done: boolean;
}

export interface TaskRepository {
  save(task: Task): Promise<void>;
  findAll(): Promise<Task[]>;
}

export interface Clock {
  now(): Date;
}
```

Then a class that implements the repository contract, keeping tasks in memory:

memory-repository.ts

```ts
import type { Task, TaskRepository } from "./contracts.js";

export class MemoryTaskRepository implements TaskRepository {
  readonly #tasks = new Map<number, Task>();

  async save(task: Task): Promise<void> {
    this.#tasks.set(task.id, { ...task });
  }

  async findAll(): Promise<Task[]> {
    return [...this.#tasks.values()].map((task) => ({ ...task }));
  }
}
```

`implements TaskRepository` makes the compiler check the class against the interface. Forget a method, or get a type wrong, and the class itself is reported:

broken-repository.ts

```ts
import type { Task, TaskRepository } from "./contracts.js";

export class BrokenRepository implements TaskRepository {
  async save(task: Task): Promise<void> {}
}
```

What `npx tsc --noEmit` prints

```ts
broken-repository.ts:3:14 - error TS2420: Class 'BrokenRepository' incorrectly implements interface 'TaskRepository'.
  Property 'findAll' is missing in type 'BrokenRepository' but required in type 'TaskRepository'.

3 export class BrokenRepository implements TaskRepository {
               ~~~~~~~~~~~~~~~~

  contracts.ts:10:3 - 'findAll' is declared here.
    10   findAll(): Promise<Task[]>;
         ~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in broken-repository.ts:3
```

A class can implement several interfaces (`implements A, B`), and `implements` adds no code at all: it is only a check.

## Dependency injection by hand

Now the service with the business rules. It needs somewhere to store tasks and a way to know the current time. It could create them itself: `new MemoryTaskRepository()` and `new Date()`. But then it is stuck with them forever: no database later, and no way to test "is this task overdue?" without waiting for a real day to pass.

REASON IT OUT

### What should the service create itself?

`TaskService` adds tasks with a due date and lists the overdue ones. It needs somewhere to store tasks and a way to know the current time. Before reading on, decide:

1. If the service calls `new MemoryTaskRepository()` itself, what has to change on the day you move to PostgreSQL?
2. If it calls `new Date()` itself, how would a test check that a task becomes overdue three days later?
3. What is the smallest thing the service needs from each dependency: a class, or just a few methods?
4. Where in the program should the real repository and clock be created?

**Show the reasoning**

1. The service itself, and every test of it. A class that creates its own dependencies is welded to them.
2. It could not without really waiting three days, or tricking the system clock. The current time is a dependency like any other.
3. Just the methods it calls: `save` and `findAll` from storage, `now()` from the clock. Those become two small interfaces, so any object with those methods fits.
4. In one place at the start of the program (the entry file), which passes them into the service. Tests pass fakes instead, and the service cannot tell the difference.

Instead, the service **asks for** what it needs, in its constructor, typed as the interfaces. Whoever creates the service **passes them in**. This is called **dependency injection**, and passing them to the constructor is **constructor injection**:

task-service.ts

```ts
import type { Clock, Task, TaskRepository } from "./contracts.js";

export class TaskService {
  #nextId = 1;

  constructor(
    private readonly tasks: TaskRepository,
    private readonly clock: Clock,
  ) {}

  async add(title: string, daysUntilDue: number): Promise<Task> {
    const dueDate = new Date(this.clock.now().getTime() + daysUntilDue * 86_400_000);
    const task: Task = { id: this.#nextId++, title, dueDate, done: false };
    await this.tasks.save(task);
    return task;
  }

  async overdue(): Promise<string[]> {
    const now = this.clock.now();
    const all = await this.tasks.findAll();
    return all.filter((task) => !task.done && task.dueDate < now).map((task) => task.title);
  }
}
```

`TaskService` never mentions `MemoryTaskRepository` or `Date.now()`. It depends only on the two interfaces. The real objects are created in one place, the program's entry file, often called the **composition root**:

main.ts

```ts
import type { Clock } from "./contracts.js";
import { MemoryTaskRepository } from "./memory-repository.js";
import { TaskService } from "./task-service.js";

const systemClock: Clock = { now: () => new Date() };
const service = new TaskService(new MemoryTaskRepository(), systemClock);

await service.add("File taxes", 3);
await service.add("Call Ada", -1);
console.log(await service.overdue());
```

Output of `npx tsx main.ts` and of the browser terminal

```json
[ 'Call Ada' ]
```

A task due yesterday (`-1` days) is overdue; one due in three days is not. `systemClock` is a plain object, not a class: anything with a `now()` method that returns a `Date` fits the `Clock` interface.

## Swapping in fakes for tests

Here is the payoff. To test `overdue()`, you want time to stand still, and you want to see exactly what the service saved. So you write two **fakes**: simple stand-ins that implement the same interfaces.

fakes.ts

```ts
import type { Clock, Task, TaskRepository } from "./contracts.js";

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export class RecordingRepository implements TaskRepository {
  readonly saved: Task[] = [];

  async save(task: Task): Promise<void> {
    this.saved.push(task);
  }

  async findAll(): Promise<Task[]> {
    return this.saved;
  }
}
```

overdue-check.ts

```ts
import { FixedClock, RecordingRepository } from "./fakes.js";
import { TaskService } from "./task-service.js";

const clock = new FixedClock(new Date("2026-03-01T09:00:00Z"));
const repo = new RecordingRepository();
const service = new TaskService(repo, clock);

await service.add("File taxes", 2);
console.log("saved:", repo.saved.map((task) => task.dueDate.toISOString()));
console.log("day 0:", await service.overdue());
clock.advanceDays(3);
console.log("day 3:", await service.overdue());
```

Output of `npx tsx overdue-check.ts` and of the browser terminal

```ts
saved: [ '2026-03-03T09:00:00.000Z' ]
day 0: []
day 3: [ 'File taxes' ]
```

Three days pass in a microsecond, and every run prints the same thing. `TaskService` did not change at all: it cannot tell a fake from the real thing, because it only knows the interfaces. With Vitest, the test runner that [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics) sets up in the backend course, the same idea becomes a test file:

task-service.test.ts

```ts
import { describe, expect, it } from "vitest";

import { FixedClock, RecordingRepository } from "./fakes.js";
import { TaskService } from "./task-service.js";

describe("TaskService.overdue", () => {
  it("reports a task only after its due date", async () => {
    const clock = new FixedClock(new Date("2026-03-01T09:00:00Z"));
    const service = new TaskService(new RecordingRepository(), clock);
    await service.add("File taxes", 2);

    expect(await service.overdue()).toEqual([]);
    clock.advanceDays(3);
    expect(await service.overdue()).toEqual(["File taxes"]);
  });
});
```

Terminal on your computer

```bash
$ npm install -D vitest
…
$ npx vitest run --reporter=verbose
 RUN  v5.0.1 ~/ts-tasks

 ✓ task-service.test.ts > TaskService.overdue > reports a task only after its due date 4ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  14:46:55
   Duration  326ms (transform 74%, import 16%, tests 5%, worker 5%)
```

Doing this wiring by hand is fine for three classes. A real backend has dozens of services, each needing several others, and creating them all in the right order in `main.ts` gets long. A **dependency injection container** does that wiring for you. ZudoJS has one, `@zudojs/container`, and you will meet it in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container). It works with exactly the kind of classes you just wrote.

## Practice

TRY IT YOURSELF

### A counter with real privacy

Write a class `RateCounter` that counts login attempts per e-mail address. It has `hit(email: string): number` (adds one and returns the new count) and `reset(email: string): void`. The counts must not show up in `JSON.stringify` or be changeable from outside.

**Show a solution**

rate-counter.ts

```ts
class RateCounter {
  readonly #counts = new Map<string, number>();

  hit(email: string): number {
    const next = (this.#counts.get(email) ?? 0) + 1;
    this.#counts.set(email, next);
    return next;
  }

  reset(email: string): void {
    this.#counts.delete(email);
  }
}

const counter = new RateCounter();
counter.hit("ada@example.com");
console.log(counter.hit("ada@example.com"), JSON.stringify(counter));
counter.reset("ada@example.com");
console.log(counter.hit("ada@example.com"));
```

Output of `npx tsx rate-counter.ts` and of the browser terminal

```ts
2 {}
1
```

TRY IT YOURSELF

### Inject the notifier

Write a `ReminderService` with a method `remindOverdue()` that sends one message per overdue task and returns how many it sent. It takes two dependencies through its constructor: a function that returns the overdue titles (in the app, `() => service.overdue()`), and a `Notifier` interface with `send(text: string): Promise<void>`. Test it with a fake notifier that stores the messages in an array.

**Show a solution**

remind.ts

```ts
interface Notifier {
  send(text: string): Promise<void>;
}

class ReminderService {
  constructor(
    private readonly overdueTitles: () => Promise<string[]>,
    private readonly notifier: Notifier,
  ) {}

  async remindOverdue(): Promise<number> {
    const titles = await this.overdueTitles();
    for (const title of titles) await this.notifier.send(`"${title}" is overdue`);
    return titles.length;
  }
}

class FakeNotifier implements Notifier {
  readonly sent: string[] = [];
  async send(text: string): Promise<void> {
    this.sent.push(text);
  }
}

const fake = new FakeNotifier();
const reminders = new ReminderService(async () => ["File taxes", "Call Ada"], fake);
console.log(await reminders.remindOverdue(), fake.sent);
```

Output of `npx tsx remind.ts` and of the browser terminal

```ts
2 [ '"File taxes" is overdue', '"Call Ada" is overdue' ]
```

The reminder service does not depend on the whole `TaskService`, only on a function that returns overdue titles. Depending on the smallest thing you need makes testing even easier: the test passes an inline `async` function instead of building a service. A dependency can be a function type, not just an interface.

## Recap

- Declare every class property with its type; `strict` checks each one gets a value.
- Parameter properties (`constructor(private readonly repo: Repo)`) declare and assign in one step.
- `public`, `protected` and `private` are compile-time only. `#private` is enforced at runtime and stays out of `JSON.stringify`.
- An abstract class shares code and forces subclasses to fill in abstract methods. `implements` checks a class against an interface.
- Constructor injection: depend on interfaces, create the real objects in one place, and swap in fakes for tests.

Next: [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules), where a project is split into files that import types and values from each other.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
