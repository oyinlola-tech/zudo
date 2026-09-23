---
title: "Objects, arrays and JSON"
description: "Group related values into objects, keep lists in arrays, transform them with map and filter, and turn them into JSON, the format every API speaks."
source: https://zudojs.oyinlola.site/learn/js-data
---

LESSON 3 OF 10

JavaScript for the backend

# Objects, arrays and JSON

Group related values into objects, keep lists in arrays, transform them with map and filter, and turn them into JSON, the format every API speaks.

- **30 min** to read and try
- **You need:** Lessons 1 and 2
- **You build:** An in-memory list of tasks you can search and summarise

## Objects

A task has several pieces of information: an id, a title, whether it is done. An **object** keeps them together. Each piece is a **property**: a name, a colon, and a value.

object.js

```ts
const task = {
  id: 1,
  title: "Buy milk",
  done: false,
};

console.log(task);
console.log(task.title);
console.log(task["done"]);
```

Output of `node object.js` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: false }
Buy milk
false
```

Read a property with a dot, `task.title`, or with square brackets and a string, `task["done"]`. Brackets are useful when the property name is stored in a variable.

Notice that `console.log` prints strings inside objects with single quotes. That is only how Node.js displays them: the value is still the text `Buy milk`.

You can change and add properties, even on an object held by `const`. `const` stops the name from pointing at a different object. It does not freeze the object itself.

change.js

```ts
const task = { id: 1, title: "Buy milk", done: false };

task.done = true;
task.priority = 2;

console.log(task);
console.log(task.dueDate);
```

Output of `node change.js` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: true, priority: 2 }
undefined
```

Reading a property that does not exist gives `undefined`. It does not crash. That is convenient, and it is also how typos slip through: `task.titel` is just `undefined`. TypeScript fixes this in lesson 6.

## Taking objects apart and copying them

**Destructuring** pulls properties out into variables in one line. The **spread** syntax `...` copies every property into a new object, so you can change a copy without touching the original:

spread.js

```ts
const task = { id: 1, title: "Buy milk", done: false };

const { title, done } = task;
console.log(title, done);

const finished = { ...task, done: true };
console.log(finished);
console.log(task);
```

Output of `node spread.js` and of the browser terminal

```ts
Buy milk false
{ id: 1, title: 'Buy milk', done: true }
{ id: 1, title: 'Buy milk', done: false }
```

Backends copy objects like this all the time. Updating a task usually means "take the stored task, and replace only the fields the user sent".

## Arrays

An **array** is an ordered list. Positions start at 0.

array.js

```ts
const titles = ["Buy milk", "Write report"];

titles.push("Call Ada");

console.log(titles);
console.log(titles.length);
console.log(titles[0]);
console.log(titles.at(-1));
console.log(titles.includes("Write report"));
```

Output of `node array.js` and of the browser terminal

```json
[ 'Buy milk', 'Write report', 'Call Ada' ]
3
Buy milk
Call Ada
true
```

`push` adds to the end, `length` counts the items, and `at(-1)` reads the last one.

## A list of tasks

Put the two ideas together and you have the data behind a Task API: an array of task objects. Arrays have methods that take a function and apply it to every item:

- `find` returns the first item where the function returns true.
- `filter` returns a new array with every item where it returns true.
- `map` returns a new array with the function's result for each item.
- `some` tells you whether at least one item matches.

tasks.js

```ts
const tasks = [
  { id: 1, title: "Buy milk", done: true },
  { id: 2, title: "Write report", done: false },
  { id: 3, title: "Call Ada", done: false },
];

const task2 = tasks.find((task) => task.id === 2);
console.log(task2);

const open = tasks.filter((task) => !task.done);
console.log(open.length, "open tasks");

const titles = tasks.map((task) => task.title);
console.log(titles);

console.log(tasks.some((task) => task.done));
console.log(tasks.find((task) => task.id === 99));
```

Output of `node tasks.js` and of the browser terminal

```json
{ id: 2, title: 'Write report', done: false }
2 open tasks
[ 'Buy milk', 'Write report', 'Call Ada' ]
true
undefined
```

`find` gives `undefined` when nothing matches. In an API that becomes a **404 Not Found** answer, which you will build in lesson 9.

> TIP
>
> None of these methods change the original array. `filter` and `map` always return new arrays. That makes them safe to use anywhere.

## JSON: how data travels

A backend cannot send a JavaScript object over the network. It sends text. The text format almost every API uses is **JSON**, short for JavaScript Object Notation. It looks almost exactly like the objects you just wrote.

`JSON.stringify` turns a value into JSON text. `JSON.parse` turns JSON text back into a value:

json.js

```ts
const task = { id: 1, title: "Buy milk", done: false };

const text = JSON.stringify(task);
console.log(text);
console.log(typeof text);

const back = JSON.parse(text);
console.log(back.title);

console.log(JSON.stringify(task, null, 2));
```

Output of `node json.js` and of the browser terminal

```json
{"id":1,"title":"Buy milk","done":false}
string
Buy milk
{
  "id": 1,
  "title": "Buy milk",
  "done": false
}
```

JSON has a few rules that JavaScript objects do not: property names must be in double quotes, and there are no comments and no trailing commas. The extra `null, 2` tells `JSON.stringify` to indent with two spaces, which is easier to read.

When a client sends a new task to your API, it arrives as JSON text, and your code calls `JSON.parse` on it. Bad text makes `JSON.parse` fail, so a backend always has to be ready for that. You will learn how in lesson 5.

## Practice

TRY IT YOURSELF

### Summarise the task list

Using the `tasks` array above, write a function `summary(tasks)` that returns an object with three properties: `total`, `done` and `open`. Print it, and print it again as JSON.

**Show a solution**

summary.js

```ts
const tasks = [
  { id: 1, title: "Buy milk", done: true },
  { id: 2, title: "Write report", done: false },
  { id: 3, title: "Call Ada", done: false },
];

function summary(list) {
  const done = list.filter((task) => task.done).length;
  return { total: list.length, done, open: list.length - done };
}

console.log(summary(tasks));
console.log(JSON.stringify(summary(tasks)));
```

Output of `node summary.js` and of the browser terminal

```json
{ total: 3, done: 1, open: 2 }
{"total":3,"done":1,"open":2}
```

`{ total: list.length, done, ... }` uses a shortcut: writing just `done` means `done: done`.

## Recap

- Objects group named values. Arrays hold ordered lists. A list of tasks is an array of objects.
- `find`, `filter`, `map` and `some` answer questions about a list without changing it.
- `{ ...task, done: true }` copies an object and changes one field.
- JSON is the text format APIs use. `JSON.stringify` writes it and `JSON.parse` reads it.
