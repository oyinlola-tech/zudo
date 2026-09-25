---
title: "Modern JavaScript — ZudoJS Academy"
description: "Take a piece of old-style JavaScript and rewrite it step by step with the modern syntax a backend uses every day, fixing real bugs on the way."
source: https://zudojs.oyinlola.site/learn/js-modern
---

LEVEL 2 · LESSON 12 OF 19

Arrays and objects Foundation

# Modern JavaScript

Take a piece of old-style JavaScript and rewrite it step by step with the modern syntax a backend uses every day, fixing real bugs on the way.

- **35 min** to read and try
- **You need:** Objects in depth, and the lessons before it
- **You build:** A task formatter refactored from old-style code to modern JavaScript, with its hidden bugs fixed

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read old-style JavaScript and rewrite it with modern syntax without changing its behaviour
- Replace
- defaults with ?? and default parameters, and explain why null skips a default
- Destructure objects, arrays and parameters with renaming, defaults and nesting
- Tell spread from rest by where the three dots stand
- Refactor safely by running the old and new versions on the same inputs

## The code you will modernise

JavaScript has changed a lot since 2015. You will still meet old-style code: in older projects, in answers online, and in code written by people who learned JavaScript long ago. You need to read both styles, and write the modern one.

This lesson does not introduce a new topic. It takes one piece of old-style code and improves it, one tool at a time. Here is the starting point: a function that turns a task into a line of text for a report.

REASON IT OUT

### Before you refactor: where can the behaviour change?

A refactor should change how code is written, not what it does, except for the bugs you meant to fix. Read `formatTask` below before you run it, and think:

- Each `x || fallback` replaces *every* falsy value. For `priority` and `prefix`, which falsy values could a caller send on purpose?
- If you replace `options.prefix || "-"` with a default parameter, which inputs behave differently afterwards? Think about `""`, `undefined` and `null`.
- How will you know the new version still gives the same answers for the normal cases?

**Show the reasoning**

**Falsy on purpose:** `priority: 0` (the most urgent) and `prefix: ""` (no prefix). `||` throws both away. Those are the bugs to fix.

**Defaults change the edge cases:** a default parameter or `??` keeps `""` and `0`, which is the fix. A missing value (`undefined`) still gets the default, which keeps the old behaviour. But `null` behaves differently for the two tools: a default parameter does *not* replace `null`, while `??` does. If callers may send `null` (JSON has `null` but no `undefined`), use `??`.

**Proof:** run the old and the new function side by side on the same list of inputs, including the edge cases, and compare. Any difference must be one you intended. The last section of this lesson does exactly that.

old.js

```ts
function formatTask(task, options) {
  options = options || {};
  var prefix = options.prefix || "-";
  var owner = task.owner && task.owner.name ? task.owner.name : "nobody";
  var priority = task.priority || 3;
  return prefix + " " + task.title + " (" + owner + ", priority " + priority + ")";
}

console.log(formatTask({ title: "Buy milk", owner: { name: "Ada" }, priority: 1 }));
console.log(formatTask({ title: "Write report" }, { prefix: "*" }));
console.log(formatTask({ title: "Fix login bug", priority: 0 }, { prefix: "" }));
```

Output of `node old.js` and of the browser terminal

```ts
- Buy milk (Ada, priority 1)
* Write report (nobody, priority 3)
- Fix login bug (nobody, priority 3)
```

The first two lines look right. The third one is wrong twice:

- The task has priority `0` (the most urgent), but the report says `3`.
- The caller asked for no prefix (`""`), but got `-`.

Both bugs come from `||`, which you met in [the operators lesson](https://zudojs.oyinlola.site/learn/js-operators). `a || b` gives `b` whenever `a` is *falsy*, and `0` and `""` are falsy. Keep this in mind: the modern version will fix it.

## Template literals

Gluing strings with `+` is hard to read and easy to get wrong: a missing space, a missing quote. A **template literal** uses backticks `\`` instead of quotes. Inside it, `${ }` inserts the value of any expression. It can also span several lines:

template.js

```ts
const title = "Buy milk";
const priority = 1;

console.log("Task: " + title + " (priority " + priority + ")");
console.log(`Task: ${title} (priority ${priority})`);
console.log(`Urgent: ${priority <= 1 ? "yes" : "no"}`);

const report = `Report
  ${title}
  done: ${false}`;
console.log(report);
```

Output of `node template.js` and of the browser terminal

```ts
Task: Buy milk (priority 1)
Task: Buy milk (priority 1)
Urgent: yes
Report
  Buy milk
  done: false
```

The first two lines print the same text. The template literal is easier to read because the text looks like the result. Any expression works inside `${ }`, even the ternary `? :` from [the conditions lesson](https://zudojs.oyinlola.site/learn/js-conditions).

## Optional chaining and nullish coalescing

You met both operators in [Operators](https://zudojs.oyinlola.site/learn/js-operators#nullish). They are the two tools that replace most of the `&&` and `||` tricks in old code, so here is a quick review aimed at refactoring, plus two forms you have not used yet: calling a method that may not exist, and `??=` on an object's property.

- **Optional chaining** `a?.b`: if `a` is `null` or `undefined`, stop and give `undefined` instead of crashing. Otherwise read `a.b` as usual. It also works for calls, `a.b?.()`, and brackets, `a?.[key]`.
- **Nullish coalescing** `a ?? b`: give `b` only when `a` is `null` or `undefined`. Unlike `||`, it keeps `0`, `""` and `false`.

nullish.js

```ts
const task = { title: "Fix login bug", priority: 0, owner: null };

console.log(task.owner?.name);
console.log(task.owner?.name ?? "nobody");
console.log(task.notify?.());

console.log(task.priority || 3);
console.log(task.priority ?? 3);
console.log("" || "-", "" ?? "-");

const settings = { pageSize: 0 };
settings.pageSize ??= 20;
settings.theme ??= "light";
console.log(settings);
```

Output of `node nullish.js` and of the browser terminal

```ts
undefined
nobody
undefined
3
0
-
{ pageSize: 0, theme: 'light' }
```

Line by line:

- `task.owner` is `null`, so `task.owner?.name` is `undefined` instead of a `TypeError`. Adding `?? "nobody"` gives a fallback.
- `task.notify` does not exist, so `task.notify?.()` does not call anything.
- `||` threw away the real priority `0`. `??` kept it. The same for the empty string: the second value on that line is `""`, printed as nothing.
- `a ??= b` means "set `a` to `b` only if `a` is `null` or `undefined`". `pageSize: 0` stayed, the missing `theme` was filled in.

> TIP
>
> Rule of thumb: when you want a *default for a missing value*, use `??`. Use `||` only when you really mean "any falsy value".

## Default parameters

Old code filled in missing arguments by hand: `options = options || {}`. Now a parameter can have a **default value** written right in the function's first line:

defaults.js

```ts
function paginate(items, page = 1, size = 2) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

const titles = ["Buy milk", "Write report", "Call Ada", "Fix bug", "Plan week"];

console.log(paginate(titles));
console.log(paginate(titles, 2));
console.log(paginate(titles, undefined, 3));
console.log(paginate(titles, null, 3));
```

Output of `node defaults.js` and of the browser terminal

```json
[ 'Buy milk', 'Write report' ]
[ 'Call Ada', 'Fix bug' ]
[ 'Buy milk', 'Write report', 'Call Ada' ]
[]
```

A default is used when the argument is missing or `undefined`. It is *not* used for `null`. In the last call, `page` was `null`, so `start` became `(null - 1) * 3`, which is `-3`, and the page came back empty. That matters in a backend, because JSON has `null` but no `undefined`: a client that sends `"page": null` skips your default. If a value may be `null`, use `??` on it: `paginate(items, input.page ?? 1)`.

## Destructuring in depth

In [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data) you pulled properties out of an object with `const { name } = user`. Destructuring can do much more. Here are the forms you will read and write every day:

destructure.js

```ts
const task = {
  id: 7,
  title: "Buy milk",
  owner: { name: "Ada", email: "ada@example.com" },
};

const { title: taskTitle, priority = 3 } = task;
console.log(taskTitle, priority);

const { owner: { name: ownerName } } = task;
console.log(ownerName);

const [first, , third = "none"] = ["a", "b"];
console.log(first, third);

const [key, value] = "limit=10".split("=");
console.log(key, value);

let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b);
```

Output of `node destructure.js` and of the browser terminal

```ts
Buy milk 3
Ada
a none
limit 10
2 1
```

- **Renaming**: `{ title: taskTitle }` reads `title` into a variable called `taskTitle`. Read the colon as "into".
- **Defaults**: `{ priority = 3 }` uses 3 because the task has no priority. Like default parameters, it applies to `undefined` only.
- **Nested**: `{ owner: { name: ownerName } }` goes one level deeper. It crashes if `owner` is missing, so use it only on data you trust.
- **Arrays** take items by position. An empty slot, `[first, , third]`, skips an item.
- **Swapping** two variables takes one line.

### Destructuring parameters

The most useful place for destructuring is a function's parameter list. Instead of an `options` object you read property by property, you name the options you expect and give each a default:

params.js

```ts
function createTask({ title, done = false, tags = [] } = {}) {
  return { title, done, tags };
}

console.log(createTask({ title: "Buy milk" }));
console.log(createTask({ title: "Plan week", tags: ["work"] }));
console.log(createTask());
```

Output of `node params.js` and of the browser terminal

```json
{ title: 'Buy milk', done: false, tags: [] }
{ title: 'Plan week', done: false, tags: [ 'work' ] }
{ title: undefined, done: false, tags: [] }
```

The `= {}` at the end is the default for the whole parameter. Without it, `createTask()` would crash trying to destructure `undefined`. You can see at a glance which options the function understands.

## Spread and rest: same dots, opposite jobs

The three dots `...` mean two opposite things depending on where they stand:

- **Spread** *expands* one array or object into many items. It appears where values are *used*: in an array `[...a]`, an object `{ ...o }`, or a function call `f(...args)`.
- **Rest** *collects* many items into one array or object. It appears where names are *created*: in a parameter list `function f(...args)` or a destructuring pattern `const [x, ...others] = list`.

spread-rest.js

```ts
const priorities = [3, 1, 2];
console.log(Math.max(...priorities));

const more = [...priorities, 5];
console.log(more, priorities);

function tag(title, ...tags) {
  return `${title} [${tags.join(", ")}]`;
}
console.log(tag("Buy milk", "home", "shopping"));

const [firstTask, ...laterTasks] = ["Buy milk", "Write report", "Call Ada"];
console.log(firstTask, laterTasks);

const { id, ...changes } = { id: 7, title: "Buy oat milk", done: true };
console.log(id, changes);
```

Output of `node spread-rest.js` and of the browser terminal

```ts
3
[ 3, 1, 2, 5 ] [ 3, 1, 2 ]
Buy milk [home, shopping]
Buy milk [ 'Write report', 'Call Ada' ]
7 { title: 'Buy oat milk', done: true }
```

`Math.max` wants separate numbers, not an array, so spread expands the array into three arguments. In `tag`, the rest parameter collected every argument after the first into the array `tags`. A rest element must always come last.

> NOTE
>
> Old code used a hidden variable called `arguments` to reach extra arguments. A rest parameter replaces it, and it is a real array, so `map` and `join` work on it.

## Enhanced object literals

You saw shorthand properties and computed properties in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data). Together with short methods, they are called **enhanced object literals**. Here is an old-style response builder next to its modern form:

literals.js

```ts
function oldResponse(status, field, value) {
  var body = {};
  body[field] = value;
  return {
    status: status,
    body: body,
    describe: function () {
      return this.status + " " + JSON.stringify(this.body);
    },
  };
}

function newResponse(status, field, value) {
  return {
    status,
    body: { [field]: value },
    describe() {
      return `${this.status} ${JSON.stringify(this.body)}`;
    },
  };
}

console.log(oldResponse(201, "id", 7).describe());
console.log(newResponse(201, "id", 7).describe());
```

Output of `node literals.js` and of the browser terminal

```ts
201 {"id":7}
201 {"id":7}
```

Same behaviour, half the noise. `status` is shorthand for `status: status`, `[field]` is a computed property, and `describe() { }` is a short method.

## var, let and const

Old code declares every variable with `var`. Modern code uses `const` by default and `let` when the value must change. `var` ignores blocks, which leads to bugs like this one:

var.js

```ts
var label = "outer";
if (true) {
  var label = "inner";
}
console.log(label);

let name = "outer";
if (true) {
  let name = "inner";
}
console.log(name);
```

Output of `node var.js` and of the browser terminal

```ts
inner
outer
```

The `var` inside the `if` silently overwrote the outer one. With `let`, the inner `name` exists only inside its block. [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope) explains exactly why. When you modernise code, replace every `var` with `const`, and change it to `let` only if the code assigns to it again.

## A first look at modules

Old browser code put everything in one global space, and files shared variables by accident. Modern JavaScript splits code into **modules**: each file keeps its names to itself, `export`s what others may use, and `import`s what it needs. Here the formatter lives in its own file:

format.js

```ts
export function formatTitle(task) {
  return `${task.done ? "[x]" : "[ ]"} ${task.title}`;
}
```

main.js

```ts
import { formatTitle } from "./format.js";

console.log(formatTitle({ title: "Buy milk", done: true }));
```

Output of `node main.js` and of the browser terminal

```json
[x] Buy milk
```

That is all you need for now. [Modules](https://zudojs.oyinlola.site/learn/js-modules) teaches them fully: named and default exports, CommonJS `require`, and how to organise a project.

## Build: the full refactor

Now rewrite `formatTask` from the start of the lesson with every tool you have seen. Keep the old version next to it, so you can compare the two on the same inputs:

refactor.js

```ts
function oldFormatTask(task, options) {
  options = options || {};
  var prefix = options.prefix || "-";
  var owner = task.owner && task.owner.name ? task.owner.name : "nobody";
  var priority = task.priority || 3;
  return prefix + " " + task.title + " (" + owner + ", priority " + priority + ")";
}

function formatTask({ title, owner, priority = 3 }, { prefix = "-" } = {}) {
  const who = owner?.name ?? "nobody";
  return `${prefix} ${title} (${who}, priority ${priority})`.trim();
}

const cases = [
  [{ title: "Buy milk", owner: { name: "Ada" }, priority: 1 }],
  [{ title: "Write report" }, { prefix: "*" }],
  [{ title: "Fix login bug", priority: 0 }, { prefix: "" }],
];

for (const args of cases) {
  console.log("old:", oldFormatTask(...args));
  console.log("new:", formatTask(...args));
}
```

Output of `node refactor.js` and of the browser terminal

```ts
old: - Buy milk (Ada, priority 1)
new: - Buy milk (Ada, priority 1)
old: * Write report (nobody, priority 3)
new: * Write report (nobody, priority 3)
old: - Fix login bug (nobody, priority 3)
new: Fix login bug (nobody, priority 0)
```

The new version gives the same result for the normal cases and fixes both bugs in the third one:

- The default `priority = 3` only applies to a missing value, so priority `0` survives.
- The default `prefix = "-"` only applies when no prefix was given, so `""` is kept. `.trim()` removes the leading space that an empty prefix leaves.
- `owner?.name ?? "nobody"` replaces the whole `&&` and `? :` line.
- The test loop passes each case with spread: `formatTask(...args)` turns the array into separate arguments.

This is how to refactor safely in real projects too: keep the old behaviour, check it on the same inputs, and change only what you meant to change. In [Testing](https://zudojs.oyinlola.site/learn/testing-basics) you will turn a loop like this into automatic tests.

## Practice

TRY IT YOURSELF

### Modernise a config reader

Rewrite this function with destructuring, default values and `??`. A `port` of `0` must be kept (it means "pick any free port"), and a missing `host` must become `"localhost"`.

config-old.js

```ts
function readConfig(config) {
  var port = config.port || 3000;
  var host = config.host || "localhost";
  return "http://" + host + ":" + port;
}

console.log(readConfig({ port: 0 }));
```

Output of `node config-old.js` and of the browser terminal

```ts
http://localhost:3000
```

**Show a solution**

config-new.js

```ts
function readConfig({ port = 3000, host = "localhost" } = {}) {
  return `http://${host}:${port}`;
}

console.log(readConfig({ port: 0 }));
console.log(readConfig({ host: "api.example.com" }));
console.log(readConfig());
```

Output of `node config-new.js` and of the browser terminal

```ts
http://localhost:0
http://api.example.com:3000
http://localhost:3000
```

If the config could contain `null` values (for example after `JSON.parse`), use `config.port ?? 3000` instead of a default, because defaults ignore `null`.

TRY IT YOURSELF

### Sum with rest

Write `total(label, ...amounts)` that returns a string like `Groceries: 12`, adding up all the amounts. Then call it with an existing array of amounts using spread.

**Show a solution**

total.js

```ts
function total(label, ...amounts) {
  const sum = amounts.reduce((acc, n) => acc + n, 0);
  return `${label}: ${sum}`;
}

console.log(total("Groceries", 4, 5, 3));

const week = [10, 20, 5];
console.log(total("Week", ...week));
console.log(total("Nothing"));
```

Output of `node total.js` and of the browser terminal

```ts
Groceries: 12
Week: 35
Nothing: 0
```

TRY IT YOURSELF

### Safe nested read

A request may or may not have `request.user.settings.language`. Write `languageOf(request)` that returns it, or `"en"` when any part is missing. It must not crash on `{}`.

**Show a solution**

language.js

```ts
function languageOf(request) {
  return request.user?.settings?.language ?? "en";
}

console.log(languageOf({ user: { settings: { language: "fr" } } }));
console.log(languageOf({ user: {} }));
console.log(languageOf({}));
```

Output of `node language.js` and of the browser terminal

```ts
fr
en
en
```

## Recap

- Template literals `\`${x}\`` replace string gluing with `+`.
- `a?.b` reads safely through `null` and `undefined`. `a ?? b` falls back only for `null` and `undefined`, so it keeps `0` and `""`.
- Default parameters and destructuring defaults apply to `undefined` only, never to `null`.
- Destructuring can rename (`{ a: b }`), set defaults, go into nested objects, and take arrays apart by position.
- Spread expands (`f(...list)`, `{ ...obj }`). Rest collects (`function f(...args)`, `const { id, ...rest } = obj`).
- Use `const` by default, `let` when you reassign, and never `var`.
- Refactor with the old and new versions side by side, checked on the same inputs.

Next, [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope): where a name can be used, why `let` fixes the `var` bugs, and how the call stack works.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
