---
title: "Recursion — ZudoJS Academy"
description: "Walk folders, comment threads and org charts of any depth with functions that call themselves, then make them safe against deep and circular data."
source: https://zudojs.oyinlola.site/learn/js-recursion
---

LEVEL 2 · LESSON 15 OF 19

Scope, closures and recursion Foundation

# Recursion

Walk folders, comment threads and org charts of any depth with functions that call themselves, then make them safe against deep and circular data.

- **50 min** to read and try
- **You need:** Closures in depth, Scope and how code runs, Arrays, and Objects and JSON
- **You build:** A comment thread engine that turns flat database rows into a tree, renders it, counts replies and survives bad data

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write a recursive function from its base case, its smaller step and its combine step
- Trace a recursive call on the call stack and predict the order of its output
- Walk nested data such as folders, comment threads and org charts
- Find and fix the common recursion bugs, including cycles in data
- Explain stack overflow and rewrite a recursive function with an explicit stack
- Decide when recursion is safe in production and when to limit depth

## How big is this folder?

A cloud storage app shows each user how much space a folder uses. A folder contains files and other folders, and those folders contain more files and folders. Here is a small one, as the API stores it:

problem.js

```ts
const photos = {
  name: "Photos",
  files: [{ name: "cover.jpg", kb: 300 }],
  folders: [
    {
      name: "2025",
      files: [{ name: "lagos.jpg", kb: 1200 }, { name: "abuja.jpg", kb: 900 }],
      folders: [
        { name: "Wedding", files: [{ name: "vows.mp4", kb: 50000 }], folders: [] },
      ],
    },
    { name: "2026", files: [{ name: "kano.jpg", kb: 700 }], folders: [] },
  ],
};

function sizeTwoLevels(folder) {
  let total = 0;
  for (const file of folder.files) total += file.kb;
  for (const sub of folder.folders) {
    for (const file of sub.files) total += file.kb;
  }
  return total;
}

console.log(sizeTwoLevels(photos));
```

Output of `node problem.js` and of the browser terminal

```ts
3100
```

The answer should be 53,100 KB. The two-level loop never looked inside `Wedding`, so a 50 MB video went missing. You could add a third nested loop, but a user can create a fourth level, or a fortieth. The *shape* of the data has no fixed depth, so no fixed number of loops can handle it.

Notice something about the shape, though: a folder contains folders. The data is defined in terms of itself. When data looks like that, the natural solution looks like that too: a function that handles one folder by calling *itself* on each sub-folder. A function that calls itself is **recursive**, and the technique is **recursion**. You met it briefly in [Functions](https://zudojs.oyinlola.site/learn/js-functions#recursion) and saw how it can overflow the stack in [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#call-stack). This lesson teaches you to design recursive functions on purpose, to trace them, to walk real nested data, and to know when recursion is the wrong tool.

## Thinking recursively

Every recursive function answers three questions:

1. **Base case**: what is the smallest input, one you can answer directly without calling yourself? For a folder, it is a folder with no sub-folders: its size is the sum of its files.
2. **Smaller step**: how do you get from this input to a smaller one of the same kind? Each sub-folder is a smaller folder.
3. **Combine**: once you have the answers for the smaller pieces, how do you build this answer? Add the files here to the sizes of the sub-folders.

Then comes the part that feels like cheating at first: when you write the combine step, **assume the function already works** for the smaller pieces. You do not trace every level in your head. You only check that the base case is right and that each call gets closer to it. If both hold, the function is correct for any depth; this is the same reasoning as a proof by induction in maths.

folder-size.js

```ts
const photos = {
  name: "Photos",
  files: [{ name: "cover.jpg", kb: 300 }],
  folders: [
    {
      name: "2025",
      files: [{ name: "lagos.jpg", kb: 1200 }, { name: "abuja.jpg", kb: 900 }],
      folders: [{ name: "Wedding", files: [{ name: "vows.mp4", kb: 50000 }], folders: [] }],
    },
    { name: "2026", files: [{ name: "kano.jpg", kb: 700 }], folders: [] },
  ],
};

function folderSize(folder) {
  let total = 0;
  for (const file of folder.files) total += file.kb;
  for (const sub of folder.folders) total += folderSize(sub);
  return total;
}

console.log(folderSize(photos));
console.log(folderSize(photos.folders[1]));
console.log(folderSize({ name: "Empty", files: [], folders: [] }));
```

Output of `node folder-size.js` and of the browser terminal

```ts
53100
700
0
```

Where is the base case? There is no `if`. For a folder without sub-folders, the second loop runs zero times, so the function returns without calling itself. The base case is built into the data: the recursion stops where the tree stops. This is typical for recursion over **trees**, data where every item can have children, and each child is the root of a smaller tree.

### The recursive case on numbers

For numbers, the base case usually needs an explicit `if`. Here is a savings plan: each month the balance grows by 1% interest, then the customer adds a fixed deposit. The balance after `n` months is defined in terms of the balance after `n - 1` months:

savings.js

```ts
function balanceAfter(months, startKobo, depositKobo) {
  if (months === 0) return startKobo;
  const previous = balanceAfter(months - 1, startKobo, depositKobo);
  return Math.round(previous * 1.01) + depositKobo;
}

console.log(balanceAfter(0, 1000000, 500000));
console.log(balanceAfter(1, 1000000, 500000));
console.log(balanceAfter(12, 1000000, 500000));
```

Output of `node savings.js` and of the browser terminal

```ts
1000000
1510000
7468076
```

The three questions again: the base case is month 0, where the balance is the start. The smaller step is `months - 1`. The combine step applies one month of interest and one deposit to the previous balance. You could write this as a loop just as easily, and for numbers a loop is usually clearer. Recursion earns its place on nested data.

## Recursion on the call stack

Each call of a recursive function is a separate call, with its own execution context on the call stack and its own parameters and local variables ([Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#call-stack)). The calls below it wait, each holding its own half-finished work, until the call above returns. Printing with an indent that grows with the depth makes this visible:

trace.js

```ts
const org = {
  name: "Ngozi (CEO)",
  reports: [
    { name: "Tunde (CTO)", reports: [{ name: "Ada (engineer)", reports: [] }] },
    { name: "Bola (CFO)", reports: [] },
  ],
};

function countPeople(person, depth = 0) {
  const pad = "  ".repeat(depth);
  console.log(`${pad}enter ${person.name}`);
  let total = 1;
  for (const report of person.reports) {
    total += countPeople(report, depth + 1);
  }
  console.log(`${pad}leave ${person.name} -> ${total}`);
  return total;
}

countPeople(org);
```

Output of `node trace.js` and of the browser terminal

```ts
enter Ngozi (CEO)
  enter Tunde (CTO)
    enter Ada (engineer)
    leave Ada (engineer) -> 1
  leave Tunde (CTO) -> 2
  enter Bola (CFO)
  leave Bola (CFO) -> 1
leave Ngozi (CEO) -> 4
```

Read the trace as the call stack growing to the right and shrinking back:

```ts
 stack while Ada runs:         after Ada returns:        after Tunde returns:
 +---------------------+       +---------------------+   +---------------------+
 | countPeople(Ada)    |       |                     |   |                     |
 | countPeople(Tunde)  |       | countPeople(Tunde)  |   |                     |
 | countPeople(Ngozi)  |       | countPeople(Ngozi)  |   | countPeople(Ngozi)  |
 +---------------------+       +---------------------+   +---------------------+
 three separate "total"s       Tunde's total: 1 + 1      Ngozi's total: 1 + 2, then Bola
```

- Ngozi's call does not finish until everything below it has finished. Its `total` waits on the stack the whole time.
- The deepest call, Ada's, is the first to *leave*. Results flow back up: Ada returns 1 to Tunde, Tunde returns 2 to Ngozi.
- Each call has its own `total` and `depth`. They do not interfere, because each call has its own environment ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#environments)).

### Work before or after the call

Where you put the work relative to the recursive call decides the order of the output. Work *before* the calls handles a parent before its children; that order is called **pre-order**. Work *after* the calls handles the children first; that is **post-order**:

order.js

```ts
const org = {
  name: "Ngozi",
  reports: [
    { name: "Tunde", reports: [{ name: "Ada", reports: [] }] },
    { name: "Bola", reports: [] },
  ],
};

function preOrder(person, out = []) {
  out.push(person.name);
  for (const report of person.reports) preOrder(report, out);
  return out;
}

function postOrder(person, out = []) {
  for (const report of person.reports) postOrder(report, out);
  out.push(person.name);
  return out;
}

console.log(preOrder(org).join(" > "));
console.log(postOrder(org).join(" > "));
```

Output of `node order.js` and of the browser terminal

```ts
Ngozi > Tunde > Ada > Bola
Ada > Tunde > Bola > Ngozi
```

Pre-order suits printing a tree top-down, like a table of contents. Post-order suits work where the children must be done first: deleting a folder (empty it before removing it), or computing a total that depends on the children's totals. Both functions pass the same `out` array down to every call, so they all push into one list; this is called an **accumulator**.

## Walking real nested data

Most recursion in backend code walks one of three shapes: trees of objects (folders, comments, categories, org charts), nested arrays, and "any JSON value". Each needs a slightly different base case.

### Rendering a comment thread

Comments with replies, which have replies, are a tree. Rendering them needs the depth for indentation, and a count is a one-line recursion:

comments.js

```ts
const thread = [
  {
    author: "Ada", text: "Is delivery free in Lagos?",
    replies: [
      { author: "Shop", text: "Yes, above ₦20,000.", replies: [
        { author: "Ada", text: "Thanks!", replies: [] },
      ] },
      { author: "Chidi", text: "Same for Abuja?", replies: [] },
    ],
  },
  { author: "Tunde", text: "Great rice.", replies: [] },
];

function render(comments, depth = 0) {
  const lines = [];
  for (const c of comments) {
    lines.push(`${"  ".repeat(depth)}- ${c.author}: ${c.text}`);
    lines.push(...render(c.replies, depth + 1));
  }
  return lines;
}

function countComments(comments) {
  return comments.reduce((sum, c) => sum + 1 + countComments(c.replies), 0);
}

console.log(render(thread).join("\n"));
console.log("comments:", countComments(thread));
```

Output of `node comments.js` and of the browser terminal

```ts
- Ada: Is delivery free in Lagos?
  - Shop: Yes, above ₦20,000.
    - Ada: Thanks!
  - Chidi: Same for Abuja?
- Tunde: Great rice.
comments: 5
```

Here the function takes a *list* of comments rather than one comment, so the base case is an empty list: `render([])` returns `[]` and `countComments([])` returns 0, because `reduce` starts from 0 and has nothing to add.

### Searching an org chart

Some recursive functions look for something and must stop as soon as they find it. The answer from a deeper call has to be passed up through every level. Here the function returns the chain of managers from the top of the company down to a person, or `null` when the person is not in this part of the tree:

find-path.js

```ts
const org = {
  name: "Ngozi",
  reports: [
    { name: "Tunde", reports: [{ name: "Ada", reports: [] }, { name: "Emeka", reports: [] }] },
    { name: "Bola", reports: [{ name: "Funmi", reports: [] }] },
  ],
};

function pathTo(person, target) {
  if (person.name === target) return [person.name];
  for (const report of person.reports) {
    const path = pathTo(report, target);
    if (path !== null) return [person.name, ...path];
  }
  return null;
}

console.log(pathTo(org, "Emeka"));
console.log(pathTo(org, "Funmi"));
console.log(pathTo(org, "Ngozi"));
console.log(pathTo(org, "Zainab"));
```

Output of `node find-path.js` and of the browser terminal

```json
[ 'Ngozi', 'Tunde', 'Emeka' ]
[ 'Ngozi', 'Bola', 'Funmi' ]
[ 'Ngozi' ]
null
```

There are two base cases: found (return a path of one name) and a person with no reports who is not the target (the loop does nothing, so the function returns `null`). The combine step puts the current person in front of the path found below. Checking `path !== null` is essential: without it, the loop would stop at the first report even when the target was not under them. An approval workflow uses exactly this path: "who must approve Emeka's expense?" is everyone above him.

### Any JSON value: deep equality

In [Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#identity) you wrote `shallowEqual`, and saw that comparing all levels needs recursion. Data from JSON is a tree whose nodes are objects and arrays, and whose leaves are primitives. The base case is "at least one side is not an object":

deep-equal.js

```ts
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

const saved = { id: 7, items: [{ sku: "RICE-5", qty: 2 }], address: { city: "Lagos" } };
const incoming = { address: { city: "Lagos" }, id: 7, items: [{ qty: 2, sku: "RICE-5" }] };
const changed = { id: 7, items: [{ sku: "RICE-5", qty: 3 }], address: { city: "Lagos" } };

console.log(deepEqual(saved, incoming));
console.log(deepEqual(saved, changed));
console.log(deepEqual([1, [2, [3]]], [1, [2, [3]]]), deepEqual([], {}));
```

Output of `node deep-equal.js` and of the browser terminal

```ts
true
false
true false
```

A backend uses this to skip a database write when an update changes nothing. This version handles plain JSON data; a complete one, like Vitest's `toEqual`, also knows about dates, maps, sets and circular references.

## When recursion goes wrong

Recursive bugs come in a few recognisable kinds. Learn their symptoms and you can find them quickly.

bugs.js

```ts
function tryIt(label, run) {
  try {
    console.log(`${label}: ${run()}`);
  } catch (error) {
    console.log(`${label}: ${error.name}: ${error.message}`);
  }
}

function countdownNoBase(n) {
  return countdownNoBase(n - 1);
}

function stepsOfTwo(n) {
  if (n === 0) return "done";
  return stepsOfTwo(n - 2);
}

function sizeForgotReturn(folder) {
  if (folder.folders.length === 0) return folder.kb;
  let total = folder.kb;
  for (const sub of folder.folders) sizeForgotReturn(sub);
  return total;
}

tryIt("no base case", () => countdownNoBase(3));
tryIt("even start", () => stepsOfTwo(4));
tryIt("odd start", () => stepsOfTwo(5));
tryIt("result ignored", () => sizeForgotReturn({ kb: 10, folders: [{ kb: 5, folders: [] }] }));
```

Output of `node bugs.js` and of the browser terminal

```ts
no base case: RangeError: Maximum call stack size exceeded
even start: done
odd start: RangeError: Maximum call stack size exceeded
result ignored: 10
```

- **No base case**: the function never stops, the stack fills up, and JavaScript throws a `RangeError`.
- **Base case that can be skipped**: `stepsOfTwo(5)` goes 5, 3, 1, -1, and never hits exactly 0. Base cases should cover a range (`n <= 0`), not one exact value, unless the input is guaranteed.
- **Recursive result thrown away**: `sizeForgotReturn` calls itself but never adds the result. There is no error, just a wrong answer (10 instead of 15), which is worse. Every recursive call's result must be used.

### Cycles in the data

Recursion over a tree assumes it *is* a tree: no item is its own ancestor. Real data breaks this. An admin sets a manager's manager to the employee; a folder "shortcut" points at its own parent. Recursion then goes round the loop until the stack overflows. The fix is to remember what you have visited, in a `Set`, and refuse to enter anything twice:

cycles.js

```ts
const ngozi = { name: "Ngozi", reports: [] };
const tunde = { name: "Tunde", reports: [] };
const ada = { name: "Ada", reports: [] };
ngozi.reports.push(tunde);
tunde.reports.push(ada);
ada.reports.push(ngozi);

function countPeople(person) {
  let total = 1;
  for (const report of person.reports) total += countPeople(report);
  return total;
}

try {
  countPeople(ngozi);
} catch (error) {
  console.log(`naive: ${error.name}`);
}

function countPeopleSafe(person, visited = new Set()) {
  if (visited.has(person)) {
    throw new Error(`cycle: ${person.name} reports to someone below them`);
  }
  visited.add(person);
  let total = 1;
  for (const report of person.reports) total += countPeopleSafe(report, visited);
  return total;
}

try {
  countPeopleSafe(ngozi);
} catch (error) {
  console.log(`safe: ${error.message}`);
}

ada.reports.length = 0;
console.log("fixed data:", countPeopleSafe(ngozi));
```

Output of `node cycles.js` and of the browser terminal

```ts
naive: RangeError
safe: cycle: Ngozi reports to someone below them
fixed data: 3
```

The `Set` compares by identity, which is exactly right here: it recognises the *same* object coming round again. Whether to throw, skip or log a cycle is a decision for your application; for an org chart, a cycle is bad data that someone must fix, so throwing with a clear message is right. `structuredClone` handles cycles with the same idea internally.

### Exponential recursion

A recursive function that calls itself *twice* per call can do an enormous amount of repeated work. Ways to climb a staircase taking one or two steps at a time is a classic: the ways for `n` steps are the ways for `n - 1` plus the ways for `n - 2`. Count the calls:

exponential.js

```ts
let calls = 0;
function ways(n) {
  calls += 1;
  if (n <= 1) return 1;
  return ways(n - 1) + ways(n - 2);
}
console.log(ways(25), "calls:", calls);

const cache = new Map();
let memoCalls = 0;
function waysMemo(n) {
  memoCalls += 1;
  if (n <= 1) return 1;
  if (cache.has(n)) return cache.get(n);
  const result = waysMemo(n - 1) + waysMemo(n - 2);
  cache.set(n, result);
  return result;
}
console.log(waysMemo(25), "calls:", memoCalls);
```

Output of `node exponential.js` and of the browser terminal

```ts
121393 calls: 242785
121393 calls: 49
```

The plain version computes `ways(23)` twice, `ways(22)` three times, and so on: the number of calls roughly doubles with each extra step. With the memoization from [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#memoization), each value is computed once and the whole thing takes 49 calls. When a recursive function calls itself on overlapping pieces, memoize it. [Dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) builds a whole technique on this.

## Stack overflow and deep data

Every pending call takes space on the call stack, and the stack is small: typically about ten thousand simple calls, depending on the engine and how many local variables each call has. A tree of folders is rarely more than a few dozen levels deep, so recursion over it is safe. But some data is deep by nature: a linked chain of records, where each points to the next, such as a history of edits, or a list of transactions that each reference the previous one:

deep-chain.js

```ts
function buildChain(length) {
  let head = null;
  for (let i = length; i >= 1; i--) head = { amountKobo: 100, previous: head };
  return head;
}

function totalRecursive(entry) {
  if (entry === null) return 0;
  return entry.amountKobo + totalRecursive(entry.previous);
}

console.log(totalRecursive(buildChain(1000)));

try {
  totalRecursive(buildChain(100000));
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node deep-chain.js` and of the browser terminal

```ts
100000
RangeError: Maximum call stack size exceeded
```

The logic is correct; the data is simply deeper than the stack. Some languages avoid this for calls in **tail position** (a `return f(x)` with nothing left to do afterwards) by reusing the stack frame. The JavaScript specification describes this ("proper tail calls"), but only Safari's engine, JavaScriptCore, implements it; V8, the engine in Node.js and Chrome, does not, so you cannot rely on it. For data that can be arbitrarily deep, use iteration.

## Turning recursion into iteration

Recursion uses the call stack to remember "what is still to do". You can keep that list yourself, in an ordinary array used as a **stack**: `push` to add work, `pop` to take the most recent. An array lives on the heap and can hold millions of items, so the depth limit disappears:

iterative.js

```ts
function buildChain(length) {
  let head = null;
  for (let i = length; i >= 1; i--) head = { amountKobo: 100, previous: head };
  return head;
}

function totalIterative(entry) {
  let total = 0;
  for (let current = entry; current !== null; current = current.previous) {
    total += current.amountKobo;
  }
  return total;
}
console.log(totalIterative(buildChain(100000)));

function folderSizeIterative(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const folder = stack.pop();
    for (const file of folder.files) total += file.kb;
    for (const sub of folder.folders) stack.push(sub);
  }
  return total;
}

const photos = {
  files: [{ kb: 300 }],
  folders: [
    { files: [{ kb: 1200 }, { kb: 900 }], folders: [{ files: [{ kb: 50000 }], folders: [] }] },
    { files: [{ kb: 700 }], folders: [] },
  ],
};
console.log(folderSizeIterative(photos));

let deep = { files: [{ kb: 1 }], folders: [] };
for (let i = 0; i < 50000; i++) deep = { files: [{ kb: 1 }], folders: [deep] };
console.log(folderSizeIterative(deep));
```

Output of `node iterative.js` and of the browser terminal

```ts
10000000
53100
50001
```

A chain has only one "next", so a plain loop is enough. A tree can branch, so each folder may add several folders to the to-do stack. The iterative folder size gives the same 53,100 as the recursive one, and a folder nested 50,000 levels deep, which would overflow the recursive version, is no problem.

### Level by level with a queue

Swap the stack for a **queue**, taking work from the front with `shift` instead of the end, and you visit a tree level by level: everyone at depth 1, then depth 2. That order, called **breadth-first**, answers questions such as "who are the CEO's direct reports, then theirs?":

levels.js

```ts
const org = {
  name: "Ngozi",
  reports: [
    { name: "Tunde", reports: [{ name: "Ada", reports: [] }, { name: "Emeka", reports: [] }] },
    { name: "Bola", reports: [{ name: "Funmi", reports: [] }] },
  ],
};

function byLevel(root) {
  const levels = [];
  const queue = [{ person: root, depth: 0 }];
  while (queue.length > 0) {
    const { person, depth } = queue.shift();
    (levels[depth] ??= []).push(person.name);
    for (const report of person.reports) queue.push({ person: report, depth: depth + 1 });
  }
  return levels;
}

byLevel(org).forEach((names, depth) => console.log(`level ${depth}: ${names.join(", ")}`));
```

Output of `node levels.js` and of the browser terminal

```ts
level 0: Ngozi
level 1: Tunde, Bola
level 2: Ada, Emeka, Funmi
```

`shift` is slow on very large arrays, because every remaining item moves down one place; [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues) shows faster queues, and [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search) uses this exact loop to find shortest paths.

|  | Recursion | Explicit stack or queue |
| --- | --- | --- |
| Reads like | The definition of the data | A to-do list |
| Depth limit | About ten thousand levels | Only memory |
| Good for | Trees of known, modest depth: folders, menus, comment threads, config | Data of unknown or huge depth, chains, level-by-level order |

## Before you build: comments from the database

REASON IT OUT

### From flat rows to a thread

A database does not store a tree of objects. It stores comments as flat rows, each with an `id` and a `parentId` (`null` for a top-level comment). You must turn rows into a tree, render it, and count replies. Before writing code, think through:

- Does building the tree itself need recursion, or can you do it in one pass over the rows?
- What if a reply's row comes *before* its parent's row?
- What if a row's `parentId` points at a comment that was deleted?
- What if bad data makes two comments each other's parent?
- Threads come from users. How deep can they get, and does that make recursion risky?

**Show the reasoning**

- **Building**: no recursion needed. Put every row into a `Map` by id first (one pass), then attach each row to its parent (a second pass). Two loops, no depth problem at all.
- **Order**: doing it in two passes means order does not matter: by the second pass every parent is already in the map.
- **Missing parent**: decide a policy. Showing the reply at the top level is friendlier than dropping it; record it so you can fix the data.
- **Cycles**: rows that are each other's parent never reach the top level, so they are never attached to the roots and a recursive render starting from the roots never sees them. But the render must still not trust the tree blindly: a depth limit is a cheap guarantee.
- **Depth**: users can reply to replies forever. Rendering with recursion is fine if you cap the depth (most sites stop indenting after a few levels and show "continue this thread"). The cap makes stack overflow impossible, whatever the data.

## Build: a comment thread engine

thread.js

```ts
export function buildThread(rows) {
  const byId = new Map();
  for (const row of rows) byId.set(row.id, { ...row, replies: [] });

  const roots = [];
  const orphans = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else if (byId.has(node.parentId)) {
      byId.get(node.parentId).replies.push(node);
    } else {
      orphans.push(node.id);
      roots.push(node);
    }
  }
  return { roots, orphans };
}

export function renderThread(comments, { maxDepth = 3, depth = 0 } = {}) {
  const lines = [];
  for (const c of comments) {
    lines.push(`${"  ".repeat(depth)}- ${c.author}: ${c.text}`);
    if (c.replies.length === 0) continue;
    if (depth + 1 > maxDepth) {
      const hidden = countReplies([c]);
      lines.push(`${"  ".repeat(depth + 1)}(${hidden} more ${hidden === 1 ? "reply" : "replies"})`);
    } else {
      lines.push(...renderThread(c.replies, { maxDepth, depth: depth + 1 }));
    }
  }
  return lines;
}

export function countReplies(comments) {
  let total = 0;
  const stack = [...comments];
  while (stack.length > 0) {
    const c = stack.pop();
    total += c.replies.length;
    stack.push(...c.replies);
  }
  return total;
}
```

Three functions, three techniques. `buildThread` uses two plain loops and a `Map`, and turns a missing parent into a top-level comment while recording it in `orphans`. `renderThread` is recursive, because output order follows the tree, but it passes `depth` down and stops going deeper at `maxDepth`. `countReplies` uses an explicit stack, so it works at any depth; the renderer uses it to say how many replies are hidden.

main.js

```ts
import { buildThread, countReplies, renderThread } from "./thread.js";

const rows = [
  { id: 4, parentId: 2, author: "Ada", text: "Thanks!" },
  { id: 1, parentId: null, author: "Ada", text: "Is delivery free in Lagos?" },
  { id: 2, parentId: 1, author: "Shop", text: "Yes, above ₦20,000." },
  { id: 3, parentId: 1, author: "Chidi", text: "Same for Abuja?" },
  { id: 5, parentId: 4, author: "Shop", text: "You're welcome." },
  { id: 6, parentId: 5, author: "Ada", text: "Ordered!" },
  { id: 7, parentId: 99, author: "Tunde", text: "Reply to a deleted comment" },
];

const { roots, orphans } = buildThread(rows);
console.log(renderThread(roots).join("\n"));
console.log("replies:", countReplies(roots), "orphans:", orphans);
console.log(renderThread(roots, { maxDepth: 1 }).join("\n"));
```

Output of `node main.js` and of the browser terminal

```ts
- Ada: Is delivery free in Lagos?
  - Shop: Yes, above ₦20,000.
    - Ada: Thanks!
      - Shop: You're welcome.
        (1 more reply)
  - Chidi: Same for Abuja?
- Tunde: Reply to a deleted comment
replies: 5 orphans: [ 7 ]
- Ada: Is delivery free in Lagos?
  - Shop: Yes, above ₦20,000.
    (3 more replies)
  - Chidi: Same for Abuja?
- Tunde: Reply to a deleted comment
```

Row 4 arrived before its parent, row 2, and still landed in the right place. Row 7's parent was deleted, so it shows at the top level and is reported. With `maxDepth: 1` the deep part of the thread collapses into a count.

### Testing the edge cases

The tests follow the reasoning: empty input, order, orphans, a cycle, the depth cap, and a thread far deeper than the call stack:

thread.test.js

```ts
import { buildThread, countReplies, renderThread } from "./thread.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const row = (id, parentId) => ({ id, parentId, author: "u", text: `c${id}` });

check("empty", renderThread(buildThread([]).roots), []);
check("child before parent", renderThread(buildThread([row(2, 1), row(1, null)]).roots), ["- u: c1", "  - u: c2"]);
check("orphan kept", buildThread([row(1, 42)]).orphans, [1]);

const cyclic = buildThread([row(1, null), row(2, 3), row(3, 2)]);
check("cycle never reaches the roots", renderThread(cyclic.roots), ["- u: c1"]);

const chain = [row(1, null)];
for (let id = 2; id <= 100000; id++) chain.push(row(id, id - 1));
const deep = buildThread(chain);
check("deep thread counted", countReplies(deep.roots), 99999);
check("deep thread rendered with a cap", renderThread(deep.roots, { maxDepth: 2 }), [
  "- u: c1",
  "  - u: c2",
  "    - u: c3",
  "      (99997 more replies)",
]);
```

Output of `node thread.test.js` and of the browser terminal

```ts
PASS empty -> []
PASS child before parent -> ["- u: c1","  - u: c2"]
PASS orphan kept -> [1]
PASS cycle never reaches the roots -> ["- u: c1"]
PASS deep thread counted -> 99999
PASS deep thread rendered with a cap -> ["- u: c1","  - u: c2","    - u: c3","      (99997 more replies)"]
```

The cycle test documents a real behaviour: rows 2 and 3 point at each other, so neither is a root and neither is an orphan. They silently vanish from the page. That is safe (no infinite loop) but it hides bad data. A production version would also report rows that were never reached from a root, and that is the first practice exercise.

### In production

- **Never recurse without a limit on data that users control.** Deeply nested JSON in a request body, a reply chain, a category tree edited by admins: an attacker (or an accident) can make it deep enough to overflow the stack, and a thrown `RangeError` in the wrong place takes down a request or a worker. Cap the depth, or use an explicit stack.
- **Validate trees when they are saved.** Reject a manager change that would create a cycle at write time, using `pathTo`-style checks, rather than discovering it every time a page renders.
- **Let the database do deep walks.** PostgreSQL and other SQL databases can walk parent/child rows themselves with a recursive query (`WITH RECURSIVE`). Loading a whole tree into memory just to count it does not scale to millions of rows; [Data modelling](https://zudojs.oyinlola.site/learn/db-modeling#recursive) shows exactly this with a category tree, after the SQL basics in [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics).
- **Measure before optimising.** Recursion over a few hundred items is fast. The costs to watch are exponential call counts (memoize) and depth (iterate), not the recursion itself.

## Practice

TRY IT YOURSELF

### Find the unreachable comments

Write `unreachable(rows)` that returns the ids of rows that `renderThread` would never show: rows that are neither roots nor under a root (as in the cycle test). Use `buildThread`'s idea: build the tree, walk it from the roots with an explicit stack, collect the ids you reach, and return the others.

**Show a solution**

unreachable.js

```ts
function unreachable(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, replies: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = byId.get(node.parentId);
    if (node.parentId === null || !parent) roots.push(node);
    else parent.replies.push(node);
  }
  const reached = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    reached.add(node.id);
    stack.push(...node.replies);
  }
  return rows.map((r) => r.id).filter((id) => !reached.has(id));
}

const rows = [
  { id: 1, parentId: null },
  { id: 2, parentId: 3 },
  { id: 3, parentId: 2 },
  { id: 4, parentId: 1 },
  { id: 5, parentId: 99 },
];
console.log(unreachable(rows));
```

Output of `node unreachable.js` and of the browser terminal

```json
[ 2, 3 ]
```

Row 5's parent is missing, so it is treated as a root and reached. Rows 2 and 3 only point at each other; no walk from a root ever finds them. Reporting them lets an admin repair the data.

TRY IT YOURSELF

### Total of a nested bundle

A shop sells bundles, and a bundle can contain products and other bundles. Write a recursive `priceKobo(item)`: a product has a `priceKobo`; a bundle has `items` and a `discountPercent`, and costs the sum of its items minus the discount, rounded.

**Show a solution**

bundle.js

```ts
function priceKobo(item) {
  if (!item.items) return item.priceKobo;
  const sum = item.items.reduce((total, inner) => total + priceKobo(inner), 0);
  return Math.round(sum * (1 - item.discountPercent / 100));
}

const rice = { name: "Rice 5kg", priceKobo: 850000 };
const oil = { name: "Oil 1L", priceKobo: 320000 };
const salt = { name: "Salt", priceKobo: 20000 };
const kitchen = { name: "Kitchen pack", discountPercent: 10, items: [oil, salt] };
const family = { name: "Family pack", discountPercent: 5, items: [rice, rice, kitchen] };

console.log(priceKobo(rice), priceKobo(kitchen), priceKobo(family));
```

Output of `node bundle.js` and of the browser terminal

```ts
850000 306000 1905700
```

The base case is a product (no `items`). The kitchen pack is 340,000 minus 10%. The family pack is 850,000 + 850,000 + 306,000 = 2,006,000, minus 5%: the inner discount is applied first, because the recursive call returns the kitchen pack's final price.

TRY IT YOURSELF

### Flatten categories into breadcrumbs

A category tree looks like `{ name: "Food", children: [...] }`. Write a recursive `breadcrumbs(category, trail = [])` that returns one string per category, such as `"Food > Grains > Rice"`, in pre-order.

**Show a solution**

breadcrumbs.js

```ts
function breadcrumbs(category, trail = []) {
  const path = [...trail, category.name];
  return [path.join(" > "), ...category.children.flatMap((child) => breadcrumbs(child, path))];
}

const food = {
  name: "Food",
  children: [
    { name: "Grains", children: [{ name: "Rice", children: [] }, { name: "Beans", children: [] }] },
    { name: "Oils", children: [] },
  ],
};
console.log(breadcrumbs(food).join("\n"));
```

Output of `node breadcrumbs.js` and of the browser terminal

```ts
Food
Food > Grains
Food > Grains > Rice
Food > Grains > Beans
Food > Oils
```

Each call builds a *new* `path` array with spread instead of pushing into `trail`. If it pushed into a shared array, siblings would see each other's names in their trail.

## Recap

- A recursive function needs a base case, a smaller step, and a combine step. Trust the function for the smaller pieces; check only that the base case is right and always reached.
- Each recursive call has its own frame on the call stack. The deepest call returns first, and results flow back up.
- Work before the recursive calls gives pre-order (parents first); work after gives post-order (children first).
- Recursion fits nested data: folders, comment threads, org charts, categories, JSON. Base cases are often "no children" or "not an object".
- Typical bugs: no base case, a base case that can be skipped, a recursive result that is not used, and cycles in the data. Track visited objects in a `Set` to catch cycles.
- Calling yourself twice on overlapping pieces is exponential: memoize.
- The stack holds roughly ten thousand calls, and V8 (Node.js and Chrome) does not remove tail calls. For deep or user-controlled data, cap the depth or use an explicit stack (depth-first) or queue (breadth-first).

Next: [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes), where objects get shared methods and you meet `this`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
