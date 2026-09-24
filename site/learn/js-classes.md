---
title: "this, prototypes and classes"
description: "Understand what this means inside a method and why it gets lost, how objects share methods through prototypes, and how to write classes with private fields, getters, static methods and inheritance."
source: https://zudojs.oyinlola.site/learn/js-classes
---

LESSON 15 OF 84

JavaScript fundamentals Foundation

# this, prototypes and classes

Understand what this means inside a method and why it gets lost, how objects share methods through prototypes, and how to write classes with private fields, getters, static methods and inheritance.

- **45 min** to read and try
- **You need:** Scope and how code runs, and the lessons before it
- **You build:** A Task class and a TaskList class, first with inheritance and then with composition

  [Test yourself](#test)

## What this means

You met `this` briefly in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data): inside a method, it means "the object the method was called on". The important words are *called on*. `this` is not fixed when you write the function. It is decided each time the function is *called*, by what stands before the dot:

this.js

```ts
function describe() {
  return `${this.title} (${this.done ? "done" : "open"})`;
}

const milk = { title: "Buy milk", done: false, describe };
const ada = { title: "Call Ada", done: true, describe };

console.log(milk.describe());
console.log(ada.describe());
console.log(milk.describe === ada.describe);
```

Output of `node this.js` and of the browser terminal

```ts
Buy milk (open)
Call Ada (done)
true
```

Both objects share *one* `describe` function. When you call `milk.describe()`, `this` is `milk`. When you call `ada.describe()`, `this` is `ada`. This is what lets many objects share one set of methods, which is the whole idea behind prototypes and classes below.

## Losing this, and two fixes

Because `this` comes from the dot at call time, it disappears as soon as you take a method off its object and call it on its own. This happens all the time when you pass a method as a **callback**, a function that some other code calls for you:

lost.js

```ts
const list = {
  name: "Home",
  label(task) {
    return `${this.name}: ${task}`;
  },
};

console.log(list.label("Buy milk"));

const label = list.label;
try {
  label("Fix sink");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

try {
  ["Fix sink"].map(list.label);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node lost.js` and of the browser terminal

```ts
Home: Buy milk
TypeError: Cannot read properties of undefined (reading 'name')
TypeError: Cannot read properties of undefined (reading 'name')
```

The second and third calls have no dot, so there is no object: `this` is `undefined`, and reading `this.name` crashes. `map(list.label)` passes the function only, not the object it came from.

There are two standard fixes:

- **Wrap it in an arrow function**: `(task) => list.label(task)`. The call inside has a dot again.
- **Bind it**: `list.label.bind(list)` returns a new function whose `this` is fixed to `list` forever.

fixed.js

```ts
const list = {
  name: "Home",
  tasks: ["Buy milk", "Fix sink"],
  label(task) {
    return `${this.name}: ${task}`;
  },
  labelAll() {
    return this.tasks.map((task) => this.label(task));
  },
};

console.log(list.tasks.map((task) => list.label(task)));
console.log(list.tasks.map(list.label.bind(list)));
console.log(list.labelAll());
```

Output of `node fixed.js` and of the browser terminal

```json
[ 'Home: Buy milk', 'Home: Fix sink' ]
[ 'Home: Buy milk', 'Home: Fix sink' ]
[ 'Home: Buy milk', 'Home: Fix sink' ]
```

Look at `labelAll`. The arrow function inside it uses `this`, and it works. Arrow functions do not have their own `this`: they use the `this` of the code around them, here `labelAll`'s, which is `list`. That makes arrows perfect for callbacks *inside* methods.

> Do not write methods as arrow functions
>
> For the same reason, `label: () => this.name` does not work as a method: the arrow takes `this` from the surrounding module, where it is `undefined`. Use the short method form `label() { }` for methods, and arrows for callbacks.

## Constructor functions and prototypes

A backend creates many objects of the same shape: thousands of tasks, each with a title, a `done` flag and the same methods. Before classes existed, JavaScript did this with a **constructor function** called with `new`. You will still see this in older code, and it shows how classes work underneath:

constructor.js

```ts
function Task(title) {
  this.title = title;
  this.done = false;
}

Task.prototype.complete = function () {
  this.done = true;
  return this;
};

const milk = new Task("Buy milk");
const ada = new Task("Call Ada");
milk.complete();

console.log(milk, ada);
console.log(Object.keys(milk));
console.log(milk.complete === ada.complete);
console.log(Object.getPrototypeOf(milk) === Task.prototype);
```

Output of `node constructor.js` and of the browser terminal

```ts
Task { title: 'Buy milk', done: true } Task { title: 'Call Ada', done: false }
[ 'title', 'done' ]
true
true
```

`new Task("Buy milk")` does four things:

1. Creates a new empty object.
2. Links that object to `Task.prototype`. That object is the new task's **prototype**.
3. Calls `Task` with `this` set to the new object, so `this.title = title` fills it in.
4. Returns the object.

The `complete` method is not copied into each task: `Object.keys` shows only `title` and `done`. It lives once, on `Task.prototype`, and every task shares it.

### The prototype chain

When you read a property, JavaScript first looks at the object itself. If the property is not there, it looks at the object's prototype, then at *that* object's prototype, and so on until it reaches `null`. This path is the **prototype chain**:

chain.js

```ts
function Task(title) {
  this.title = title;
}
Task.prototype.complete = function () {
  this.done = true;
};

const milk = new Task("Buy milk");

const chain = [];
let current = Object.getPrototypeOf(milk);
while (current !== null) {
  chain.push(`${current.constructor.name}.prototype`);
  current = Object.getPrototypeOf(current);
}
console.log(["milk", ...chain].join(" -> "), "-> null");

console.log(Object.hasOwn(milk, "title"), Object.hasOwn(milk, "complete"));
console.log("complete" in milk, typeof milk.toString);
console.log(Object.getPrototypeOf([]) === Array.prototype);
```

Output of `node chain.js` and of the browser terminal

```ts
milk -> Task.prototype -> Object.prototype -> null
true false
true function
true
```

- `title` is the task's **own** property. `complete` is **inherited** from `Task.prototype`: `Object.hasOwn` says no, but `in`, which follows the chain, says yes.
- `toString` comes from the end of the chain, `Object.prototype`, which every ordinary object shares.
- Arrays work the same way. `map`, `filter` and `push` live on `Array.prototype`.

## Classes

A **class** is the modern syntax for the same thing. The `constructor` is the function that fills in a new object, and methods written inside the class go on the prototype automatically:

class.js

```ts
class Task {
  constructor(title) {
    this.title = title;
    this.done = false;
  }

  complete() {
    this.done = true;
    return this;
  }

  describe() {
    return `${this.done ? "[x]" : "[ ]"} ${this.title}`;
  }
}

const milk = new Task("Buy milk").complete();
console.log(milk);
console.log(milk.describe());
console.log(typeof Task, Object.getPrototypeOf(milk) === Task.prototype);
console.log(milk instanceof Task);
```

Output of `node class.js` and of the browser terminal

```ts
Task { title: 'Buy milk', done: true }
[x] Buy milk
function true
true
```

Under the hood, `Task` is still a function with a prototype, exactly like the constructor function before. Because `complete` returns `this`, you can call another method straight after it. `instanceof` asks "is `Task.prototype` somewhere on this object's prototype chain?".

Classes also add rules that catch mistakes: calling `Task("x")` without `new` throws a `TypeError`, and code inside a class always runs in strict mode.

## Private fields, getters, setters and static methods

Classes have four more tools that you will use constantly:

- A **private field**, written with `#`, such as `#id`. Only code inside the class can read or write it. Writing `task.#id` outside the class is a `SyntaxError`: the program does not even start.
- A **getter**, `get id() { }`, runs a function when someone reads `task.id`. Without a matching setter, the property is read-only.
- A **setter**, `set title(value) { }`, runs a function when someone assigns `task.title = value`. It is the place to check the new value.
- A **static** member belongs to the class itself, not to each object. You call it on the class: `Task.fromJSON(text)`. It is often used for other ways of creating objects.

members.js

```ts
class Task {
  static #nextId = 1;
  #id;
  #title = "";

  constructor(title) {
    this.#id = Task.#nextId;
    Task.#nextId += 1;
    this.title = title;
    this.done = false;
  }

  get id() {
    return this.#id;
  }

  get title() {
    return this.#title;
  }

  set title(value) {
    const clean = String(value).trim();
    if (clean === "") throw new Error("title must not be empty");
    this.#title = clean;
  }

  static fromJSON(text) {
    const data = JSON.parse(text);
    const task = new Task(data.title);
    task.done = data.done === true;
    return task;
  }
}

const milk = new Task("  Buy milk ");
const report = Task.fromJSON('{"title":"Write report","done":true}');

console.log(milk.id, milk.title, report.id, report.done);
console.log(Object.keys(milk));

try {
  milk.title = "   ";
} catch (error) {
  console.log(`Rejected: ${error.message}`);
}
console.log(milk.title);
```

Output of `node members.js` and of the browser terminal

```ts
1 Buy milk 2 true
[ 'done' ]
Rejected: title must not be empty
Buy milk
```

- The constructor assigned `this.title = title`, which went through the setter, so the spaces were trimmed.
- `Object.keys` shows only `done`. The private fields are hidden, and the getters live on the prototype.
- The setter refused an empty title, and the old title stayed. No code outside the class can put the task into a bad state.
- `#nextId` is static and private: one counter for the whole class, and nobody outside can reset it.

## Inheritance with extends and super

Sometimes one kind of object is a special case of another. A recurring task *is a* task, with one extra piece of data: how often it repeats. `extends` creates a class that inherits everything from another one. `super` reaches the parent class:

- `super(title)` in the constructor runs the parent's constructor. You must call it before you use `this`.
- `super.describe()` in a method calls the parent's version of `describe`, so you can add to it instead of rewriting it.

extends.js

```ts
class Task {
  constructor(title) {
    this.title = title;
    this.done = false;
  }
  describe() {
    return `${this.done ? "[x]" : "[ ]"} ${this.title}`;
  }
}

class RecurringTask extends Task {
  constructor(title, everyDays) {
    super(title);
    this.everyDays = everyDays;
  }
  describe() {
    return `${super.describe()} (every ${this.everyDays} days)`;
  }
}

const bins = new RecurringTask("Take out bins", 7);
console.log(bins);
console.log(bins.describe());
console.log(bins instanceof RecurringTask, bins instanceof Task);

class Broken extends Task {
  constructor(title) {
    this.extra = true;
    super(title);
  }
}

try {
  new Broken("x");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node extends.js` and of the browser terminal

```ts
RecurringTask { title: 'Take out bins', done: false, everyDays: 7 }
[ ] Take out bins (every 7 days)
true true
ReferenceError: Must call super constructor in derived class before accessing 'this' or returning from derived constructor
```

The recurring task got `title` and `done` from `Task`'s constructor, plus its own `everyDays`. Its `describe` **overrides** the parent's, and reuses it through `super`. It is an instance of both classes, because `Task.prototype` is on its prototype chain. `Broken` shows the rule: `this` does not exist until `super()` has run.

## A TaskList class

Now a class that manages many tasks. The list itself is private, and the class uses a private method, `#find`, that outside code cannot call. Watch what happens when a method is passed as a callback, the same problem as at the start of the lesson:

task-list.js

```ts
class Task {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.done = false;
  }
}

class TaskList {
  #tasks = [];

  add(title) {
    const task = new Task(this.#tasks.length + 1, title);
    this.#tasks.push(task);
    return task;
  }

  complete(id) {
    this.#find(id).done = true;
  }

  get openCount() {
    return this.#tasks.filter((task) => !task.done).length;
  }

  #find(id) {
    const task = this.#tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  }
}

const list = new TaskList();
["Buy milk", "Call Ada", "Fix sink"].forEach((title) => list.add(title));
list.complete(2);
console.log(list.openCount);

try {
  ["Plan week"].forEach(list.add);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

try {
  list.complete(9);
} catch (error) {
  console.log(error.message);
}
```

Output of `node task-list.js` and of the browser terminal

```ts
2
TypeError: Cannot read properties of undefined (reading '#tasks')
Task 9 not found
```

`forEach((title) => list.add(title))` works. `forEach(list.add)` loses `this`, exactly like before. Class code is always strict, so here the mistake crashes in the browser terminal too.

## Composition over inheritance

Inheritance is tempting whenever you want "a TaskList, but with something extra". Suppose you need a list that logs every change, and another that records an audit trail. With inheritance you write `LoggingTaskList extends TaskList` and `AuditedTaskList extends TaskList`. Then someone needs both, and you write a third class, `LoggingAuditedTaskList`. Every new feature doubles the number of classes.

**Composition** solves this differently: instead of *being* a special list, the list *has* helpers that you pass in. Here the helpers are plain functions, called listeners, that the list calls after each change:

composition.js

```ts
class TaskList {
  #tasks = [];
  #listeners;

  constructor({ listeners = [] } = {}) {
    this.#listeners = listeners;
  }

  add(title) {
    const task = { id: this.#tasks.length + 1, title, done: false };
    this.#tasks.push(task);
    this.#emit("added", task);
    return task;
  }

  complete(id) {
    const task = this.#tasks.find((t) => t.id === id);
    task.done = true;
    this.#emit("completed", task);
  }

  #emit(event, task) {
    for (const listener of this.#listeners) listener(event, task);
  }
}

const log = (event, task) => console.log(`[log] ${event}: ${task.title}`);
const auditTrail = [];
const audit = (event, task) => auditTrail.push(`${event} #${task.id}`);

const plain = new TaskList();
plain.add("Nobody hears about this one");

const watched = new TaskList({ listeners: [log, audit] });
watched.add("Buy milk");
watched.complete(1);
console.log(auditTrail);
```

Output of `node composition.js` and of the browser terminal

```json
[log] added: Buy milk
[log] completed: Buy milk
[ 'added #1', 'completed #1' ]
```

One `TaskList` class covers every combination: no listeners, logging only, audit only, or both. Adding a new feature, such as sending an e-mail, means writing one more small function, not another class.

A simple rule of thumb:

- Use **inheritance** for a true "is a" relationship that will not change, like `RecurringTask` and `Task`, or your own error classes in [the next lesson](https://zudojs.oyinlola.site/learn/js-errors).
- Use **composition** for "has a" or "uses a": a list that uses a logger, a service that uses a database. When in doubt, choose composition.

Passing helpers in through the constructor is called **dependency injection**. ZudoJS is built on it: `@zudojs/container` creates your classes and hands each one the helpers it needs, as you will see in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container).

## Practice

TRY IT YOURSELF

### Add a priority with validation

Write a `Task` class with a `title` and a `priority`. Make `priority` a getter and setter backed by a private field `#priority`. The setter must accept only whole numbers from 1 to 5, and throw an error otherwise. The default priority is 3.

**Show a solution**

priority.js

```ts
class Task {
  #priority = 3;

  constructor(title) {
    this.title = title;
  }

  get priority() {
    return this.#priority;
  }

  set priority(value) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`priority must be 1 to 5, got ${value}`);
    }
    this.#priority = value;
  }
}

const task = new Task("Buy milk");
console.log(task.priority);
task.priority = 1;
console.log(task.priority);

try {
  task.priority = 9;
} catch (error) {
  console.log(error.message);
}
console.log(task.priority);
```

Output of `node priority.js` and of the browser terminal

```ts
3
1
priority must be 1 to 5, got 9
1
```

TRY IT YOURSELF

### A deadline task

Write `DeadlineTask extends Task` that takes a title and a due date string such as `"2026-10-01"`. Override `describe()` so it adds `due 2026-10-01` after the parent's text. Use `super` in both the constructor and `describe`.

**Show a solution**

deadline.js

```ts
class Task {
  constructor(title) {
    this.title = title;
    this.done = false;
  }
  describe() {
    return `${this.done ? "[x]" : "[ ]"} ${this.title}`;
  }
}

class DeadlineTask extends Task {
  constructor(title, due) {
    super(title);
    this.due = due;
  }
  describe() {
    return `${super.describe()}, due ${this.due}`;
  }
}

console.log(new DeadlineTask("File taxes", "2026-10-01").describe());
```

Output of `node deadline.js` and of the browser terminal

```json
[ ] File taxes, due 2026-10-01
```

TRY IT YOURSELF

### Bind a handler

A counter object has a method `increment()` that adds 1 to `this.count`. Call it three times through `[1, 2, 3].forEach(...)` so that `count` ends at 3. Show both fixes: an arrow function and `bind`.

**Show a solution**

bind.js

```ts
const counter = {
  count: 0,
  increment() {
    this.count += 1;
  },
};

[1, 2, 3].forEach(() => counter.increment());
console.log(counter.count);

counter.count = 0;
const increment = counter.increment.bind(counter);
[1, 2, 3].forEach(() => increment());
console.log(counter.count);
```

Output of `node bind.js` and of the browser terminal

```ts
3
3
```

In the second fix, `() => increment()` is still used because `forEach` passes arguments (the item, its index and the array) to its callback. `increment` ignores them, so `forEach(increment)` would also work.

## Recap

- `this` is decided at call time: it is the object before the dot. Without a dot, it is `undefined` in modules and classes.
- Passing a method as a callback loses `this`. Fix it with an arrow `(x) => obj.method(x)` or with `obj.method.bind(obj)`. Arrows have no `this` of their own, so they are great callbacks and bad methods.
- `new` creates an object linked to a prototype. Methods live once on the prototype and are shared through the prototype chain.
- A class is cleaner syntax for the same thing: `constructor`, methods, `#private` fields and methods, `get`/`set`, and `static`.
- `extends` and `super` build a class on top of another. Call `super()` before using `this`.
- Prefer composition, passing helpers in, over deep inheritance trees. That is dependency injection, which ZudoJS is built on.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
