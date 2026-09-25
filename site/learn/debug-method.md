---
title: "The debugging method — ZudoJS Academy"
description: "Find bugs with a repeatable method: observe, reproduce, isolate, hypothesize, test, fix and verify. Read stack traces, log well and shrink a minimal repro."
source: https://zudojs.oyinlola.site/learn/debug-method
---

LEVEL 4 · LESSON 18 OF 20

Tooling and debugging Core

# The debugging method

Find bugs with a repeatable method: observe, reproduce, isolate, hypothesize, test, fix and verify. Read stack traces, log well and shrink a minimal repro.

- **50 min** to read and try
- **You need:** Why doesn't this work?, Handling errors, How JavaScript runs, and What Node.js is
- **You build:** A full diagnosis of a real pricing bug, a regression test that pins it down, and an automatic test-case shrinker

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Apply observe, reproduce, isolate, hypothesize, test, fix and verify to a bug you have never seen
- Read a Node.js stack trace, including async frames, library frames and cause chains
- Turn a vague bug report into a script that fails every time
- Shrink a failing input to a minimal reproduction, by hand and automatically
- Log values in a way that answers a question instead of flooding the terminal
- Prove a fix with a regression test that fails on the old code

## "Customers are paying ₦666 for ₦17,650 of shopping"

You run the backend of a small grocery shop in Lagos. At 9 a.m. the owner sends you this:

Something is wrong with checkout since yesterday. Order 1042 was two bags of rice and a tin of tomato paste and the customer paid ₦666. Please fix it fast, we are losing money on every order.

There is no error message. Nothing crashed. The server log is clean. You have a vague report, a worried owner, and ten thousand lines of code you did not all write. What do you do first?

Most beginners do one of three things. They read the code from the top, hoping the bug jumps out. They change something that looks suspicious and try again. Or they paste the report into a chat window and ask an AI what is wrong. All three can get lucky. None of them is a *method*: a sequence of steps that finds the bug even when you are not lucky, and that tells you when you are done.

This lesson gives you that method, and you will use it to solve the ₦666 order from start to finish. The method is the same one scientists use, adapted to programs, and it is the central idea of this module. The next two lessons, [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools) and [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice), add power tools and practice, but every tool slots into one step of this method.

You already met the small version of this in [Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken): predict, trace, compare. That works when the bug fits on one screen. Real bugs hide in a large program, depend on data you cannot see, and come with a report written by someone who is not a programmer. The method below scales to those.

## The seven steps

```ts
  observe ──► reproduce ──► isolate ──► hypothesize ──► test ──► fix ──► verify
  what is        make it      make it      one possible     try to     change    the repro
  actually       happen on    small        cause, stated    prove it   the       passes, the
  happening?     purpose                   so it can fail   wrong      cause     test stays
                                                   ▲           │
                                                   └───────────┘
                                          hypothesis wrong: form a new one
```

The debugging method. Hypothesize and test repeat until one hypothesis survives every test you throw at it.

| Step | The question it answers | What you have at the end |
| --- | --- | --- |
| Observe | What exactly happens, and what should happen instead? | Facts: inputs, outputs, error text, time, environment |
| Reproduce | Can I make it happen whenever I want? | A command that shows the bug every time |
| Isolate | What is the smallest thing that still shows it? | A minimal reproduction |
| Hypothesize | What single cause would explain every fact? | A claim that makes a testable prediction |
| Test | Is that prediction true? | A confirmed cause, or a crossed-out one |
| Fix | What change removes the cause? | A small change at the root, not at the symptom |
| Verify | Is it really gone, and did I break anything? | A regression test that failed before and passes now |

Two rules hold the method together:

- **Never skip reproduce.** If you cannot make the bug happen, you cannot tell whether your fix worked. "I changed something and it has not happened again" is not evidence; the bug may simply not have been triggered yet.
- **Change one thing at a time.** If you change three things and the bug disappears, you do not know which change fixed it, or whether the other two broke something else.

## Step 1: observe

**Observing** means collecting facts before you form opinions. A bug report mixes the two. Separate them:

REASON IT OUT

### What do you actually know about order 1042?

Reread the owner's message. Before looking at any code, sort each piece into "fact", "interpretation" or "missing".

- Which statements are facts you can check?
- Which are guesses? ("Something is wrong with checkout" names a place. Is it the right place?)
- What would you ask the owner, or look up in the database, before touching code?
- "Since yesterday": why is that the most valuable phrase in the message?

**Show the reasoning**

**Facts:** order 1042 contained 2 bags of rice and 1 tin of tomato paste, and the customer was charged ₦666. You can check both in the orders table.

**Interpretation:** "something is wrong with checkout". The total is computed at checkout, but the wrong number could come from the cart, the catalogue, a discount, the payment provider or the display. Do not let the report choose the suspect for you.

**Missing:** the *expected* total (what do rice and tomato paste cost?), whether other orders are affected, and which ones. You look them up: rice is ₦8,500 a bag and tomato paste ₦650, so the order should be ₦17,650. Of yesterday's 212 orders, 131 are too low, and all 81 correct ones contain only items under ₦1,000.

**"Since yesterday"** means something changed yesterday. Bugs rarely appear on their own: a deployment, a data import, a configuration change or a dependency update came first. You check: there was no deployment, but yesterday afternoon the owner imported a new price list from the supplier's spreadsheet. That is not proof, but it tells you where to look first.

Good observations are specific and checkable:

| Vague | Observed |
| --- | --- |
| Checkout is broken | Order 1042 was charged ₦666; its items cost ₦17,650 |
| It crashes sometimes | `TypeError: Cannot read properties of undefined (reading 'split')` at `reminder.js:2`, for bookings created without a time |
| It's slow | `GET /orders?page=40` takes 4.1 s; page 1 takes 80 ms |
| It started recently | First bad order at 15:42 yesterday, 3 minutes after the price import |

Also write down the **environment**: the Node.js version, the operating system, the browser, which server, which user account. Many bugs only exist in one environment, and [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice#works-on-my-machine) hunts several of them.

When there *is* an error, the most important observation is usually the stack trace, so it gets its own section.

## Reading stack traces properly

[Reading a stack trace](https://zudojs.oyinlola.site/learn/js-scope#stack-trace) showed the basic shape: the error, then the call stack at the moment it was thrown, most recent call first, and [How JavaScript runs](https://zudojs.oyinlola.site/learn/js-execution#stack-traces) explained how V8 records it. Here the goal is to *use* a trace to find a bug, and real traces have more in them. Here is a receipt printer that crashes on the second order:

receipt.jsNode.js only

```ts
const orders = [
  { id: 1041, customer: "Ada", items: [{ name: "Rice 5kg", price: 850000, quantity: 2 }] },
  { id: 1042, customer: "Bola", lineItems: [{ name: "Eggs (crate)", price: 240000, quantity: 1 }] },
];

function orderTotal(order) {
  return order.items
    .map((item) => item.price * item.quantity)
    .reduce((sum, n) => sum + n, 0);
}

function receiptLine(order) {
  return `#${order.id} ${order.customer}: ${orderTotal(order)} kobo`;
}

for (const order of orders) {
  console.log(receiptLine(order));
}
```

Terminal (a real run; your folder name will differ)

```bash
$ node receipt.js
#1041 Ada: 1700000 kobo
file:///home/you/shop/receipt.js:8
    .map((item) => item.price * item.quantity)
     ^

TypeError: Cannot read properties of undefined (reading 'map')
    at orderTotal (file:///home/you/shop/receipt.js:8:6)
    at receiptLine (file:///home/you/shop/receipt.js:13:45)
    at file:///home/you/shop/receipt.js:17:15
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
```

Each `at` line is a **frame**: one function call that was still running. Its parts are the function name, then the file, the line and the column. Read it like this:

1. **The error type and message** are the first observation. `TypeError` plus `reading 'map'` means: something tried to read a property called `map` from `undefined`. So the question is not "why does map fail?" but "why is the thing before `.map` undefined?".
2. **The code frame** at the top (the source line with a `^` under it) points at the exact column. Here it points at `.map`, on the line after `return order.items`, because the expression spans two lines.
3. **The first frame in your own code** is where to start looking: `orderTotal`, line 8. The value on the left of `.map` is `order.items`.
4. **Walk down the stack** to find where the bad value came from: `receiptLine` passed the order in, and the loop at line 17 got it from the `orders` array. The data for order 1042 has `lineItems`, not `items`.
5. **Skip `node:internal` frames**. They are Node.js starting your module; they are the same in every program.

The line that throws is rarely the line that is wrong. The crash is on line 8; the mistake is in the data (or in whatever produced it). The stack trace tells you where to *start*, not where to stop.

### Frames you did not write

Often the top frame is not your code at all. Here the settings file has a trailing comma, which JSON does not allow:

settings.json

```json
{
  "name": "Mama Put",
  "currency": "NGN",
}
```

load.jsNode.js only

```ts
import { readFile } from "node:fs/promises";

async function loadSettings(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

async function startShop() {
  const settings = await loadSettings("./settings.json");
  console.log(`Shop ${settings.name} open`);
}

await startShop();
```

Terminal (a real run)

```bash
$ node load.js
<anonymous_script>:4
}
^

SyntaxError: Expected double-quoted property name in JSON at position 45 (line 4 column 1)
    at JSON.parse (<anonymous>)
    at loadSettings (file:///home/you/shop/load.js:5:15)
    at async startShop (file:///home/you/shop/load.js:9:20)
    at async file:///home/you/shop/load.js:13:1

Node.js v24.19.0
```

- The top frame, `JSON.parse (<anonymous>)`, is built into the engine; `<anonymous_script>:4` is line 4 *of the JSON text*, not of any file you wrote. The same goes for frames inside `node_modules`: a library threw because your code gave it something it could not handle. Walk down to your first frame, `loadSettings`, and ask what you passed in.
- `at async startShop`: the word `async` marks a frame that was waiting at an `await`. V8 (the JavaScript engine inside Node.js and Chrome) records these **async stack traces** so that you can still see who awaited whom, even though the original call stack was gone while the file was being read.

### Traces that leave out the caller

Async frames only exist for `await`. A callback run later by a timer, an event or a callback-style API starts on a fresh stack, and the code that *scheduled* it is not in the trace:

reminder.jsNode.js only

```ts
function sendReminder(booking) {
  const hour = booking.time.split(":")[0];
  console.log(`Reminder for ${booking.name} at ${hour}h`);
}

function scheduleReminders(bookings) {
  for (const booking of bookings) {
    setTimeout(() => sendReminder(booking), 10);
  }
}

scheduleReminders([
  { name: "Ada", time: "09:30" },
  { name: "Bola" },
]);
```

Terminal (a real run)

```bash
$ node reminder.js
Reminder for Ada at 09h
file:///home/you/shop/reminder.js:2
  const hour = booking.time.split(":")[0];
                            ^

TypeError: Cannot read properties of undefined (reading 'split')
    at sendReminder (file:///home/you/shop/reminder.js:2:29)
    at Timeout._onTimeout (file:///home/you/shop/reminder.js:8:22)
    at listOnTimeout (node:internal/timers:635:17)
    at process.processTimers (node:internal/timers:571:7)

Node.js v24.19.0
```

`scheduleReminders` and the top level of the file are missing: by the time the timer fired, they had long finished. The trace says "a timer called this", and you have to reason back to where the timer was set. In a big program, that is a good moment for a log line at the place where work is scheduled, including what it was scheduled *for* (the booking id).

### Cause chains

When you catch a low-level error and throw a clearer one, pass the original as `cause` (covered in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors)). Node.js prints the whole chain, so neither the high-level meaning nor the low-level detail is lost:

cause.jsNode.js only

```ts
import { readFile } from "node:fs/promises";

async function loadOrder(id) {
  try {
    const text = await readFile(`./orders/${id}.json`, "utf8");
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not load order ${id}`, { cause: error });
  }
}

await loadOrder(1042);
```

Terminal (a real run)

```bash
$ node cause.js
file:///home/you/shop/cause.js:8
    throw new Error(`Could not load order ${id}`, { cause: error });
          ^

Error: Could not load order 1042
    at loadOrder (file:///home/you/shop/cause.js:8:11)
    at async file:///home/you/shop/cause.js:12:1 {
  [cause]: Error: ENOENT: no such file or directory, open './orders/1042.json'
      at async open (node:internal/fs/promises:697:25)
      at async readFile (node:internal/fs/promises:1348:14)
      at async loadOrder (file:///home/you/shop/cause.js:5:18)
      at async file:///home/you/shop/cause.js:12:1 {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: './orders/1042.json'
  }
}

Node.js v24.19.0
```

Read the outer error for *what* failed (loading order 1042) and the `[cause]` for *why* (the file does not exist, `ENOENT`). The `path` shows a relative path: the program looked in `./orders` relative to the folder it was started from, which is a classic "works when I run it from the project root" bug.

### Throw errors, not strings

The stack is recorded when an `Error` object is *created*. Throw anything else and there is no stack at all. In an ES module, Node.js cannot even tell you which line threw:

string-throw.js

```ts
function withdraw(balance, amount) {
  if (amount > balance) throw "Insufficient funds";
  return balance - amount;
}
withdraw(5000, 8000);
```

Terminal (a real run)

```bash
$ node string-throw.js

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Insufficient funds
(Use `node --trace-uncaught ...` to show where the exception was thrown)

Node.js v24.19.0
```

No file name, no line, no function. Always `throw new Error("Insufficient funds")` (or a subclass), so the next person who debugs it gets a trace.

### Stack traces in code

When you catch an error, `error.stack` is the same text as a string. You can log it, or pull the frames out. This helper keeps only the frames from your own files and shortens their paths:

frames.jsNode.js only

```ts
function ownFrames(error) {
  return error.stack
    .split("\n")
    .filter((line) => line.trim().startsWith("at ") && !line.includes("node:"))
    .map((line) => line.trim().replace(/file:\/\/\S*\/([^/]+:\d+:\d+)/, "$1"));
}

function applyCoupon(order, coupon) {
  return order.total - coupon.amount;
}

function checkout(order) {
  return applyCoupon(order, order.coupon);
}

try {
  checkout({ id: 1043, total: 500000 });
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
  for (const frame of ownFrames(error)) console.log("  " + frame);
}
```

Output of `node frames.js`

```ts
TypeError: Cannot read properties of undefined (reading 'amount')
  at applyCoupon (frames.js:9:31)
  at checkout (frames.js:13:10)
  at frames.js:17:3
```

Three frames, newest first: `applyCoupon` read `.amount` from `undefined`, `checkout` passed it `order.coupon`, and the top level passed an order without a coupon. The fix belongs in `checkout` (an order without a coupon is normal), not in the line that crashed.

How many frames are recorded is set by `Error.stackTraceLimit`, which is 10 by default in V8. Deep recursion or a long middleware chain can push the interesting frames off the bottom. For one debugging session you can raise it with `node --stack-trace-limit=50 app.js`:

limit.jsNode.js only

```ts
function depth(n) {
  if (n === 0) throw new Error("bottom");
  return depth(n - 1);
}

for (const limit of [10, 3, 50]) {
  Error.stackTraceLimit = limit;
  try {
    depth(30);
  } catch (error) {
    const frames = error.stack.split("\n").filter((l) => l.trim().startsWith("at "));
    console.log(`limit ${limit}: ${frames.length} frames recorded`);
  }
}
```

Output of `node limit.js`

```ts
limit 10: 10 frames recorded
limit 3: 3 frames recorded
limit 50: 35 frames recorded
```

With a limit of 50, all 35 frames are kept: the 31 calls of `depth`, the top level, and a few Node.js frames. With the default 10, the top level of the file, the one frame that says who started the recursion, is cut off.

## Step 2: reproduce

A **reproduction** ("repro") is a way to make the bug happen on purpose, every time. The best repro is a single command that prints the wrong result or fails an assertion. Once you have one, the bug stops being a story and becomes a fact you can experiment on.

For order 1042 you copy the relevant code into a file: the price import and the order total, with the real rows from yesterday's spreadsheet. The code is the shop's real code; only the data is typed in:

repro-1042.js

```ts
function parsePrice(text) {
  const naira = parseFloat(text.replace("₦", ""));
  return Math.round(naira * 100);
}

function importCatalogue(rows) {
  const catalogue = new Map();
  for (const row of rows) catalogue.set(row.sku, { name: row.name, priceKobo: parsePrice(row.price) });
  return catalogue;
}

function orderTotalKobo(order, catalogue) {
  let total = 0;
  for (const line of order.lines) total += catalogue.get(line.sku).priceKobo * line.quantity;
  return total;
}

const supplierRows = [
  { sku: "RICE-5", name: "Rice 5kg", price: "₦8,500.00" },
  { sku: "TOM-400", name: "Tomato paste 400g", price: "₦650.00" },
  { sku: "EGG-30", name: "Eggs (crate)", price: "₦2,400.00" },
];

const order1042 = { id: 1042, lines: [{ sku: "RICE-5", quantity: 2 }, { sku: "TOM-400", quantity: 1 }] };

const catalogue = importCatalogue(supplierRows);
console.log("charged: ₦" + orderTotalKobo(order1042, catalogue) / 100);
console.log("expected: ₦17650");
```

Output of `node repro-1042.js` and of the browser terminal

```ts
charged: ₦666
expected: ₦17650
```

₦666, the same wrong number as in production. The bug is reproduced. That matching number is important: a repro that fails *differently* from production may be a different bug.

### Make the repro check itself

A repro that prints a number needs you to remember what the right number is. A repro that *asserts* it fails loudly on its own, and later becomes your regression test. `node:assert` is built into Node.js:

repro-assert.jsNode.js only

```ts
import assert from "node:assert/strict";

function parsePrice(text) {
  const naira = parseFloat(text.replace("₦", ""));
  return Math.round(naira * 100);
}

try {
  assert.equal(parsePrice("₦650.00"), 65000);
  console.log("PASS ₦650.00");
  assert.equal(parsePrice("₦8,500.00"), 850000);
  console.log("PASS ₦8,500.00");
} catch (error) {
  console.log(error.message);
}
```

Output of `node repro-assert.js`

```ts
PASS ₦650.00
Expected values to be strictly equal:

800 !== 850000
```

### When a bug will not reproduce

Sometimes your repro prints the right answer and production does not. Then the difference between the two *is* the bug, and your job becomes finding that difference. List what could differ and bring your repro closer to production one item at a time:

- **Data**: are you using the real rows, or ones you typed from memory? Copy the exact input, including spaces, currency signs and empty fields.
- **Environment**: Node.js version, time zone (`TZ`), locale, environment variables, operating system.
- **Timing and order**: two requests at once, a slow network, a cache that was warm or cold.
- **State**: a database row, a file, a feature flag, a logged-in user with different permissions.

Bugs that only appear with the right timing are the hardest to reproduce. [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice#race) makes one reproduce on demand by controlling the timing.

## Step 3: isolate

**Isolating** means shrinking the repro until everything left in it is needed to show the bug. The result is a **minimal reproduction**: the smallest program, with the smallest input, that still fails. Two things shrink: the input and the code.

### Shrink the input

Order 1042 has two lines. Which one is wrong? Check each item's imported price against the spreadsheet:

isolate-items.js

```ts
function parsePrice(text) {
  const naira = parseFloat(text.replace("₦", ""));
  return Math.round(naira * 100);
}

const rows = [
  { sku: "RICE-5", price: "₦8,500.00" },
  { sku: "TOM-400", price: "₦650.00" },
  { sku: "EGG-30", price: "₦2,400.00" },
  { sku: "SALT-1", price: "₦350.00" },
];

for (const row of rows) {
  const kobo = parsePrice(row.price);
  console.log(`${row.sku.padEnd(8)} ${row.price.padEnd(10)} -> ${kobo} kobo`);
}
```

Output of `node isolate-items.js` and of the browser terminal

```ts
RICE-5   ₦8,500.00  -> 800 kobo
TOM-400  ₦650.00    -> 65000 kobo
EGG-30   ₦2,400.00  -> 200 kobo
SALT-1   ₦350.00    -> 35000 kobo
```

Now the bug is one function and one input: `parsePrice("₦8,500.00")` gives 800 kobo (₦8). The order, the cart, the checkout and the database are no longer involved. You have removed 99% of the program from suspicion in two small steps.

### Shrink automatically

When the failing input is large (a 5,000-line CSV, a 300-item cart), shrink it with code instead of by hand. The idea: remove a piece; if the bug is still there, keep it removed; otherwise put it back. Repeat until no single piece can be removed. This one takes a list and a function that says whether the bug still happens:

shrink.js

```ts
function shrink(items, stillFails) {
  let current = items;
  let removedOne = true;
  while (removedOne) {
    removedOne = false;
    for (let i = 0; i < current.length; i++) {
      const smaller = [...current.slice(0, i), ...current.slice(i + 1)];
      if (stillFails(smaller)) {
        current = smaller;
        removedOne = true;
        break;
      }
    }
  }
  return current;
}

// A cart total that goes wrong on some input we do not understand yet.
function cartTotal(cart) {
  let total = 0;
  for (const line of cart) total += line.subtotal;
  return total;
}
const expected = (cart) => cart.reduce((sum, line) => sum + Number(line.subtotal), 0);

const cart = [];
for (let i = 1; i <= 40; i++) cart.push({ sku: `SKU-${i}`, subtotal: 1000 * i });
cart[26].subtotal = "27000";   // one line was edited in a form, and came back as text

const fails = (c) => cartTotal(c) !== expected(c);
console.log("full cart fails:", fails(cart), "lines:", cart.length);
const minimal = shrink(cart, fails);
console.log("minimal cart:", minimal);
console.log("cartTotal:", cartTotal(minimal), "expected:", expected(minimal));
```

Output of `node shrink.js` and of the browser terminal

```ts
full cart fails: true lines: 40
minimal cart: [ { sku: 'SKU-27', subtotal: '27000' } ]
cartTotal: 027000 expected: 27000
```

Forty lines became one, and the one that is left points straight at the difference: its `subtotal` is the text `"27000"`, and `cartTotal` returns something that is not the number 27000. Nothing about the other 39 lines matters. Test frameworks do this for you: property-based testing libraries such as fast-check (used in [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies)) shrink every failing input they find.

Shrinking does not explain the bug; it hands you the smallest thing to explain. Exercise 1 asks you to finish the job.

### Shrink the code

The same idea works on code. Delete or bypass half of what the failing path does (the database call, the logging, the discount step) and replace it with fixed values. If the bug survives, that half was innocent. If it disappears, the bug is in that half: put it back and remove something else. This is binary search over your own program, and [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice#bisect) does the same over your Git history.

A minimal reproduction is also the best thing you can hand to someone else: a colleague, the maintainers of a library, an issue tracker, or an AI assistant. Very often, the act of making it minimal shows you the bug before you ever send it.

## Steps 4 and 5: hypothesize, then test

A **hypothesis** is a possible cause, stated so that it predicts something you can check. "The price parser is buggy" is too vague to test. Compare:

parseFloat stops reading at the first character that is not part of a number, so "8,500.00" is read as 8. If that is the cause, then every price of ₦1,000 or more (the ones with a thousands comma) is wrong, and every price below ₦1,000 is right.

That hypothesis makes two predictions, and each one could turn out false. That is what makes it useful. A good test is one designed to *disprove* the hypothesis: if it survives, you trust it more.

REASON IT OUT

### Design the experiments

Before running anything, decide:

- What single-line experiment confirms or kills the claim about `parseFloat`?
- Which prices would prove the hypothesis *wrong* if they came out correct, or wrong?
- Is there a boundary case the hypothesis makes a sharp prediction about?
- What other explanation also fits "only expensive items are wrong"? How would you tell the two apart?

**Show the reasoning**

**Direct experiment:** call `parseFloat` on the text with and without the comma. If it gives 8 and 8500, the mechanism is confirmed.

**Disproving cases:** a price under ₦1,000 that comes out wrong would kill the hypothesis (the comma is not the only problem). So would a price with a comma that comes out right.

**Boundary:** ₦999.99 must be right and ₦1,000.00 must be wrong (it becomes ₦1). A price over a million, ₦1,250,000.00, has two commas and should become ₦1.

**Rival explanation:** "a discount rule for expensive items is misfiring". It also predicts only expensive items are wrong, but it predicts the *imported catalogue* is correct and the total is wrong. The isolate step already showed the catalogue itself holds 800 kobo for rice, so the discount theory is dead before you test it. Isolating first saves you from chasing theories the data already rules out.

experiments.js

```ts
console.log(parseFloat("8,500.00"), parseFloat("8500.00"));
console.log(Number("8,500.00"));

function parsePrice(text) {
  const naira = parseFloat(text.replace("₦", ""));
  return Math.round(naira * 100);
}

for (const text of ["₦999.99", "₦1,000.00", "₦1,250,000.00", "₦50.00"]) {
  console.log(text.padEnd(14), parsePrice(text));
}
```

Output of `node experiments.js` and of the browser terminal

```ts
8 8500
NaN
₦999.99        99999
₦1,000.00      100
₦1,250,000.00  100
₦50.00         5000
```

Every prediction came true: under ₦1,000 is right, ₦1,000 and above loses everything after the first comma. The hypothesis is confirmed. `Number(...)`, by contrast, refuses the whole string and returns `NaN`. Remember that for the fix.

### Keep a debugging log

On a hard bug you will test several hypotheses. Write each one down with its result, even the dead ones, in a text file or in the issue. It stops you from testing the same idea twice, and it is exactly what a colleague needs if you hand the bug over.

| # | Hypothesis | Prediction | Test | Result |
| --- | --- | --- | --- | --- |
| 1 | Discount rule misfires on big orders | Catalogue prices correct | Print imported prices | Dead: rice is 800 kobo in the catalogue |
| 2 | Payment provider rounds wrongly | Our computed total is right | Run the total locally | Dead: we compute ₦666 ourselves |
| 3 | `parseFloat` stops at the comma | All prices ≥ ₦1,000 wrong, all below right | Boundary prices | Confirmed |

## Logging that answers a question

Most of the experiments above were `console.log` calls. Logging is the most-used debugging tool in the world, and it works best when each log line answers a specific question from your hypothesis, instead of printing everything and hoping.

### Label everything

An unlabelled number in a sea of output is useless. Put the values in an object literal: the variable names become labels for free:

labels.js

```ts
const item = { sku: "RICE-5", priceKobo: 800 };
const quantity = 2;
const lineTotal = item.priceKobo * quantity;

console.log(lineTotal);
console.log({ sku: item.sku, quantity, lineTotal });
```

Output of `node labels.js` and of the browser terminal

```ts
1600
{ sku: 'RICE-5', quantity: 2, lineTotal: 1600 }
```

### Print the value, not your idea of it

`console.log` in Node.js uses `util.inspect`, which shows strings with quotes, `undefined` fields, `Map`s and nested objects as they really are. `JSON.stringify` hides several of those, so it can make a bug invisible:

honest-print.js

```ts
const line = { sku: "RICE-5", price: "8500", discount: undefined, tags: new Map([["promo", true]]) };

console.log(JSON.stringify(line));
console.log(line);
console.log(`price is ${line.price}, a ${typeof line.price}`);
```

Output of `node honest-print.js` and of the browser terminal

```json
{"sku":"RICE-5","price":"8500","tags":{}}
{
  sku: 'RICE-5',
  price: '8500',
  discount: undefined,
  tags: Map(1) { 'promo' => true }
}
price is 8500, a string
```

The JSON line hides three facts: the price is text (`"8500"` looks numeric once quotes are everywhere), `discount` exists but is `undefined`, and the tags are a Map, not an empty object. When the question is "what type is it?", print `typeof`.

> Logged objects in the browser are live
>
> In the browser console, a logged object is shown collapsed, and when you expand it you see its values *at the moment you click*, not when it was logged. If the code changed the object in between, the log lies. Log a copy (`structuredClone(order)`) or the specific fields. Node.js prints the object as text immediately, so it does not have this problem.

### Console methods that save time

console-tools.js

```ts
const stock = { "RICE-5": 3 };
const orders = [
  { id: 1, sku: "RICE-5", quantity: 2 },
  { id: 2, sku: "RICE-5", quantity: 2 },
];

for (const order of orders) {
  console.count("orders processed");
  stock[order.sku] -= order.quantity;
  console.assert(stock[order.sku] >= 0, `stock of ${order.sku} went negative after order ${order.id}:`, stock[order.sku]);
}
```

Output of `node console-tools.js` and of the browser terminal

```ts
orders processed: 1
orders processed: 2
Assertion failed: stock of RICE-5 went negative after order 2: -1
```

- `console.count(label)` counts how often a line runs: is the loop running as many times as you think?
- `console.assert(condition, ...)` prints only when the condition is false. It lets you leave a check in a hot loop that stays silent until the one iteration that matters.
- `console.table(rows)` prints an array of objects as a table, which is easier to scan than forty lines of objects; `console.dir(obj, { depth: null })` prints every level of a deeply nested object instead of `[Object]`.
- `console.trace("label")` prints the current stack without throwing: the answer to "who is calling this function with the wrong value?".

trace-caller.jsNode.js only

```ts
function reserveStock(sku, quantity) {
  if (quantity <= 0) {
    const caller = new Error().stack.split("\n")[2].trim().replace(/\(.*\//, "(");
    console.log(`reserveStock(${sku}, ${quantity}) called ${caller}`);
  }
  return quantity;
}

function addToCart(sku, quantity) {
  return reserveStock(sku, quantity);
}

function applyBulkEdit(lines) {
  for (const line of lines) addToCart(line.sku, line.newQuantity - line.oldQuantity);
}

applyBulkEdit([{ sku: "RICE-5", oldQuantity: 1, newQuantity: 3 }, { sku: "EGG-30", oldQuantity: 2, newQuantity: 1 }]);
```

Output of `node trace-caller.js`

```ts
reserveStock(EGG-30, -1) called at addToCart (trace-caller.js:10:10)
```

This is a hand-made `console.trace` that prints only the calling frame, and only for the bad value. The negative quantity came from `addToCart`, and one more frame down you would find `applyBulkEdit` passing a *difference* where a quantity was expected.

### Logs that stay in the code

Debugging logs you add for one bug should come out again before you commit; otherwise the next person drowns in them. Logs that are useful every day belong in the program for good, and those should be **structured**: one line per event, with a fixed event name and the ids you need to find related lines later:

structured.js

```ts
function log(event, fields) {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

log("catalogue.import.row", { sku: "RICE-5", raw: "₦8,500.00", priceKobo: 800 });
log("order.total", { orderId: 1042, lines: 2, totalKobo: 66600 });
```

Output of `node structured.js` and of the browser terminal

```json
{"level":"info","event":"catalogue.import.row","sku":"RICE-5","raw":"₦8,500.00","priceKobo":800}
{"level":"info","event":"order.total","orderId":1042,"lines":2,"totalKobo":66600}
```

With the raw text and the parsed value side by side in the import log, the bug would have been visible in the log of yesterday's import, with no reproduction needed. Here JSON is fine, because you chose the fields and made them plain values. [Structured logging](https://zudojs.oyinlola.site/learn/zudo-logging) in the ZudoJS course builds a full logger on the same idea.

For temporary debug output that you want to switch on without editing code, read an environment variable once: `const debug = process.env.DEBUG_PRICES ? console.error : () => {};`. Then `DEBUG_PRICES=1 node import.js` prints the details and a normal run stays quiet.

## Step 6: fix the cause

You could "fix" order 1042 by correcting the rice price in the database. That fixes one symptom. The next import breaks it again. You could also fix `parsePrice` by removing the first comma with `replace(",", "")`. That fixes this input and fails on ₦1,250,000.00, which has two. The **root cause** is that the parser silently accepts text it does not understand. The fix should make it understand every valid format and *refuse* everything else:

price.js

```ts
const PRICE = /^₦?(\d{1,3}(,\d{3})*|\d+)(\.\d{2})?$/;

export function parsePrice(text) {
  const trimmed = text.trim();
  if (!PRICE.test(trimmed)) throw new Error(`Unrecognised price format: "${text}"`);
  const [naira, kobo = "00"] = trimmed.replace("₦", "").replaceAll(",", "").split(".");
  return Number(naira) * 100 + Number(kobo);
}
```

price-check.js

```ts
import { parsePrice } from "./price.js";

for (const text of ["₦8,500.00", "₦650.00", "₦1,250,000.00", "650", " ₦2,400.50 "]) {
  console.log(JSON.stringify(text).padEnd(17), parsePrice(text));
}
for (const text of ["N8,500.00", "8.500,00", "₦85,00.00", ""]) {
  try {
    parsePrice(text);
  } catch (error) {
    console.log(error.message);
  }
}
```

Output of `node price-check.js` and of the browser terminal

```ts
"₦8,500.00"       850000
"₦650.00"         65000
"₦1,250,000.00"   125000000
"650"             65000
" ₦2,400.50 "     240050
Unrecognised price format: "N8,500.00"
Unrecognised price format: "8.500,00"
Unrecognised price format: "₦85,00.00"
Unrecognised price format: ""
```

Three decisions in this fix:

- **Validate the whole shape** with a regular expression: optional ₦, digits in groups of three separated by commas (or plain digits), and optional two-digit kobo. `"₦85,00.00"` has a comma in the wrong place, so it is refused instead of guessed.
- **No floating point.** Naira and kobo are converted as separate whole numbers, so `2400.50` becomes exactly 240050 kobo (see [money as whole kobo](https://zudojs.oyinlola.site/learn/logic-math#kobo)).
- **Fail loudly.** A European-formatted `"8.500,00"` now stops the import with a message naming the bad text. A stopped import is annoying; a silently wrong catalogue cost the shop real money.

## Step 7: verify

Verifying has three parts. First, the original repro now gives the right answer. Second, a **regression test**, a test that pins the bug down so that it can never come back unnoticed, fails on the old code and passes on the new. Third, check the damage: which data did the bug already corrupt?

verify.jsNode.js only

```ts
import assert from "node:assert/strict";
import { parsePrice } from "./price.js";

const cases = [
  ["₦8,500.00", 850000],
  ["₦650.00", 65000],
  ["₦999.99", 99999],
  ["₦1,000.00", 100000],
  ["₦1,250,000.00", 125000000],
];

for (const [text, kobo] of cases) {
  assert.equal(parsePrice(text), kobo, text);
}
assert.throws(() => parsePrice("8.500,00"), /Unrecognised price format/);
console.log(`${cases.length + 1} regression checks pass`);

const order1042 = 2 * parsePrice("₦8,500.00") + parsePrice("₦650.00");
console.log("order 1042 should cost ₦" + order1042 / 100);
```

Output of `node verify.js`

```ts
6 regression checks pass
order 1042 should cost ₦17650
```

In a real project these cases live in a test file and run with your test runner on every change ([Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics)); the idea is the same.

To prove the test catches the bug, run it once against the *old* `parsePrice`. A regression test that also passes on the buggy code tests nothing. You saw the old code fail exactly this way in the [repro with assertions](#reproduce).

Then the damage. The fixed parser is run over yesterday's spreadsheet and compared with what the catalogue holds; every product priced ₦1,000 or more gets corrected. The 131 underpaid orders are a business decision for the owner, not a code change, but you give them the exact list, because your debugging log already says how to find them: imported after 15:39, containing any item at ₦1,000 or more.

Finally, ask why nothing caught it sooner. The import had no validation and no sanity check ("rice dropped from ₦8,500 to ₦8, a 99.9% change: are you sure?"). Asking "why" several times, until you reach something you can change in the process, is **root-cause analysis**, and [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice#rca) does it properly with the "5 whys".

## Debug before you ask

You could have pasted the owner's message into an AI assistant. It would have produced a confident list of possible causes: payment rounding, discount rules, currency conversion, caching. Each is plausible. None is based on your data, because the assistant cannot see your data. Its answer is a list of hypotheses, and you would still have to test every one of them, which is steps 4 and 5 of the method.

That is the real reason to learn to debug without asking first. The expensive part of debugging is not guessing causes; it is *observing* the program and *testing* guesses. Those need your runtime values, your logs, your data and your environment. They are skills, and they grow only by practice. A developer who has only ever pasted errors into a chat window is stuck the first time the answer is wrong, the bug has no error message, or the code cannot be shared.

So here is a working rule:

1. Work through observe, reproduce and isolate yourself. Timebox it: 30 to 60 minutes on your own before you ask anyone, person or AI.
2. When you do ask, send the minimal reproduction, what you expected, what happened, and the hypotheses you already ruled out. Good questions get good answers, from a colleague, an issue tracker or an assistant.
3. Treat any answer as a hypothesis. Test it against your repro before you believe it, and make sure you understand *why* the fix works. If you cannot explain the fix, you have not finished debugging.

> Rubber duck debugging
>
> Explain the bug out loud, line by line, to someone who knows nothing about it (programmers traditionally use a rubber duck). Saying "and then this returns the price, which is… 800?" forces you to state each assumption, and the wrong one often jumps out mid-sentence. Writing the question for someone else works the same way.

## In production

- **Make bugs observable before they happen.** Structured logs at the edges (imports, requests, payments) with raw input and parsed result; request ids that connect every line of one request; error logs that include the stack and the cause.
- **Keep repros cheap.** A way to load production-like data locally (with personal data removed) turns "cannot reproduce" into a ten-minute job.
- **Stop the bleeding first.** When real money is being lost, a quick mitigation (pause the import, roll back the price list, switch off a feature flag) comes before the careful debugging. Mitigation is not the fix; it buys time for the method.
- **Never debug in production by editing live code.** Reproduce locally or in a staging copy. Changing production to "see what happens" adds a second bug to the first.
- **Close the loop.** Every fixed bug leaves a regression test behind. Over months, those tests become a list of every way the system has failed before, all guarded.

## Practice

TRY IT YOURSELF

### Finish the shrinker's bug

The [automatic shrinker](#isolate) left a one-line cart whose `subtotal` is the text `"27000"`. Using only that line, form a hypothesis about the value `cartTotal` printed, write the experiment that tests it, and fix the code so that the bug cannot happen again.

**Show a solution**

Hypothesis: `total` starts as the number 0, and `0 + "27000"` is string concatenation, not addition, so the total becomes the text `"027000"`. Prediction: `typeof` the result is `"string"`, and adding a second line appends digits instead of adding.

shrink-experiment.js

```ts
let total = 0;
total += "27000";
console.log(total, typeof total);
total += 1000;
console.log(total);
```

Output of `node shrink-experiment.js` and of the browser terminal

```ts
027000 string
0270001000
```

Confirmed. The root cause is not in `cartTotal`; it is the form that stored text. Fix it at the boundary: convert and validate when the line is created (`const subtotal = Number(input); if (!Number.isInteger(subtotal) || subtotal < 0) throw new Error(...)`), so `cartTotal` only ever sees whole numbers of kobo. The regression test is the shrinker's minimal cart. [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) in the TypeScript course makes this kind of boundary check systematic.

TRY IT YOURSELF

### Observe before you fix

A bug report: "The booking app sends Bola's reminder at the wrong time." Write down (a) three facts you would collect before reading any code, (b) the question you would ask about what changed recently, and (c) a first hypothesis that makes a testable prediction.

**Show a solution**

(a) Facts: the time Bola booked and the time the reminder arrived (exact, with time zone); whether other users' reminders are also wrong, and by how much; the server's time zone and the date of the first wrong reminder.

(b) What changed: a deployment, a move to a new server or cloud region, a daylight-saving change in the user's or the server's time zone, a new phone app version.

(c) Hypothesis: "Reminder times are computed in the server's time zone (UTC) instead of Lagos time (UTC+1)." Prediction: every wrong reminder is exactly one hour off, in the same direction, and reminders for users whose times were entered in UTC are correct. If some are two hours off, or only some users are affected, the hypothesis is wrong.

TRY IT YOURSELF

### Read the trace

Use the [reminder.js trace](#stack-traces) above. (a) Which frame is the first in your own code? (b) Which function that you wrote is missing from the trace, and why? (c) What single log line would you add, and where, so that the next time this crashes you know which booking caused it without a debugger?

**Show a solution**

(a) `sendReminder` at `reminder.js:2:29`; the arrow function inside the `setTimeout` (line 8) called it.

(b) `scheduleReminders`, and the top-level call. The timer ran the callback later, on a fresh call stack, after they had finished. Only `await` keeps async frames.

(c) In `sendReminder`, guard the input and log the booking id with a clear event name, for example `if (!booking.time) { console.error(JSON.stringify({ event: "reminder.missing_time", bookingId: booking.id })); return; }`. Better still, validate bookings when they are created, so a booking without a time never reaches the scheduler.

## Summary

- Debug with a method: **observe** the facts, **reproduce** the bug on demand, **isolate** it to a minimal case, **hypothesize** a cause that predicts something, **test** the prediction, **fix** the cause, and **verify** with a regression test.
- Separate facts from interpretation in bug reports, and always ask what changed just before the bug appeared.
- Read stack traces from the error message, to the first frame in your own code, then down the stack to where the bad value came from. Skip `node:internal`, walk past library frames, and read `[cause]` chains. Throw `Error` objects so that there is a trace at all.
- Shrink the input and the code until everything left is needed. A minimal reproduction often explains itself, and it is the best thing to hand to anyone else.
- Log to answer a question: label values, print types, prefer `console.log` over `JSON.stringify` for debugging, and keep structured logs at the edges of your system.
- Fix the root cause, refuse input you do not understand, prove the fix with a test that fails on the old code, and clean up the damage.

Next: [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools), where breakpoints, watch expressions, the Node.js inspector, the browser debugger and source maps let you observe a running program without adding a single `console.log`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
