---
title: "What Node.js is — ZudoJS Academy"
description: "Learn what Node.js adds to JavaScript, where its event loop fits, and how a program uses arguments, exit codes and environment variables to talk to the system."
source: https://zudojs.oyinlola.site/learn/node-runtime
---

LEVEL 4 · LESSON 1 OF 20

Node.js Core

# What Node.js is

Learn what Node.js adds to JavaScript, where its event loop fits, and how a program uses arguments, exit codes and environment variables to talk to the system.

- **35 min** to read and try
- **You need:** JavaScript fundamentals and Advanced JavaScript, especially The event loop and Module systems in depth
- **You build:** A learn-node folder with small programs that read arguments, exit codes and a .env file

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a runtime adds to JavaScript and what V8, libuv and the built-in modules each do
- Predict the order of sync code, nextTick, promises, setImmediate and timers inside an I/O callback
- Read command-line arguments and report success or failure with an exit code
- Load settings and secrets from environment variables and a .env file, and refuse to start when a secret is missing
- Keep secrets out of Git and out of logs

## JavaScript outside the browser

Until now, almost every example ran the same way in the browser terminal and on your computer. That was possible because they only used the JavaScript **language**: values, functions, arrays, promises. From this lesson on, you will use things that only exist on a computer: files, network ports, environment variables.

JavaScript itself has no way to read a file or open a network connection. The program that runs your code adds those abilities. That program is called the **runtime**:

- In a **browser**, the runtime gives you `window`, `document` (the web page) and buttons to click. It keeps you away from the files on the computer, for safety.
- **Node.js** is a runtime for servers and your own computer. It has no web page, but it can read and write files, start servers, and see the whole machine.

Run this with Node.js on your computer:

where-am-i.jsNode.js only

```ts
console.log("window:", typeof window);
console.log("document:", typeof document);
console.log("process:", typeof process);
console.log("Node.js version:", process.version);
```

Output of `node where-am-i.js`

```ts
window: undefined
document: undefined
process: object
Node.js version: v24.19.0
```

There is no `window` and no `document`, because there is no web page. Instead there is `process`, an object that describes the running program. You will use it a lot in this lesson. Your version number can be higher.

> NOTE
>
> From here on, most examples say **Node.js only** instead of showing a Run button. The browser terminal cannot open files or ports, so run those examples on your computer, as shown in the next section.

## A folder for this part of the course

Make one folder for the Node.js lessons and turn it into an ES module project, as you did in [Set up your computer](https://zudojs.oyinlola.site/learn/setup):

Terminal on your computer

```bash
$ mkdir learn-node
$ cd learn-node
$ npm init -y
Wrote to ~/learn-node/package.json:
…
$ npm pkg set type=module
```

Save each example in this folder with the file name shown above its code, then run it with `node` and the file name. For the example above:

Terminal on your computer

```bash
$ node where-am-i.js
window: undefined
document: undefined
process: object
Node.js version: v24.19.0
```

## What is inside Node.js

Node.js is built from a few large parts. You never call them directly, but knowing they exist explains how Node.js behaves:

- **V8** is the JavaScript engine. It reads your code, turns it into machine code and runs it. Google wrote it for the Chrome browser, which is why Chrome and Node.js print the same error messages.
- **libuv** is a library written in C. It talks to the operating system: files, network, timers. It is the part that waits for slow things, so your JavaScript does not have to.
- **The Node.js APIs** are the JavaScript modules on top, such as `node:fs` for files and `node:http` for servers. They pass your requests to libuv and give you back the results.

`process.versions` lists the version of each part:

versions.jsNode.js only

```ts
const { node, v8, uv } = process.versions;

console.log("Node.js:", node);
console.log("V8 engine:", v8);
console.log("libuv:", uv);
```

Output of `node versions.js`

```ts
Node.js: 24.19.0
V8 engine: 13.6.233.17-node.51
libuv: 1.52.1
```

## The event loop

Your JavaScript runs on **one thread**: one line at a time, never two at once. Yet a Node.js server answers thousands of people. How?

You studied the answer in [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop). Here is the short version, now that you know which part does what: libuv does the waiting. When a file has been read or a timer is due, libuv puts the callback in a queue. The **event loop** takes the next callback from a queue and runs it, over and over, until there is nothing left to wait for. Then the program ends. The loop visits its queues in a fixed cycle of **phases** (timers, I/O, `setImmediate`, close callbacks), drawn in [Node.js: nextTick, setImmediate and the phases](https://zudojs.oyinlola.site/learn/js-event-loop#node).

As a refresher, this example schedules work five different ways. It does so inside the callback of a file read, which is where server code almost always runs: inside a callback for "a request arrived" or "the database answered".

event-loop.jsNode.js only

```ts
import { readFile } from "node:fs";

readFile(import.meta.filename, () => {
  console.log("1. sync code in the callback");

  setTimeout(() => console.log("6. setTimeout"), 0);
  setImmediate(() => console.log("5. setImmediate"));
  Promise.resolve().then(() => console.log("4. promise"));
  process.nextTick(() => console.log("3. process.nextTick"));

  console.log("2. more sync code");
});
```

Output of `node event-loop.js`

```ts
1. sync code in the callback
2. more sync code
3. process.nextTick
4. promise
5. setImmediate
6. setTimeout
```

`import.meta.filename` is the full path of the current file, so the program simply reads itself. Here is the order, and why:

1. **Synchronous code** always finishes first. Nothing can interrupt it.
2. **`process.nextTick`** callbacks run as soon as the current callback finishes, before anything else.
3. **Promise callbacks** (`.then`, and the code after an `await`) run next. Together with `nextTick`, these are called **microtasks**: small jobs that run before the event loop moves on.
4. **`setImmediate`** runs right after the event loop finishes handling I/O (input and output, such as the file read).
5. **`setTimeout`** runs when the loop comes back round to check its timers, even with a delay of 0.

That order holds inside a callback, like the file read above. There is one exception at the very top of an ES module file (and every file in this course is one): Node is still finishing a promise of its own while it loads the module, so promise callbacks run *before* `nextTick` there:

top-level.jsNode.js only

```ts
Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));
console.log("sync");
```

Output of `node top-level.js`

```ts
sync
promise
nextTick
```

You rarely need to care which microtask runs first. What matters is the big picture: synchronous code, then microtasks, then the event loop's I/O, `setImmediate` and timers. If you need the details again, the phases diagram in [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop#node) has them.

At the top level of a file, outside any I/O callback, the order of `setTimeout(…, 0)` and `setImmediate` is not fixed. It depends on how fast your computer started the program. Here is a two-line file, `order.js`, run four times:

Terminal on your computer

```bash
$ node order.js
immediate
timeout
$ node order.js
immediate
timeout
$ node order.js
immediate
timeout
$ node order.js
timeout
immediate
```

The lesson: never write code that depends on which of two timers wins. If B must happen after A, call B from A, or `await` A.

## Do not block the loop

Because there is only one thread, a long piece of synchronous code stops *everything*: timers, requests, all of it. This example asks for a timer in 10 ms, then keeps the thread busy for 200 ms:

blocking.jsNode.js only

```ts
const start = Date.now();

setTimeout(() => {
  console.log(`The timer asked for 10 ms and ran after ${Date.now() - start} ms`);
}, 10);

while (Date.now() - start < 200) {
  // busy: this loop does nothing useful, but it holds the thread
}
console.log("The busy loop finished");
```

Output of `node blocking.js`

```ts
The busy loop finished
The timer asked for 10 ms and ran after 218 ms
```

The timer was due after 10 ms, but it could not run until the loop let go of the thread. In a server, that means every other user waits. Heavy work (big calculations, reading huge files in one go) should be done in small pieces, with streams, or in a separate thread. [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop#starvation) showed how to slice work; in this course you will meet streams in [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams) and worker threads in [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#workers).

## The Node.js APIs

Node.js comes with dozens of **built-in modules**. You import them like your own modules, with the `node:` prefix, and you don't install anything. These are the ones a backend developer uses most:

- `node:fs/promises`: read and write files and folders.
- `node:path`: build file paths that work on every operating system.
- `node:http`: HTTP servers and clients.
- `node:crypto`: random ids, hashes and encryption.
- `node:events`: objects that announce "something happened".
- `node:stream` and `node:readline`: handle data piece by piece.
- `node:os`: facts about the computer.
- `node:test`: a built-in test runner.

A few things are **global**, so you use them with no import at all: `process`, `console`, timers, `fetch`, `URL` and `Buffer`. Older tutorials use `require(…)` to load modules. That is the CommonJS system from [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems), and `require` does not exist in an ES module:

globals.jsNode.js only

```ts
console.log("fetch:", typeof fetch);
console.log("URL:", typeof URL);
console.log("Buffer:", typeof Buffer);
console.log("require:", typeof require);
```

Output of `node globals.js`

```ts
fetch: function
URL: function
Buffer: function
require: undefined
```

If you copy code that uses `const fs = require("fs")`, write `import fs from "node:fs"` instead ([Mixing the two in Node.js 24](https://zudojs.oyinlola.site/learn/js-module-systems#interop) covers the cases where you really need both). The next lesson, [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis), covers `fs`, `path`, `os`, `crypto` and `events` in detail.

## The process object

A running program is called a **process**. The global `process` object is how your code talks to the operating system about it.

### Command-line arguments

`process.argv` is an array of everything typed on the command line. The first two items are the path of `node` and the path of your file, so the words you typed start at index 2:

args.jsNode.js only

```ts
console.log("arguments:", process.argv.slice(2));
```

Output of `node args.js`

```ts
arguments: []
```

Run without extra words, the list is empty. Now give it some. Quotes keep `Buy milk` together as one argument:

Terminal on your computer

```bash
$ node args.js add "Buy milk"
arguments: [ 'add', 'Buy milk' ]
```

### Exit codes

When a program ends, it hands the operating system a number, the **exit code**. `0` means success. Anything else means failure. Scripts, test runners and servers such as Docker read this number to know whether your program worked.

add.jsNode.js only

```ts
const title = process.argv[2];

if (!title) {
  console.error("Usage: node add.js <title>");
  process.exitCode = 1;
} else {
  console.log(`Added: ${title}`);
}
```

Output of `node add.js`

```ts
Usage: node add.js <title>
```

`console.error` writes to the **error output** (stderr) instead of the normal output (stdout). Both appear in your terminal, but a script can tell them apart. `process.exitCode = 1` sets the code the program ends with. In a terminal on macOS or Linux, `echo $?` prints the exit code of the last command. In PowerShell, use `echo $LASTEXITCODE`.

Terminal on your computer

```bash
$ node add.js "Buy milk"
Added: Buy milk
$ echo $?
0
$ node add.js
Usage: node add.js <title>
$ echo $?
1
```

There is also `process.exit(1)`, which stops the program at once. Setting `process.exitCode` is gentler: pending work, such as a file being written, still finishes first.

### Where the program runs and how much memory it uses

`process.cwd()` is the **current working directory**: the folder your terminal was in when you started the program. It is not always the folder the file is in. `import.meta.dirname` gives you that one:

Terminal on your computer

```bash
$ node where.js
current working directory: ~/learn-node
folder of this file:       ~/learn-node
$ cd ..
$ node learn-node/where.js
current working directory: ~
folder of this file:       ~/learn-node
```

Remember this when you read files: a path like `"tasks.json"` is looked up from the working directory. The next lesson shows how to build paths that don't depend on it.

`process.memoryUsage()` reports how much memory the process uses, in bytes, and `process.pid` is the id the operating system gave it:

memory.jsNode.js only

```ts
const toMb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";

const { rss, heapUsed } = process.memoryUsage();
console.log("process id:", process.pid);
console.log("total memory (rss):", toMb(rss));
console.log("used by JavaScript objects:", toMb(heapUsed));
```

Output of `node memory.js`

```ts
process id: 186159
total memory (rss): 51.0 MB
used by JavaScript objects: 3.8 MB
```

Your numbers will differ on every run. **rss** (resident set size) is all the memory the process holds; **heapUsed** is the part your JavaScript objects use. If a server's memory only ever grows, something keeps objects it no longer needs: a memory leak, which you learned to hunt in [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory#measuring).

## Environment variables

A program needs settings that change between your computer and the server: the port to listen on, the database address, secret keys. These must not be written in the code. Code is shared, copied and pushed to GitHub. Secrets must never be.

The standard answer is **environment variables**: named text values the operating system hands to every process it starts. Node.js puts them in `process.env`. Every value is a string, or `undefined` when it is not set.

REASON IT OUT

### Before you write config.js: which settings may have a default?

The Task API needs two settings: `PORT` and `TASKS_API_KEY`. Think it through before reading the code:

- What should happen when `PORT` is not set? When `TASKS_API_KEY` is not set? Is the answer the same for both?
- What type is `process.env.PORT` when it is set to `4000`?
- Who reads your terminal output and your log files? What may the program print about the key?

**Show the reasoning**

A port is not a secret and any free port works on your computer, so a default such as 3000 is safe. A missing API key is different: a default key would be written in the code, pushed to GitHub and shared with everyone, which is the same as having no key. So the program must refuse to start without one, and say which variable is missing.

Every environment variable is text, so `"4000"` must be converted with `Number` (and, as the last exercise shows, checked, because `Number("abc")` is `NaN`).

Logs are read by many people and kept for a long time, so the program may say that the key was loaded, or how long it is, but never print the key itself.

config.jsNode.js only

```ts
const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.TASKS_API_KEY;

if (!apiKey) {
  console.error("TASKS_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

console.log(`Port: ${port}`);
console.log(`API key loaded (${apiKey.length} characters)`);
```

Output of `node config.js`

```ts
TASKS_API_KEY is not set. Copy .env.example to .env and fill it in.
```

Nothing set `TASKS_API_KEY`, so the program refused to start. That is the right behaviour. A server that starts without its secret key fails later, in a confusing way, or worse, runs without protection. Notice also that the program never prints the key itself, only its length. Secrets do not belong in logs either.

`PORT` has a safe default (`?? 3000`) because a port is not a secret. A secret never gets a default.

### A .env file

Typing every variable before each command is tedious, so developers keep them in a file called `.env` and let Node.js load it with `--env-file`. Create `.env` in your folder:

```ts
PORT=4000
TASKS_API_KEY=replace-me-with-a-long-random-value
```

To make a real random key, let Node.js generate one for you and paste it into `.env` in place of the placeholder:

Terminal on your computer

```bash
$ node -p "crypto.randomBytes(32).toString('hex')"
be4a80c451f09e6e13f07d6a63c35408c8ffadfc73bc7aa6cb222e402cb0aec7
```

Now run the program with the file:

Terminal on your computer

```bash
$ node --env-file=.env config.js
Port: 4000
API key loaded (64 characters)
$ PORT=5000 node --env-file=.env config.js
Port: 5000
API key loaded (64 characters)
$ node --env-file=missing.env config.js
node: missing.env: not found
```

Three things to notice:

- A variable that is already set in the terminal (`PORT=5000` in front of the command) wins over the file. On a server, the hosting platform sets the real values this way. In PowerShell, set it first with `$env:PORT=5000`.
- A missing file stops Node.js before your code runs. Use `--env-file-if-exists=.env` when the file is optional, for example on a server that sets real variables instead.
- Your code did not change at all. It only reads `process.env`, wherever the values came from.

> NEVER COMMIT .env
>
> Your `.env` file holds real secrets, so it must never be committed to Git or shared. Add it to `.gitignore` before your first commit. Commit a `.env.example` instead, with the same names and empty or fake values, so other developers know which variables to set. If a secret is ever pushed by mistake, deleting the file is not enough: treat the secret as stolen and replace it.

The two files for this project look like this:

```ts
# .gitignore
node_modules/
.env

# .env.example
PORT=3000
TASKS_API_KEY=
```

## Practice

TRY IT YOURSELF

### Greet from the command line

Write `greet.js` that prints `Hello, Ada!` when you run `node greet.js Ada`, and `Hello, world!` when you give no name.

**Show a solution**

greet.jsNode.js only

```ts
const name = process.argv[2] ?? "world";
console.log(`Hello, ${name}!`);
```

Output of `node greet.js`

```ts
Hello, world!
```

`process.argv[2]` is `undefined` when there is no argument, and `??` replaces `undefined` with the default.

TRY IT YOURSELF

### Predict the order

Without running it, write down the order this program prints its letters in. Then run it and check.

predict.jsNode.js only

```ts
import { readFile } from "node:fs";

readFile(import.meta.filename, () => {
  setTimeout(() => console.log("A"), 0);
  Promise.resolve().then(() => console.log("B"));
  console.log("C");
  setImmediate(() => console.log("D"));
  process.nextTick(() => console.log("E"));
});
```

**Show a solution**

Terminal on your computer

```bash
$ node predict.js
C
E
B
D
A
```

Synchronous `C` first, then the microtasks (`nextTick` `E`, then the promise `B`), then `setImmediate` `D` after the I/O, and the timer `A` last.

TRY IT YOURSELF

### Check a setting properly

Change `config.js` so that `PORT=abc` stops the program with the message `PORT must be a whole number between 1 and 65535, got "abc"`, instead of starting on port `NaN`.

**Show a solution**

port.jsNode.js only

```ts
const raw = process.env.PORT ?? "3000";
const port = Number(raw);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a whole number between 1 and 65535, got "${raw}"`);
  process.exit(1);
}

console.log(`Port: ${port}`);
```

Output of `node port.js`

```ts
Port: 3000
```

Terminal on your computer

```bash
$ PORT=abc node port.js
PORT must be a whole number between 1 and 65535, got "abc"
```

Every value in `process.env` is text that someone typed. Check it before you trust it, exactly like input from a user.

## Recap

- Node.js is a JavaScript runtime: V8 runs the code, libuv does the waiting, and built-in modules such as `node:fs` and `node:http` reach the computer.
- One thread runs your code. The event loop runs callbacks in order: sync code, microtasks (`nextTick` and promises; at the top of an ES module, promises come first), then I/O, `setImmediate` and timers. Long synchronous work blocks everyone.
- `process.argv` holds the command-line arguments, `process.exitCode` reports success (0) or failure, and `process.cwd()` is where the program was started.
- Settings and secrets come from `process.env`. Load a `.env` file with `node --env-file=.env`, fail loudly when a secret is missing, and never commit `.env`.

Next: [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis), where you use the built-in modules to work with files, paths and the computer itself.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
