---
title: "Events, processes and workers — ZudoJS Academy"
description: "Coordinate a Node.js program with EventEmitter, run other programs as child processes, move heavy work to worker threads, and shut down cleanly on SIGTERM."
source: https://zudojs.oyinlola.site/learn/node-events-processes
---

LEVEL 4 · LESSON 4 OF 21

Node.js Core

# Events, processes and workers

Coordinate a Node.js program with EventEmitter, run other programs as child processes, move heavy work to worker threads, and shut down cleanly on SIGTERM.

- **55 min** to read and try
- **You need:** What Node.js is, Files, paths and your computer, and Streams and buffers
- **You build:** A supervisor that runs an invoice worker in a child process, restarts it after a crash, skips a poison job and shuts down cleanly on SIGTERM

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build services on EventEmitter and avoid its traps: synchronous emit, async listeners, leaked listeners
- Run other programs with execFile and spawn, pass arguments safely and handle exit codes, timeouts and output limits
- Move CPU-heavy JavaScript to a worker thread so the event loop stays responsive
- Handle SIGTERM and SIGINT with a graceful shutdown that finishes in-flight work and has a deadline
- Supervise a child process: detect a crash, restart it and stop retrying a poison job

## One program, four jobs it cannot do alone

Picture the order server of an online shop. A customer pays ₦45,000 for a pair of shoes, and four things have to happen:

1. Several parts of the program must hear about the payment: stock must go down, a receipt e-mail must go out, the analytics counter must go up. The payment code should not have to know about all of them.
2. A PDF invoice has to be made. Your team already has a program that does it, and it is not written in JavaScript.
3. At midnight a sales report adds up ten million orders. That takes a second or more of pure calculation, and while it runs the server must still answer customers.
4. Twice a day a new version is deployed. The hosting platform tells the old server to stop. A payment that is half written to the database must not be cut in the middle.

Each job needs a different Node.js tool: **events** for the first, **child processes** for the second, **worker threads** for the third and **signals** for the fourth. You met plain `EventEmitter` and the `process` object in [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#events) and [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#process). This lesson goes deeper into each tool, shows how it fails, and ends with a small supervisor that uses all of them together.

Every example needs Node.js, so they are marked *Node.js only*. Run them in your `learn-node` folder with `node file.js`.

## EventEmitter in depth

Real Node.js code rarely creates a bare `new EventEmitter()`. It **extends** it: a class does its own job and announces what happened, and other code listens. This is how `http.Server`, streams and child processes work inside Node.js.

order-service.jsNode.js only

```ts
import { EventEmitter } from "node:events";

class OrderService extends EventEmitter {
  #orders = new Map();

  pay(orderId, amount) {
    if (!(amount > 0)) throw new RangeError(`Invalid amount: ${amount}`);
    const order = { orderId, amount, status: "paid" };
    this.#orders.set(orderId, order);
    const heard = this.emit("paid", order);
    console.log(`${orderId} paid, listeners notified: ${heard}`);
    return order;
  }
}

const orders = new OrderService();
orders.pay("ORD-1", 45_000);

orders.on("paid", (order) => console.log(`[stock] reserve items for ${order.orderId}`));
orders.on("paid", (order) => console.log(`[mail] receipt for ₦${order.amount.toLocaleString("en-NG")}`));

orders.pay("ORD-2", 12_500);
console.log("events:", orders.eventNames(), "paid listeners:", orders.listenerCount("paid"));
```

Output of `node order-service.js`

```ts
ORD-1 paid, listeners notified: false
[stock] reserve items for ORD-2
[mail] receipt for ₦12,500
ORD-2 paid, listeners notified: true
events: [ 'paid' ] paid listeners: 2
```

- `emit` returns `true` when at least one listener was called, and `false` when nobody was listening. The first payment happened before anyone subscribed, so nobody heard it. Events are not stored: a listener added later does not see earlier events.
- `eventNames()` and `listenerCount()` let you inspect an emitter, which is useful in tests and when you hunt for leaks.
- `#orders` is a private field: listeners get the order they are given, not the whole store.

### emit is synchronous

This surprises almost everyone. `emit` does not schedule anything. It calls every listener, one after another, *before* it returns. So a listener that throws stops the listeners after it, and the error flies out of `emit` into the code that emitted:

sync-emit.jsNode.js only

```ts
import { EventEmitter } from "node:events";

const orders = new EventEmitter();
orders.on("paid", (order) => console.log(`[stock] reserve items for ${order.orderId}`));
orders.on("paid", () => {
  throw new Error("analytics server unreachable");
});
orders.on("paid", (order) => console.log(`[mail] receipt for ${order.orderId}`));

function pay(orderId) {
  console.log("before emit");
  try {
    orders.emit("paid", { orderId });
  } catch (error) {
    console.log("pay() got the listener's error:", error.message);
  }
  console.log("after emit");
}

pay("ORD-3");
```

Output of `node sync-emit.js`

```ts
before emit
[stock] reserve items for ORD-3
pay() got the listener's error: analytics server unreachable
after emit
```

The customer paid, but no receipt was sent, because the analytics listener failed first. Two rules follow. First, a listener that can fail must catch its own errors: a side job such as analytics should never break the payment. Second, if a listener does slow work, it must not do it synchronously, or every `emit` waits for it.

### Async listeners and captureRejections

So you make the e-mail listener `async`. Now a new problem appears: `emit` ignores the promise the listener returns. If it rejects, nobody is waiting for it, and an unhandled rejection crashes a Node.js program. The option `captureRejections: true` tells the emitter to catch those rejections and turn them into an `"error"` event:

async-listener.jsNode.js only

```ts
import { EventEmitter } from "node:events";

const orders = new EventEmitter({ captureRejections: true });

orders.on("paid", async (order) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  throw new Error(`mail server refused receipt for ${order.orderId}`);
});

orders.on("error", (error) => {
  console.log("[error handler]", error.message);
});

const heard = orders.emit("paid", { orderId: "ORD-4" });
console.log("emit returned", heard, "before the e-mail was even tried");
```

Output of `node async-listener.js`

```ts
emit returned true before the e-mail was even tried
[error handler] mail server refused receipt for ORD-4
```

Without `captureRejections` the same program would end with an unhandled rejection. With it, you still need an `"error"` listener: as you saw in [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#events), an `"error"` event that nobody listens for throws.

### Waiting for one event: events.once

Often you want to *wait* for an event: "continue when the database says ready". The function `once` from `node:events` (not the method) returns a promise. It resolves with an array of the event's arguments, and it rejects if the emitter emits `"error"` first:

wait-once.jsNode.js only

```ts
import { EventEmitter, once } from "node:events";

function connect(shouldFail) {
  const db = new EventEmitter();
  setTimeout(() => {
    if (shouldFail) db.emit("error", new Error("connection refused"));
    else db.emit("ready", "postgres", 5432);
  }, 20);
  return db;
}

const [name, port] = await once(connect(false), "ready");
console.log(`connected to ${name} on port ${port}`);

try {
  await once(connect(true), "ready");
} catch (error) {
  console.log("startup failed:", error.message);
}
```

Output of `node wait-once.js`

```ts
connected to postgres on port 5432
startup failed: connection refused
```

This is the clean way to turn "wait for an event" into `await`, and it is what you will use in tests.

### Removing listeners

`off(name, fn)` (also called `removeListener`) removes a listener, but only when you pass the *same function* you added. An arrow function written inline cannot be removed later, because you have no reference to it:

off.jsNode.js only

```ts
import { EventEmitter } from "node:events";

const stock = new EventEmitter();
const logLow = (item) => console.log(`low stock: ${item}`);

stock.on("low", logLow);
stock.on("low", (item) => console.log(`reorder ${item}`));

stock.off("low", logLow);
stock.off("low", (item) => console.log(`reorder ${item}`));

console.log("listeners left:", stock.listenerCount("low"));
stock.emit("low", "sneakers size 42");
```

Output of `node off.js`

```ts
listeners left: 1
reorder sneakers size 42
```

The second `off` did nothing: it created a new function that looks the same but is a different object. Keep a reference to every listener you plan to remove.

## Listener leaks

REASON IT OUT

### A listener per request

A developer wants each HTTP request to log when the shop's price list is reloaded. Inside the request handler they write `prices.on("reloaded", () => log(requestId))`. The server handles 2,000 requests an hour and restarts once a week. Before reading on, think it through:

- How many listeners does `prices` have after one hour? After a week?
- What does each listener keep alive?
- What happens on the next `"reloaded"` event?
- How would you notice before the server runs out of memory?

**Show the reasoning**

Nothing ever removes the listeners. After one hour there are 2,000; after a week, about 336,000. Each one is a closure, so it keeps its `requestId` and anything else it refers to (maybe the whole request object) alive: the garbage collector can never free them. The next `"reloaded"` event calls all 336,000 functions synchronously, freezing the server. This is a **memory leak**: memory that is still reachable but will never be used again.

Node.js helps you notice. When an emitter gets more than 10 listeners for one event, it prints a warning. Ten is not a hard limit; it is a smoke detector. The fix is to add the listener once, at startup, or to remove it when the request ends.

Here is the warning. It normally goes to stderr; the program also catches it with `process.on("warning")` so you can see its parts:

leak.jsNode.js only

```ts
import { EventEmitter } from "node:events";

class PriceList extends EventEmitter {}
const prices = new PriceList();

process.on("warning", (warning) => {
  console.log(warning.name);
  console.log(warning.message);
});

function handleRequest(requestId) {
  prices.on("reloaded", () => console.log(`request ${requestId} saw new prices`));
}

for (let id = 1; id <= 11; id++) handleRequest(id);
console.log("listeners:", prices.listenerCount("reloaded"));
```

Output of `node leak.js`

```ts
listeners: 11
MaxListenersExceededWarning
Possible EventEmitter memory leak detected. 11 reloaded listeners added to [PriceList]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
```

The warning names the class (`PriceList`), the event and the count. When you see it, do not just raise the limit with `setMaxListeners`. First ask why listeners keep being added. Raise the limit only when many listeners are genuinely expected, such as one per connected WebSocket client that removes itself on disconnect.

> TIP
>
> Browsers use `EventTarget` (`addEventListener`) instead of `EventEmitter`, and Node.js has it too. `addEventListener` accepts `{ signal }`: aborting that signal removes the listener, which is a tidy way to remove many listeners at once. You will use it in [Events](https://zudojs.oyinlola.site/learn/browser-events) (in the browser).

## Events on the process itself

The global `process` is an event emitter too. Its events tell you about the life of the whole program:

| Event | When it fires | What to do in it |
| --- | --- | --- |
| `"exit"` | The process is about to end, for any reason except a kill signal | Synchronous last words only; timers and promises no longer run |
| `"beforeExit"` | The event loop is empty (not after `process.exit()`) | Rarely needed |
| `"uncaughtException"` | A thrown error reached the top with no `catch` | Log it, then exit. The program is in an unknown state |
| `"unhandledRejection"` | A rejected promise had no handler | Log it and exit; since Node.js 15 the default is to crash |
| `"warning"` | Node.js emits a warning, such as the listener leak | Send it to your logs |
| `"SIGTERM"`, `"SIGINT"` | The operating system sends a signal | Start a graceful shutdown (see [Signals](#signals)) |

last-words.jsNode.js only

```ts
process.on("exit", (code) => {
  console.log(`exit event, code ${code}`);
  setTimeout(() => console.log("this never prints"), 0);
});

process.on("unhandledRejection", (reason) => {
  console.log("unhandled rejection:", reason.message);
  process.exitCode = 1;
});

async function chargeCard(amount) {
  throw new Error(`card declined for ₦${amount}`);
}

chargeCard(45_000);
console.log("the main code finished");
```

Output of `node last-words.js`

```ts
the main code finished
unhandled rejection: card declined for ₦45000
exit event, code 1
```

The rejected promise from `chargeCard` had no `await` and no `.catch`, so the handler caught it. The `setTimeout` inside `"exit"` never runs: by then the event loop has stopped. Do not try to save data or send a log over the network in `"exit"`.

> DO NOT KEEP RUNNING AFTER UNCAUGHT ERRORS
>
> It is tempting to add `process.on("uncaughtException", () => {})` so the server "never crashes". Don't. The error stopped some function halfway: a transfer may have left one account and never arrived in the other, a lock may be held forever. The safe response is to log the error, stop taking new work and exit with a non-zero code, and let a supervisor (Docker, systemd, Kubernetes, or the one you build below) start a fresh process.

## Running other programs: child processes

A **child process** is another program your program starts. It runs separately, with its own memory, and your program talks to it through its **standard streams**: stdin (what it reads), stdout (what it prints) and stderr (its errors), plus its exit code. You use one when:

- the job is done by another program: `git`, `ffmpeg` for video, an invoice renderer, a Python script;
- code might crash or hang, and must not take your server down with it;
- you want another Node.js program to run in parallel.

`node:child_process` has four ways to start one:

| Function | Starts | Output | Use it for |
| --- | --- | --- | --- |
| `execFile(file, args)` | The program directly, arguments as an array | Buffered, handed over at the end | Short commands with small output. Your default |
| `spawn(file, args)` | The program directly | Streams, as it arrives | Long-running programs, big output, feeding stdin |
| `exec(command)` | A **shell** (`sh` or `cmd.exe`) that parses one command string | Buffered | Your own fixed shell commands with pipes. Never with user input |
| `fork(modulePath)` | Another Node.js program | Inherited, plus a message channel | Node.js helpers you talk to with messages |

The examples start Node.js itself as the child, with `node -e "code"`, so they work on every computer. `process.execPath` is the full path of the `node` program that is running now, which is safer than hoping `node` is on the `PATH`.

### execFile: run, wait, read the output

render-invoice.jsNode.js only

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const renderer = `
  const [invoiceId, amount] = process.argv.slice(1);
  console.log("rendered " + invoiceId + " for NGN " + amount);
`;

const { stdout, stderr } = await run(process.execPath, ["-e", renderer, "INV-1042", "45000"]);
console.log("stdout:", JSON.stringify(stdout));
console.log("stderr:", JSON.stringify(stderr));
```

Output of `node render-invoice.js`

```ts
stdout: "rendered INV-1042 for NGN 45000\n"
stderr: ""
```

- `promisify(execFile)` turns the callback function into one that returns a promise of `{ stdout, stderr }`. Promisifying came up in [Promises in depth](https://zudojs.oyinlola.site/learn/js-promises).
- The output is text with a trailing newline, exactly as the child printed it. Trim it before you use it.
- With `node -e`, the arguments after the code start at `process.argv[1]`, not `[2]`, because there is no file name.

### Exit codes and failures

A child that ends with a non-zero exit code makes the promise reject. The error carries the code, and the output collected so far:

child-fails.jsNode.js only

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function tryRun(label, code) {
  try {
    await run(process.execPath, ["-e", code]);
    console.log(`${label}: ok`);
  } catch (error) {
    const firstError = error.stderr.split("\n").find((line) => line.startsWith("Error"));
    console.log(`${label}: exit code ${error.code}, ${firstError ?? "no message"}`);
  }
}

await tryRun("renders", "console.log('done')");
await tryRun("printer offline", "throw new Error('printer offline')");
await tryRun("bad input", "console.error('Error: amount missing'); process.exit(2)");
await tryRun("missing program", "require('node:child_process').execFileSync('invoice-pdf-renderer')");
```

Output of `node child-fails.js`

```ts
renders: ok
printer offline: exit code 1, Error: printer offline
bad input: exit code 2, Error: amount missing
missing program: exit code 1, Error: spawnSync invoice-pdf-renderer ENOENT
```

An uncaught error in the child gives exit code 1. A program can choose its own codes, like `2` for bad input, so the parent can tell kinds of failure apart. The last child tried to start a program that does not exist; in the child that is an `ENOENT` error ("no such file"), the same code you met for missing files.

### Timeouts and output limits

A child can hang forever: a renderer waiting for a network drive, a script stuck in a loop. Always set a `timeout`. When it passes, Node.js kills the child (with `SIGTERM` by default) and rejects. The buffered functions also have a `maxBuffer`, 1 MiB of output by default. A child that prints more is killed:

limits.jsNode.js only

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

try {
  await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 300 });
} catch (error) {
  console.log("hung child:", { killed: error.killed, signal: error.signal });
}

try {
  await run(process.execPath, ["-e", "console.log('x'.repeat(5000))"], { maxBuffer: 1024 });
} catch (error) {
  console.log("chatty child:", error.code);
}
```

Output of `node limits.js`

```ts
hung child: { killed: true, signal: 'SIGTERM' }
chatty child: ERR_CHILD_PROCESS_STDIO_MAXBUFFER
```

If you expect a lot of output, such as a log or a generated file, use `spawn` and read it as a stream instead of raising `maxBuffer`.

### Shell injection

REASON IT OUT

### The customer's name goes into a command

Your invoice renderer is a command-line program. A developer builds the command with a template string and runs it with `exec`: `exec(\`render-invoice --name "${customer.name}"\`)`. The name comes from the sign-up form. Think before you read on:

- Who decides what is inside `customer.name`?
- Which program reads the command string before the renderer does?
- Which characters mean something special to that program?

**Show the reasoning**

The customer decides the name, so it is untrusted input. `exec` hands the whole string to a shell, and the shell treats `;`, `&&`, `|`, `$( )`, backticks and quotes as instructions. A name that contains a double quote followed by `;` and more text closes the quoted argument, and the rest becomes a command of the customer's choosing, which runs with your server's permissions. This is **shell injection** (also called command injection). Quoting or escaping by hand is easy to get wrong. The fix is to not use a shell at all: `execFile` and `spawn` pass each argument to the program as a separate value, and no shell ever reads it.

Here is the attack, made harmless: the injected command only prints a line. The example uses `echo`, a command that exists on macOS and Linux:

injection.jsNode.js only

```ts
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const runShell = promisify(exec);
const run = promisify(execFile);

const name = 'Ada"; echo "INJECTED: your server runs my command';

const viaShell = await runShell(`echo "Invoice for ${name}"`);
console.log("exec:    ", viaShell.stdout.trim().split("\n"));

const direct = await run("echo", ["Invoice for", name]);
console.log("execFile:", direct.stdout.trim().split("\n"));
```

Output of `node injection.js`

```ts
exec:     [ 'Invoice for Ada', 'INJECTED: your server runs my command' ]
execFile: [ 'Invoice for Ada"; echo "INJECTED: your server runs my command' ]
```

Through the shell, the name became a second command. With `execFile`, the same text was just an argument, printed as it is. Use `exec` only for fixed commands you wrote yourself, and never pass `{ shell: true }` to `spawn` or `execFile` with user input either.

### spawn: streams in and out

`spawn` gives you the child's streams directly. This child is a pricing program: it reads an order as JSON from stdin, reports progress on stdout line by line, and ends with the total. The parent writes the order, reads the lines as they arrive with `readline` (from [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams#build)), and waits for `"close"`:

pricing.jsNode.js only

```ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

const pricer = `
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    const order = JSON.parse(input);
    let total = 0;
    for (const item of order.items) {
      total += item.price * item.qty;
      console.log("priced " + item.sku);
    }
    console.log("TOTAL " + total);
  });
`;

const child = spawn(process.execPath, ["-e", pricer]);
child.stdin.end(JSON.stringify({ items: [
  { sku: "SHOE-42", price: 45_000, qty: 1 },
  { sku: "SOCK-3", price: 2_500, qty: 3 },
] }));

for await (const line of createInterface({ input: child.stdout })) {
  console.log("child says:", line);
}

const [code, signal] = await once(child, "close");
console.log("closed with code", code, "signal", signal);
```

Output of `node pricing.js`

```ts
child says: priced SHOE-42
child says: priced SOCK-3
child says: TOTAL 52500
closed with code 0 signal null
```

- `child.stdin.end(text)` writes the text and closes the stream, which is how the child knows the input is complete (its `"end"` event).
- `"exit"` fires when the child process ends; `"close"` fires after that, when its streams are also closed. Wait for `"close"` when you read its output, so you never miss the last lines.
- A child that fails to start at all (the program does not exist) emits `"error"`, not `"exit"`. Listen for it, or the error crashes your program.

### fork: a Node.js helper with a message channel

`fork` starts a Node.js file and opens an **IPC channel** (inter-process communication) between the two programs. Each side sends objects with `send` and receives them as `"message"` events; they are converted to JSON and back on the way. Save the helper as `tax-helper.js`:

tax-helper.jsNode.js only

```ts
process.on("message", (order) => {
  const vat = Math.round(order.amount * 0.075);
  process.send({ orderId: order.orderId, vat, total: order.amount + vat });
});
```

fork-tax.jsNode.js only

```ts
import { fork } from "node:child_process";
import { once } from "node:events";

const helper = fork("./tax-helper.js");

for (const order of [{ orderId: "ORD-5", amount: 45_000 }, { orderId: "ORD-6", amount: 12_500 }]) {
  helper.send(order);
  const [reply] = await once(helper, "message");
  console.log(reply);
}

helper.disconnect();
const [code] = await once(helper, "exit");
console.log("helper exited with code", code);
```

Output of `node fork-tax.js`

```json
{ orderId: 'ORD-5', vat: 3375, total: 48375 }
{ orderId: 'ORD-6', vat: 938, total: 13438 }
helper exited with code 0
```

An open IPC channel keeps both programs alive. `disconnect()` closes it, the helper has nothing left to wait for, and it exits by itself with code 0.

## Signals and graceful shutdown

A **signal** is a short message the operating system delivers to a process, identified by a name and a number. You will meet four:

| Signal | Number | Sent when | Can the program handle it? |
| --- | --- | --- | --- |
| `SIGINT` | 2 | You press Ctrl + C in the terminal | Yes |
| `SIGTERM` | 15 | Docker, Kubernetes, systemd or `kill` asks the program to stop | Yes |
| `SIGKILL` | 9 | A stop that cannot be refused, often after SIGTERM was ignored too long | No, the process dies at once |
| `SIGHUP` | 1 | The terminal window was closed | Yes |

If a Node.js program has no listener for SIGINT or SIGTERM, it dies immediately, in the middle of whatever it was doing. A listener replaces that default: the program keeps running until *you* end it. A parent sends a signal to its child with `child.kill(signalName)`:

kill-child.jsNode.js only

```ts
import { spawn } from "node:child_process";
import { once } from "node:events";

async function stop(label, code, signal) {
  const child = spawn(process.execPath, ["-e", code]);
  child.stdout.setEncoding("utf8");
  await once(child.stdout, "data");
  child.kill(signal);
  let said = "";
  child.stdout.on("data", (text) => (said += text));
  const [exitCode, exitSignal] = await once(child, "close");
  console.log(`${label}: code ${exitCode}, signal ${exitSignal}, said ${JSON.stringify(said.trim())}`);
}

const busy = "console.log('ready'); setInterval(() => {}, 1000);";
const polite = `
  const timer = setInterval(() => {}, 1000);
  process.on('SIGTERM', () => { console.log('closing'); clearInterval(timer); });
  console.log('ready');
`;

await stop("no handler, SIGTERM", busy, "SIGTERM");
await stop("no handler, SIGINT ", busy, "SIGINT");
await stop("handler,    SIGTERM", polite, "SIGTERM");
await stop("handler,    SIGKILL", polite, "SIGKILL");
```

Output of `node kill-child.js`

```ts
no handler, SIGTERM: code null, signal SIGTERM, said ""
no handler, SIGINT : code null, signal SIGINT, said ""
handler,    SIGTERM: code 0, signal null, said "closing"
handler,    SIGKILL: code null, signal SIGKILL, said ""
```

- A process killed by a signal has exit code `null` and the signal's name in `signal`. Shells report it as `128 + number`: 130 after Ctrl + C, 143 after SIGTERM, 137 after SIGKILL. You will see 137 in Docker when a container used too much memory.
- The child that listened for SIGTERM said "closing", stopped its timer, and ended normally with code 0 once nothing was left to do.
- SIGKILL ignored the handler completely. That is why your shutdown code must be quick: the platform sends SIGKILL if you take too long (Docker waits 10 seconds, Kubernetes 30 by default).
- The child prints `ready` only *after* it has set up its handler, and the parent waits for that line before sending the signal. When this lesson was written, the first version printed `ready` first and registered the handler one line later. The parent was fast enough to send SIGTERM in between, and the "polite" child died like the others. Always announce readiness last.

### A graceful shutdown

A **graceful shutdown** means: stop taking new work, finish the work in progress, close connections, then exit. And, because "finish" might never happen, give up after a deadline. Here the "server" is a loop that processes payments, each taking a moment, and the program sends itself SIGTERM halfway, the way a deployment would:

graceful.jsNode.js only

```ts
const queue = ["PAY-1", "PAY-2", "PAY-3", "PAY-4", "PAY-5"];
let shuttingDown = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processPayments() {
  while (queue.length > 0 && !shuttingDown) {
    const id = queue.shift();
    console.log(`processing ${id}`);
    await wait(100);
    console.log(`committed ${id}`);
  }
}

function shutdown(signal) {
  if (shuttingDown) {
    console.log(`second ${signal}: exiting now`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`${signal} received: finishing current payment, taking no new ones`);
  setTimeout(() => {
    console.log("shutdown took too long, giving up");
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

setTimeout(() => process.kill(process.pid, "SIGTERM"), 150);

await processPayments();
console.log(`stopped cleanly, ${queue.length} payments left for the next process`);
```

Output of `node graceful.js`

```ts
processing PAY-1
committed PAY-1
processing PAY-2
SIGTERM received: finishing current payment, taking no new ones
committed PAY-2
stopped cleanly, 3 payments left for the next process
```

- The signal arrived while PAY-2 was being processed. PAY-2 was still committed, then the loop stopped taking new ones. Nothing was cut in half, and the remaining payments stay in the queue (in real life, a database table) for the new version.
- The deadline timer is `unref()`ed: an unref'd timer does not keep the process alive by itself, so a quick shutdown exits at once instead of waiting 5 seconds.
- A second Ctrl + C exits immediately. People press it again when they are impatient, and should get what they asked for.
- An HTTP server shuts down the same way: `server.close()` stops accepting connections and calls back when open requests have finished. [Build a plain Node.js Task API](https://zudojs.oyinlola.site/learn/node-task-api#server) uses it.

Here is a real server that handles SIGTERM this way:

shop-server.js

```ts
import http from "node:http";

const server = http.createServer((req, res) => res.end("ok\n"));
server.listen(3000, () => console.log("listening on port 3000"));

process.on("SIGTERM", () => {
  console.log("SIGTERM received: closing the server");
  server.close(() => console.log("all requests finished, bye"));
});
```

Start it in the background with `&`, then stop it with the `kill` command, which sends SIGTERM by default. `$!` is the process id of the last program started in the background:

Terminal on your computer

```bash
$ node shop-server.js &
listening on port 3000
$ kill $!
SIGTERM received: closing the server
all requests finished, bye
[1]+  Done                       node shop-server.js
```

Nothing more had to be done after `server.close()`: once the server and its connections were closed, the event loop was empty and Node.js ended with code 0 by itself. Your terminal also prints a job number and process id right after the first command, such as `[1] 48213`.

> NOTE
>
> Windows has no real signals. Node.js emulates SIGINT for Ctrl + C in a console, and `child.kill()` always ends the child forcefully there, whatever the signal name. Servers usually run on Linux, so write your shutdown for SIGTERM and SIGINT and test it there, for example in Docker.

## Worker threads for heavy work

Back to the midnight sales report. It is pure calculation: no files, no network, just a loop over ten million orders. Making it `async` does not help, because `async` only helps while you wait for something. While JavaScript is calculating, the event loop is busy and every other request waits, as you saw in [Do not block the loop](https://zudojs.oyinlola.site/learn/node-runtime#blocking).

A **thread** is a separate line of execution inside the same process. `node:worker_threads` starts a **worker**: a second JavaScript engine with its own event loop, running a file of your choice on another processor core. The main thread stays free. Save the report as `report-worker.js`:

report-worker.jsNode.js only

```ts
import { parentPort, workerData } from "node:worker_threads";

function salesReport(orderCount) {
  const totals = { card: 0, transfer: 0, cash: 0 };
  const methods = ["card", "transfer", "cash"];
  let seed = 42;
  for (let i = 0; i < orderCount; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const amount = 500 + (seed % 49_500);
    totals[methods[seed % 3]] += amount;
  }
  return totals;
}

parentPort.postMessage(salesReport(workerData.orderCount));
```

The orders are made up with a fixed formula (a seeded pseudo-random generator) so the totals are the same on every run. The main program starts the worker and keeps a heartbeat timer running at the same time, to prove the event loop is still free:

report.jsNode.js only

```ts
import { Worker } from "node:worker_threads";
import { once } from "node:events";

let beats = 0;
const heartbeat = setInterval(() => beats++, 50);

const worker = new Worker(new URL("./report-worker.js", import.meta.url), {
  workerData: { orderCount: 10_000_000 },
});

const [totals] = await once(worker, "message");
clearInterval(heartbeat);

for (const [method, kobo] of Object.entries(totals)) {
  console.log(method.padEnd(9), "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 }));
}
console.log("heartbeat kept beating during the report:", beats >= 3);
```

Output of `node report.js`

```ts
card      ₦839,540,969.29
transfer  ₦841,524,004.44
cash      ₦850,430,935.59
heartbeat kept beating during the report: true
```

- `workerData` is copied into the worker when it starts. `parentPort.postMessage` sends the result back; the main thread receives it as a `"message"` event.
- `new URL("./report-worker.js", import.meta.url)` finds the file next to the current module, wherever you start the program from.
- The heartbeat timer kept firing while ten million orders were added up. Run the same loop on the main thread and `beats` stays 0 until it ends.

### Messages are copies

Workers do not share ordinary objects. Everything you post is copied with the **structured clone** algorithm (the one behind `structuredClone`), and functions cannot be copied at all. A worker that throws emits `"error"` in the main thread, and then `"exit"` with code 1:

worker-copy.jsNode.js only

```ts
import { Worker } from "node:worker_threads";
import { once } from "node:events";

const code = `
  const { parentPort } = require("node:worker_threads");
  parentPort.on("message", (cart) => {
    cart.items.push("changed inside the worker");
    parentPort.postMessage(cart.items.length);
    if (cart.items.length > 2) throw new Error("cart too big for this worker");
  });
`;

const cart = { items: ["SHOE-42"] };
const worker = new Worker(code, { eval: true });

worker.postMessage(cart);
console.log("worker saw", (await once(worker, "message"))[0], "items; main still has", cart.items.length);

try {
  worker.postMessage({ items: ["A", "B"], total() {} });
} catch (error) {
  console.log(error.name + ":", error.message);
}

worker.on("error", (error) => console.log("worker error:", error.message));
const exited = new Promise((resolve) => worker.on("exit", resolve));
worker.postMessage({ items: ["A", "B"] });
console.log("worker exit code:", await exited);
```

Output of `node worker-copy.js`

```ts
worker saw 2 items; main still has 1
DataCloneError: total() {} could not be cloned.
worker error: cart too big for this worker
worker exit code: 1
```

Notice the last lines wait for `"exit"` with a plain promise, not with `once(worker, "exit")`. `once` rejects when the emitter emits `"error"` while it waits, and this worker is *expected* to fail, so `once` would have thrown the worker's error at the `await` and crashed the program. That is what happened when this example was first run.

For very large data, copying costs time. You can **transfer** an `ArrayBuffer` instead (it moves to the worker and becomes unusable in the sender), or share memory with a `SharedArrayBuffer`. Most programs never need either; send small inputs and small results.

### Which tool for which job

| The work is… | Use | Why |
| --- | --- | --- |
| Waiting: database, files, HTTP calls | Plain `async`/`await` | The event loop already handles thousands of waits at once |
| Heavy JavaScript calculation | Worker threads | Runs on another core, cheap to start, fast messages |
| Another program, or code that may crash or leak | Child process | Separate memory; a crash cannot take the parent down |
| A web server that should use every core | Several processes (`node:cluster`, or several containers) | Each process has its own event loop behind one port or a load balancer |

Starting a worker costs several milliseconds and a few megabytes, so busy servers keep a **pool**: a fixed set of workers, usually one per core, that take jobs from a queue. `os.availableParallelism()` tells you how many cores there are.

## The os module for process work

[Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#os) used `node:os` for the platform and memory. A few more parts matter when you manage processes:

machine-for-workers.jsNode.js only

```ts
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const cores = os.availableParallelism();
console.log("worker pool size:", Math.max(1, cores - 1), "(one core left for the main thread)");

const [oneMinute] = os.loadavg();
console.log("load average is a number:", typeof oneMinute === "number");
console.log("uptime in seconds is positive:", os.uptime() > 0);

const { SIGINT, SIGTERM, SIGKILL } = os.constants.signals;
console.log({ SIGINT, SIGTERM, SIGKILL });
console.log("shell exit code after SIGTERM:", 128 + SIGTERM);

const scratch = await mkdtemp(join(os.tmpdir(), "invoices-"));
console.log("private temp folder inside tmpdir:", scratch.startsWith(os.tmpdir()));
await rm(scratch, { recursive: true });
```

Output of `node machine-for-workers.js`

```ts
worker pool size: 7 (one core left for the main thread)
load average is a number: true
uptime in seconds is positive: true
{ SIGINT: 2, SIGTERM: 15, SIGKILL: 9 }
shell exit code after SIGTERM: 143
private temp folder inside tmpdir: true
```

- **Load average** (`os.loadavg()`, macOS and Linux) is the average number of processes wanting a processor over the last 1, 5 and 15 minutes. A value above the number of cores means work is queueing. On Windows it is always `[0, 0, 0]`.
- `os.constants.signals` maps signal names to numbers, which explains the 128 + n exit codes.
- `os.tmpdir()` is the system's temporary folder. `mkdtemp` creates a new, uniquely named folder inside it, the right place for a child process to write intermediate files that you delete afterwards.

## Build: a supervised invoice worker

Now combine the pieces. A **supervisor** is a program whose job is to keep another program running. Yours will:

1. start an invoice worker as a child process with `fork` and send it jobs one at a time;
2. notice when the worker crashes, log the reason and start a new one;
3. give up on a job that crashed the worker twice (a **poison job**) and put it aside, so one bad invoice cannot block all the others;
4. on SIGTERM, let the current job finish, stop the worker and exit cleanly.

The worker renders one invoice per message. An invoice with a negative amount makes it throw, standing in for a bug that crashes a real renderer:

invoice-worker.jsNode.js only

```ts
process.on("message", async (job) => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (job.amount < 0) throw new Error(`cannot render negative amount ${job.amount}`);
  process.send({ type: "done", id: job.id });
});

process.on("SIGTERM", () => {
  process.disconnect();
});

process.send({ type: "ready" });
```

supervisor.jsNode.js only

```ts
import { fork } from "node:child_process";
import { once } from "node:events";

const jobs = [
  { id: "INV-1", amount: 45_000 },
  { id: "INV-2", amount: -500 },
  { id: "INV-3", amount: 12_500 },
  { id: "INV-4", amount: 8_000 },
  { id: "INV-5", amount: 3_000 },
];
const failures = new Map();
const deadLetters = [];
let stopping = false;

function startWorker() {
  const child = fork("./invoice-worker.js", { silent: true });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.lastError = () => stderr.split("\n").find((line) => line.startsWith("Error")) ?? "unknown";
  return child;
}

async function runJob(child, job) {
  child.send(job);
  const reply = once(child, "message").then(([message]) => message);
  const crash = once(child, "exit").then(([code]) => ({ type: "crashed", code }));
  return Promise.race([reply, crash]);
}

process.on("SIGTERM", () => {
  console.log("supervisor: SIGTERM, finishing the current job");
  stopping = true;
});

let worker = startWorker();
await once(worker, "message");
console.log("supervisor: worker", worker.pid > 0 ? "started" : "failed");

while (jobs.length > 0 && !stopping) {
  const job = jobs.shift();
  const result = await runJob(worker, job);
  if (result.type === "done") {
    console.log(`done ${job.id}`);
    if (job.id === "INV-3") process.kill(process.pid, "SIGTERM");
    continue;
  }
  const count = (failures.get(job.id) ?? 0) + 1;
  failures.set(job.id, count);
  console.log(`worker crashed on ${job.id} (exit code ${result.code}): ${worker.lastError()}`);
  if (count >= 2) {
    deadLetters.push(job.id);
    console.log(`giving up on ${job.id} after ${count} crashes`);
  } else {
    jobs.unshift(job);
  }
  worker = startWorker();
  await once(worker, "message");
  console.log("supervisor: worker restarted");
}

worker.kill("SIGTERM");
const [code, signal] = await once(worker, "exit");
console.log(`worker stopped: code ${code}, signal ${signal}`);
console.log("not started:", jobs.map((job) => job.id), "dead letters:", deadLetters);
```

Output of `node supervisor.js`

```ts
supervisor: worker started
done INV-1
worker crashed on INV-2 (exit code 1): Error: cannot render negative amount -500
supervisor: worker restarted
worker crashed on INV-2 (exit code 1): Error: cannot render negative amount -500
giving up on INV-2 after 2 crashes
supervisor: worker restarted
done INV-3
supervisor: SIGTERM, finishing the current job
done INV-4
worker stopped: code 0, signal null
not started: [ 'INV-5' ] dead letters: [ 'INV-2' ]
```

Follow the output line by line:

- `runJob` races two promises: the worker's reply and the worker's exit. Whichever comes first decides the result, so a crash never leaves the supervisor waiting forever for a reply.
- INV-2 crashed the worker twice. The supervisor retried once (a crash can be a fluke), then moved it to `deadLetters`. In a real system a person looks at dead letters; the name comes from the post office's pile of undeliverable mail.
- `{ silent: true }` gives the parent the child's stdout and stderr as streams instead of mixing them into its own output. The supervisor keeps the stderr text to log the first `Error` line.
- After INV-3 the program sends itself SIGTERM, standing in for a deployment. The supervisor finished nothing halfway, left INV-4 and INV-5 for the next run, and stopped the worker with SIGTERM. The worker's handler closed its IPC channel, so it ended normally with code 0.

Real supervisors, such as systemd, Docker's restart policies and Kubernetes, work on the same ideas: watch the exit, restart, back off, and give up after too many crashes in a row. Job queues keep retries and dead letters for you; the ZudoJS lesson [Background jobs](https://zudojs.oyinlola.site/learn/zudo-queue) uses one.

## Failure cases, testing and production

### What goes wrong

- **A listener throws** and the emitting code fails with it, or later listeners never run. Catch errors inside listeners that do side jobs.
- **An async listener rejects** with nobody listening, and the process crashes with an unhandled rejection. Use `captureRejections` plus an `"error"` listener, or catch inside.
- **Listeners leak**, one per request. Watch for `MaxListenersExceededWarning` in your logs.
- **A child never ends**. Always pass a `timeout` or kill it yourself.
- **A child is never started** (`ENOENT`): the program is missing on the server even though it exists on your laptop. Check required programs at startup.
- **Orphans**: when a parent is killed with SIGKILL, its children keep running. Kill children in your shutdown code.
- **Shutdown never finishes** because a connection or timer stays open. The deadline timer turns that into an exit with code 1, which your logs will show.

### Testing

Test events by waiting for them with `once`, and give every wait a deadline so a broken test fails instead of hanging. Test child-process code against a tiny `node -e` child whose behaviour you control, as every example above did. Here is a helper with a timeout, plus a check:

wait-for.jsNode.js only

```ts
import { EventEmitter, once } from "node:events";
import assert from "node:assert/strict";

async function waitFor(emitter, event, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`no "${event}" within ${ms} ms`)), ms);
  try {
    return await once(emitter, event, { signal: controller.signal });
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
  }
}

const orders = new EventEmitter();
setTimeout(() => orders.emit("paid", { orderId: "ORD-7" }), 10);
const [order] = await waitFor(orders, "paid", 500);
assert.equal(order.orderId, "ORD-7");
console.log("PASS paid event arrives");

await assert.rejects(waitFor(orders, "refunded", 50), /no "refunded" within 50 ms/);
console.log("PASS missing event times out");
```

Output of `node wait-for.js`

```ts
PASS paid event arrives
PASS missing event times out
```

`once` accepts an `AbortSignal`; aborting it rejects the wait with a generic `AbortError`, so the helper throws the signal's `reason` instead, which says which event was missing. The `finally` clears the timer so a successful test does not keep the process alive. (`AbortSignal.timeout(ms)` looks shorter, but its timer does not keep the process alive, so a test waiting only on it can end silently with "unsettled top-level await".)

### Production concerns

- **Let the platform restart you.** Exit with a non-zero code on fatal errors, and let Docker, systemd or Kubernetes start a fresh process.
- **Receive the signal.** In Docker, start your server with `CMD ["node", "server.js"]`, not through a shell script, so SIGTERM reaches Node.js. [Deploying a ZudoJS app](https://zudojs.oyinlola.site/learn/deployment) covers containers.
- **Keep shutdown under the grace period**: 10 seconds in Docker, 30 in Kubernetes by default. Put your deadline below it.
- **Limit parallel children and workers.** Starting one per request lets a traffic spike exhaust memory. Use a pool with a fixed size.
- **Log child stderr.** It is where a failing program explains itself.
- **Never build shell commands from input.** `execFile` and `spawn` with an argument array, always.

## Practice

TRY IT YOURSELF

### A stock alert that cleans up after itself

Write a function `watchStock(stock, sku)` that listens for `"low"` events on an emitter, logs only the ones for its `sku`, and returns a function that removes the listener. Show that after calling it, `listenerCount("low")` is 0 again.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Keep a reference to the listener function in a variable, so you can pass that same reference to both `on` and, later, `off`.

HINT 2

`const listener = (item) => { if (item.sku === sku) console.log(...); }; stock.on("low", listener); return () => stock.off("low", listener);`

SOLUTION

watch-stock.jsNode.js only

```ts
import { EventEmitter } from "node:events";

function watchStock(stock, sku) {
  const listener = (item) => {
    if (item.sku === sku) console.log(`${sku} is low: ${item.left} left`);
  };
  stock.on("low", listener);
  return () => stock.off("low", listener);
}

const stock = new EventEmitter();
const stopWatching = watchStock(stock, "SHOE-42");

stock.emit("low", { sku: "SHOE-42", left: 2 });
stock.emit("low", { sku: "SOCK-3", left: 1 });
stopWatching();
stock.emit("low", { sku: "SHOE-42", left: 1 });
console.log("listeners:", stock.listenerCount("low"));
```

Output of `node watch-stock.js`

```ts
SHOE-42 is low: 2 left
listeners: 0
```

The returned function closes over the exact `listener` reference, which is what `off` needs. Returning an "unsubscribe" function is a common pattern; many libraries do the same.

TRY IT YOURSELF

### Check a required program at startup

A server needs Node.js 24 or newer in its child processes. Write `checkNode()` that runs `node --version` with `execFile`, parses the major version and throws a clear error if it is too old. Also show what happens when the program is missing, by running a program name that does not exist.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`stdout.trim().replace(/^v/, "").split(".")[0]` gets you the major version as text; wrap it in `Number(...)`.

HINT 2

`if (major < minMajor) throw new Error(\`${file} ${major} is too old, need ${minMajor}+\`);` then, in the `catch`, check `error.code === "ENOENT"` before rethrowing.

SOLUTION

check-node.jsNode.js only

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function checkProgram(file, minMajor) {
  try {
    const { stdout } = await run(file, ["--version"], { timeout: 5_000 });
    const major = Number(stdout.trim().replace(/^v/, "").split(".")[0]);
    if (major < minMajor) throw new Error(`${file} ${major} is too old, need ${minMajor}+`);
    return `${file}: major version ${major >= minMajor ? "ok" : "too old"}`;
  } catch (error) {
    if (error.code === "ENOENT") return `${file}: not installed`;
    throw error;
  }
}

console.log(await checkProgram(process.execPath, 24).then((text) => text.replace(process.execPath, "node")));
console.log(await checkProgram("invoice-pdf-renderer", 1));
```

Output of `node check-node.js`

```ts
node: major version ok
invoice-pdf-renderer: not installed
```

When the program itself is missing, `execFile` rejects with `error.code === "ENOENT"`, not with an exit code, because nothing ever ran. Checking at startup turns a mystery failure at the first invoice into a clear message when the server boots.

TRY IT YOURSELF

### Split the report across workers

Change the sales report so the main program starts 4 workers, each adding up a quarter of the orders (pass `start` and `end` in `workerData`), and combines the results. To keep it self-contained, use an `eval` worker that sums the numbers from `start` to `end - 1`, and check the combined total against the formula `n * (n - 1) / 2`.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Build `ranges` the same way the worked example built its chunks, with `size` and `parts` in place of `chunk` and `workers`. Inside `runPart`, create the worker with `new Worker(code, { eval: true, workerData: { start, end } })`.

HINT 2

`Array.from({ length: parts }, (_, i) => [i * size, Math.min(n, (i + 1) * size)])`, and `return once(worker, "message").then(([sum]) => sum);`.

SOLUTION

report-pool.jsNode.js only

```ts
import { Worker } from "node:worker_threads";
import { once } from "node:events";

const code = `
  const { parentPort, workerData } = require("node:worker_threads");
  let sum = 0;
  for (let i = workerData.start; i < workerData.end; i++) sum += i;
  parentPort.postMessage(sum);
`;

function runPart(start, end) {
  const worker = new Worker(code, { eval: true, workerData: { start, end } });
  return once(worker, "message").then(([sum]) => sum);
}

const n = 40_000_000;
const parts = 4;
const size = Math.ceil(n / parts);
const ranges = Array.from({ length: parts }, (_, i) => [i * size, Math.min(n, (i + 1) * size)]);
console.log(ranges);

const sums = await Promise.all(ranges.map(([start, end]) => runPart(start, end)));
const total = sums.reduce((a, b) => a + b, 0);
console.log("total:", total, "expected:", (n * (n - 1)) / 2, "match:", total === (n * (n - 1)) / 2);
```

Output of `node report-pool.js`

```json
[
  [ 0, 10000000 ],
  [ 10000000, 20000000 ],
  [ 20000000, 30000000 ],
  [ 30000000, 40000000 ]
]
total: 799999980000000 expected: 799999980000000 match: true
```

`Promise.all` runs the four workers at the same time and waits for all of them. Each part must be independent for this to work: splitting only helps when no part needs another part's result.

## Recap

- Extend `EventEmitter` to announce what a class did. `emit` is synchronous: listeners run before it returns, and a throwing listener stops the rest. Use `captureRejections` for async listeners, and `events.once` to await an event.
- Remove listeners you add per request, with the same function reference. `MaxListenersExceededWarning` is a leak detector, not a limit to raise.
- `process` events: `"exit"` is synchronous only; after `"uncaughtException"` or `"unhandledRejection"`, log and exit.
- Child processes: `execFile` by default, `spawn` for streams, `fork` for Node.js helpers with messages, `exec` only for fixed commands. Set a timeout, handle exit codes and `ENOENT`, and never build a shell command from input.
- SIGINT and SIGTERM can be handled; SIGKILL cannot. A graceful shutdown stops new work, finishes current work and has a deadline.
- Worker threads run heavy JavaScript on another core; messages are copied. Use them for calculation, child processes for other programs and isolation, plain async for waiting.

Next, [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto) hashes passwords, signs webhooks and encrypts data. Its password hash, `scrypt`, is deliberately heavy work, and you will now recognise why Node.js runs it on a background thread instead of the event loop.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
