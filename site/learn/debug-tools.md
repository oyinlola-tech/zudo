---
title: "Debugging tools — ZudoJS Academy"
description: "Pause a program at breakpoints, step through it and watch values in Node.js and the browser, read network traffic, and map compiled code back with source maps."
source: https://zudojs.oyinlola.site/learn/debug-tools
---

LEVEL 4 · LESSON 20 OF 21

Tooling and debugging Core

# Debugging tools

Pause a program at breakpoints, step through it and watch values in Node.js and the browser, read network traffic, and map compiled code back with source maps.

- **55 min** to read and try
- **You need:** The debugging method, What Node.js is, The DOM and JavaScript tooling
- **You build:** A diagnosed delivery-fee bug found with the Node.js debugger, a secret-safe account object, and a source map decoded by hand

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Pause a program at a breakpoint and step over, into and out of calls
- Drive the Node.js debugger from the terminal and attach Chrome DevTools or VS Code with --inspect
- Use conditional breakpoints, logpoints, watch expressions and pause-on-exception to answer one question at a time
- Inspect nested and secret-holding objects without leaking data into logs
- Diagnose a failing request from its status, headers and body in the Network panel or with curl
- Explain how a source map turns a compiled position back into a TypeScript line

## A total of ₦17,650,001,500

A new checkout goes live, and the first test order shows this:

checkout.js

```ts
const settings = Object.fromEntries(
  new URLSearchParams("deliveryFeeKobo=150000&freeDeliveryFromKobo=5000000"),
);

function cartSubtotal(lines) {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.priceKobo * line.quantity;
  }
  return subtotal;
}

function checkoutTotal(lines) {
  const subtotal = cartSubtotal(lines);
  const delivery = subtotal >= settings.freeDeliveryFromKobo ? 0 : settings.deliveryFeeKobo;
  const total = subtotal + delivery;
  return total;
}

const cart = [
  { sku: "RICE-5", priceKobo: 850000, quantity: 2 },
  { sku: "TOM-400", priceKobo: 65000, quantity: 1 },
];
console.log(`Total: ${checkoutTotal(cart)} kobo`);
```

run-checkout.jsNode.js only

```ts
await import("./checkout.js");
```

Output of `node run-checkout.js`

```ts
Total: 1765000150000 kobo
```

The settings come from a query string here; in a real server they would come from environment variables. The subtotal should be ₦17,650 plus ₦1,500 delivery. Instead, the total is a 13-digit number.

In [The debugging method](https://zudojs.oyinlola.site/learn/debug-method) you reproduced bugs and tested hypotheses with `console.log`. That works, but every question costs an edit and a rerun, and you have to guess in advance which values you will want to see. A **debugger** is a tool that pauses a running program at a line you choose and lets you look at *every* value in scope, then move forward one step at a time. It does not replace the method; it makes the observe and test steps much faster.

This lesson covers the debugger in the terminal, in Chrome DevTools and in VS Code; the browser's debugger and Network panel; tools for printing objects; and source maps, which make all of these work on compiled TypeScript.

## What a debugger does

Every debugger, in every language and editor, is built from the same few ideas:

| Term | Meaning |
| --- | --- |
| **Breakpoint** | A marker on a line. When execution reaches it, the program **pauses** before running that line. |
| **Paused** | The program is frozen, with all its variables alive. Timers, requests and other code wait too. |
| **Call stack** | The same list as a stack trace, but live: click a frame to see that function's variables. |
| **Scope** | The variables visible at the paused line: local, closure, module and global. |
| **Continue** | Run until the next breakpoint (or the end). |
| **Step over** | Run the current line, including any function it calls, and pause at the next line of the *same* function. |
| **Step into** | If the current line calls a function, go inside it and pause at its first line. |
| **Step out** | Run the rest of the current function and pause just after it returns to its caller. |
| **Watch expression** | An expression (`subtotal`, `typeof delivery`, `cart.length`) re-evaluated every time the program pauses. |

```ts
 checkoutTotal(lines)                       cartSubtotal(lines)
 ─────────────────────                      ─────────────────────
▶ const subtotal = cartSubtotal(lines); ──step into──►  let subtotal = 0;
                                                        for (const line of lines) {
   │ step over                                            subtotal += ...
   ▼                                                    }
  const delivery = ...;          ◄──────step out──────  return subtotal;
  const total = subtotal + delivery;
```

Step over treats a call as one line. Step into enters the called function. Step out finishes the current function and returns to the caller.

Stepping is the automated version of the trace tables from [Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken#method): the debugger fills in each row for you, and you keep doing the important part, predicting the next row before you press the key.

### The debugger statement

You can also put a breakpoint in the code itself with the `debugger` statement. When a debugger is attached, execution pauses there. When none is attached, it does nothing at all:

debugger-statement.js

```ts
function applyDelivery(subtotal, fee) {
  debugger;
  return subtotal + fee;
}

console.log(applyDelivery(1765000, 150000));
```

Output of `node debugger-statement.js` and of the browser terminal

```ts
1915000
```

It is handy for code that is hard to click on in an editor, such as code generated at runtime. Never commit one: a colleague who happens to have DevTools open will be stopped by it in the middle of their work. Most linters flag it ([JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling)).

## The Node.js debugger in the terminal

Node.js has a debugger built in. `node inspect file.js` starts your program paused on its first line and gives you a `debug>` prompt. It is the least comfortable debugger, but it works everywhere (including on a server over SSH), and because everything is typed, you can see exactly what each command does. The sessions below are real runs; your `ws://` id will differ.

REASON IT OUT

### Before you start the debugger

Using [the method](https://zudojs.oyinlola.site/learn/debug-method#hypothesize), decide what you want to learn before you pause anything:

- The output has far too many digits. What kind of bug produces a number that looks like two numbers written side by side?
- Which line is the first where that could happen? Which values on that line would you like to see, and what do you predict they are?
- Where should the breakpoint go so that you see those values *before* the damage happens?

**Show the reasoning**

**The symptom:** 1765000150000 is 1765000 followed by 150000. A number that looks like two numbers glued together is almost always string concatenation: `+` with a string on one side joins text instead of adding.

**The line:** `const total = subtotal + delivery;` is the only place where the two amounts meet. Prediction: one of them is a string. `subtotal` is built from numbers in the cart, so the suspect is `delivery`, which comes from the settings.

**The breakpoint:** at line 14, the start of `checkoutTotal`, so you can watch both values being made. A breakpoint at line 16 would also work, but starting one step earlier lets you check the subtotal too.

Terminal: step into, out and over (a real session)

```bash
$ node inspect checkout.js
< Debugger listening on ws://127.0.0.1:9229/b982a2ca-b8fa-4f6b-aa71-9e89a26cb1fe
< For help, see: https://nodejs.org/learn/getting-started/debugging
<
connecting to 127.0.0.1:9229 ... ok
< Debugger attached.
<
debug> Break on start in checkout.js:1
> 1 const settings = Object.fromEntries(
  2   new URLSearchParams("deliveryFeeKobo=150000&freeDeliveryFromKobo=5000000"),
  3 );
debug> sb(14)
  9   }
 10   return subtotal;
 11 }
 12
 13 function checkoutTotal(lines) {
>14   const subtotal = cartSubtotal(lines);
 15   const delivery = subtotal >= settings.freeDeliveryFromKobo ? 0 : settings.deliveryFeeKobo;
 16   const total = subtotal + delivery;
 17   return total;
 18 }
 19
debug> c
debug> break in checkout.js:14
 12
 13 function checkoutTotal(lines) {
>14   const subtotal = cartSubtotal(lines);
 15   const delivery = subtotal >= settings.freeDeliveryFromKobo ? 0 : settings.deliveryFeeKobo;
 16   const total = subtotal + delivery;
debug> s
debug> step in checkout.js:6
  4
  5 function cartSubtotal(lines) {
> 6   let subtotal = 0;
  7   for (const line of lines) {
  8     subtotal += line.priceKobo * line.quantity;
debug> o
debug> step in checkout.js:15
 13 function checkoutTotal(lines) {
*14   const subtotal = cartSubtotal(lines);
>15   const delivery = subtotal >= settings.freeDeliveryFromKobo ? 0 : settings.deliveryFeeKobo;
 16   const total = subtotal + delivery;
 17   return total;
debug> n
debug> step in checkout.js:16
*14   const subtotal = cartSubtotal(lines);
 15   const delivery = subtotal >= settings.freeDeliveryFromKobo ? 0 : settings.deliveryFeeKobo;
>16   const total = subtotal + delivery;
 17   return total;
 18 }
debug> exec delivery
'150000'
debug> exec typeof delivery
'string'
debug> exec settings
{ deliveryFeeKobo: '150000', freeDeliveryFromKobo: '5000000' }
debug> .exit
```

What happened, command by command:

- `sb(14)` ("set breakpoint") marked line 14; `c` ("continue") ran until it was reached. The `>` shows the line about to run, the `*` a line with a breakpoint.
- `s` ("step") went *into* `cartSubtotal`. `o` ("out") ran the rest of it and came back to `checkoutTotal`, now on line 15. `n` ("next") stepped *over* line 15.
- `exec expr` evaluated expressions in the paused scope. The quotes in `'150000'` answer the question: `delivery` is a string, and so is every value in `settings`. `URLSearchParams` (like `process.env`, form fields and CSV cells) only ever produces text.

The hypothesis is confirmed in one pause, without a single edit. Notice what else the session tells you for free: `freeDeliveryFromKobo` is a string too. The comparison `subtotal >= "5000000"` happens to work, because `>=` converts the string to a number when the other side is a number. If both sides were strings, it would compare them alphabetically, and `"900" >= "5000000"` would be `true`. The fix is to convert the settings once, when they are loaded:

settings-fixed.js

```ts
function loadSettings(query) {
  const raw = Object.fromEntries(new URLSearchParams(query));
  const settings = {};
  for (const [key, value] of Object.entries(raw)) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new Error(`Setting ${key} must be whole kobo, got "${value}"`);
    settings[key] = number;
  }
  return settings;
}

const settings = loadSettings("deliveryFeeKobo=150000&freeDeliveryFromKobo=5000000");
console.log(settings);
console.log(1765000 + settings.deliveryFeeKobo);
try {
  loadSettings("deliveryFeeKobo=1,500");
} catch (error) {
  console.log(error.message);
}
```

Output of `node settings-fixed.js` and of the browser terminal

```json
{ deliveryFeeKobo: 150000, freeDeliveryFromKobo: 5000000 }
1915000
Setting deliveryFeeKobo must be whole kobo, got "1,500"
```

### Watch expressions

When you pause many times (a loop, a request handler), re-typing `exec` gets tedious. A **watch expression** is printed automatically at every pause:

Terminal: watching values across loop iterations (a real session)

```bash
$ node inspect checkout.js
…
debug> sb(8)
  3 );
  4
  5 function cartSubtotal(lines) {
  6   let subtotal = 0;
  7   for (const line of lines) {
> 8     subtotal += line.priceKobo * line.quantity;
  9   }
 10   return subtotal;
 11 }
 12
 13 function checkoutTotal(lines) {
debug> c
debug> break in checkout.js:8
  6   let subtotal = 0;
  7   for (const line of lines) {
> 8     subtotal += line.priceKobo * line.quantity;
  9   }
 10   return subtotal;
debug> watch('subtotal')
debug> watch('line.sku')
debug> c
debug> break in checkout.js:8
Watchers:
  0: subtotal = 1700000
  1: line.sku = 'TOM-400'

  6   let subtotal = 0;
  7   for (const line of lines) {
> 8     subtotal += line.priceKobo * line.quantity;
  9   }
 10   return subtotal;
debug> c
debug> < Total: 1765000150000 kobo
<
debug> < Waiting for the debugger to disconnect...
```

The second pause shows the loop's second iteration: the rice is already added (1,700,000 kobo), and the line about to be added is the tomato paste. Watches can be any expression, including `typeof x`, `items.length` or `total > 10_000_000`.

### Conditional breakpoints

A breakpoint inside a loop that runs 10,000 times is useless if you care about one iteration. A **conditional breakpoint** only pauses when an expression is true:

Terminal: pause only for one product (a real session)

```bash
$ node inspect checkout.js
…
debug> sb('checkout.js', 8, 'line.sku === "TOM-400"')
  3 );
  4
  5 function cartSubtotal(lines) {
  6   let subtotal = 0;
  7   for (const line of lines) {
> 8     subtotal += line.priceKobo * line.quantity;
  9   }
 10   return subtotal;
 11 }
 12
 13 function checkoutTotal(lines) {
debug> c
debug> break in checkout.js:8
  6   let subtotal = 0;
  7   for (const line of lines) {
> 8     subtotal += line.priceKobo * line.quantity;
  9   }
 10   return subtotal;
debug> exec line
{ sku: 'TOM-400', priceKobo: 65000, quantity: 1 }
debug> exec subtotal
1700000
```

Good conditions come straight from your hypothesis: `typeof subtotal !== "number"`, `order.id === 1042`, `stock < 0`. The program runs at full speed until the one moment you care about.

### Pause on exceptions

For a crash, you want to be paused at the moment of the throw, with all the variables still alive. `breakOnException` does exactly that. Here it is on the receipt printer from [the method lesson](https://zudojs.oyinlola.site/learn/debug-method#stack-traces):

Terminal: pause where the error is thrown (a real session)

```bash
$ node inspect receipt.js
…
debug> breakOnException
debug> c
debug> < #1041 Ada: 1700000 kobo
<
debug> exception in receipt.js:8
  6 function orderTotal(order) {
  7   return order.items
> 8     .map((item) => item.price * item.quantity)
  9     .reduce((sum, n) => sum + n, 0);
 10 }
debug> exec order
{ id: 1042, customer: 'Bola', lineItems: Array(1) }
debug> bt
#0 orderTotal receipt.js:8:5
#1 receiptLine receipt.js:13:44
#2 (anonymous) receipt.js:17:14
#3 run node:internal/modules/esm/module_job:439:24
```

The stack trace told you *where*; the paused program tells you *what*: order 1042 has `lineItems`, not `items`. `bt` ("backtrace") prints the live call stack. `breakOnException` pauses on every thrown error, even ones that are caught later, which is noisy in code that uses exceptions a lot; `breakOnUncaught` pauses only on ones nobody catches, and `breakOnNone` turns both off.

## Attaching Chrome DevTools or VS Code

The terminal debugger talks to Node.js through the **inspector protocol**, and so do the graphical debuggers. Start your program with one of these flags:

| Flag | What it does | Use it when |
| --- | --- | --- |
| `--inspect` | Runs normally, and accepts a debugger at any time | A server you want to attach to while it handles requests |
| `--inspect-brk` | Pauses before the first line until a debugger attaches | A script that would finish (or crash) before you could attach |
| `--inspect-wait` | Waits for a debugger, then runs without pausing on line 1 | Start-up code with breakpoints already set in your editor |

Terminal (a real run)

```bash
$ node --inspect-brk checkout.js
Debugger listening on ws://127.0.0.1:9229/944a45cc-c8de-4d3c-8211-a0d29410ebc9
For help, see: https://nodejs.org/learn/getting-started/debugging
```

The program is now waiting. In Chrome, open `chrome://inspect`, find `checkout.js` under "Remote Target" and click **inspect**. A DevTools window opens on the **Sources** panel, paused on line 1. From here:

- Click a line number to set a breakpoint (a blue marker). Right-click it for **Add conditional breakpoint** or **Add logpoint**.
- The buttons at the top of the right-hand pane are continue (F8), step over (F10), step into (F11) and step out (Shift+F11).
- The **Scope** section shows local, closure, module and global variables. Hover any variable in the code to see its value. Private class fields (`#pin`) are visible here, although `console.log` never prints them.
- The **Watch** section takes expressions; the **Call Stack** section lists frames, and clicking one shows its variables.
- The **Console** tab evaluates in the paused scope, like `exec`. You can even change a variable (`delivery = 150000`) and continue, to test a fix without restarting.

### VS Code

VS Code has the same debugger built in. The quickest way in: open the command palette, run **Debug: JavaScript Debug Terminal**, and start your program as usual (`node checkout.js`, `npm run dev`, `npx tsx src/main.ts`). Every Node.js process started from that terminal is attached automatically, and breakpoints you click in the editor gutter just work. For a repeatable setup, add a launch configuration:

.vscode/launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug checkout",
      "program": "${workspaceFolder}/checkout.js",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to running server",
      "port": 9229
    }
  ]
}
```

`skipFiles` makes "step into" skip Node.js's own internals, so you never land in `node:internal/…`. Add `"${workspaceFolder}/node_modules/**"` to skip libraries as well. The second configuration attaches to a process you started yourself with `--inspect`. Press F5 to start the selected configuration; F9 toggles a breakpoint on the current line.

### Logpoints

Both Chrome and VS Code offer **logpoints**: a breakpoint that does not pause, but prints a message such as `subtotal={subtotal} delivery={delivery}` every time the line runs. It is a `console.log` you add without editing, restarting or remembering to delete it afterwards. Reach for it when pausing would change the behaviour, for example in code with timeouts, where a paused program makes requests time out.

> Never expose the inspector
>
> Whoever connects to the inspector port can run any code inside your process: read secrets, change data, start other programs. By default Node.js only listens on `127.0.0.1`, which is safe. Never start a production server with `--inspect=0.0.0.0`, and never open port 9229 in a firewall. To debug a remote server, forward the port over SSH (`ssh -L 9229:localhost:9229 server`) and attach locally.

## Inspecting objects

Whether you print with `console.log` or pause in a debugger, the tool decides how much of an object you see. `console.log` in Node.js stops at a depth of 2 and prints `[Object]` below that. When the value you care about is deeper, ask for all of it:

depth.jsNode.js only

```ts
import { inspect } from "node:util";

const order = {
  id: 1042,
  customer: { name: "Bola", address: { city: "Lagos", geo: { lat: 6.45, lng: 3.39 } } },
  lines: [{ sku: "RICE-5", quantity: 2 }],
};

console.log(order);
console.dir(order, { depth: null });
console.log(inspect(order, { depth: 0 }));
```

Output of `node depth.js`

```json
{
  id: 1042,
  customer: { name: 'Bola', address: { city: 'Lagos', geo: [Object] } },
  lines: [ { sku: 'RICE-5', quantity: 2 } ]
}
{
  id: 1042,
  customer: {
    name: 'Bola',
    address: { city: 'Lagos', geo: { lat: 6.45, lng: 3.39 } }
  },
  lines: [ { sku: 'RICE-5', quantity: 2 } ]
}
{ id: 1042, customer: [Object], lines: [Array] }
```

`console.dir(value, { depth: null })` prints every level; `util.inspect` returns the same text as a string, with options for depth, sorting keys (`sorted: true`) and more. In a debugger, you expand levels by clicking instead.

### Secrets in logs

Printing a whole object is convenient and dangerous. This account holds an API token:

secrets.jsNode.js only

```ts
import { inspect } from "node:util";

class Account {
  #pin;
  constructor(owner, balanceKobo, pin, apiToken) {
    this.owner = owner;
    this.balanceKobo = balanceKobo;
    this.apiToken = apiToken;
    this.#pin = pin;
  }
}

const ada = new Account("Ada", 500000, "4321", "sk_test_51H8xQ2");
console.log(ada);

class SafeAccount extends Account {
  [inspect.custom]() {
    return `SafeAccount { owner: '${this.owner}', balanceKobo: ${this.balanceKobo}, apiToken: '[redacted]' }`;
  }
}

console.log(new SafeAccount("Bola", 120000, "9999", "sk_test_77Zp01"));
```

Output of `node secrets.js`

```ts
Account {
  owner: 'Ada',
  balanceKobo: 500000,
  apiToken: 'sk_test_51H8xQ2'
}
SafeAccount { owner: 'Bola', balanceKobo: 120000, apiToken: '[redacted]' }
```

The private `#pin` is never printed, but the public `apiToken` is, and a debug log line like that, shipped to a log service, leaks the token to everyone who can read logs. `util.inspect.custom` (a symbol, `Symbol.for("nodejs.util.inspect.custom")`) lets a class decide how it is printed by `console.log` and `util.inspect`. Redacting sensitive fields there protects every log line at once. [Structured logging](https://zudojs.oyinlola.site/learn/zudo-logging) in the ZudoJS course redacts by field name for the same reason. A debugger still shows the real values, which is fine: it runs on your machine, not in a log file.

## The browser debugger

Everything above works in the browser too, with the same keys: open DevTools (F12), go to **Sources**, find your script, and click a line number. The browser adds breakpoints that have no line to click on, because browser code is driven by events:

| Breakpoint | Where | Answers |
| --- | --- | --- |
| Event listener breakpoints | Sources → Event Listener Breakpoints → Mouse → click | "Which code runs when I click this?" |
| DOM change breakpoints | Elements → right-click a node → Break on → subtree modifications / attribute modifications / node removal | "Who keeps changing this element?" |
| XHR/fetch breakpoints | Sources → XHR/fetch Breakpoints → add a URL fragment | "Which code sends this request?" |
| Pause on exceptions | Sources → the pause-on-exceptions toggles | "What were the values when it threw?" |

The **Elements** panel also has an **Event Listeners** tab that lists every listener attached to the selected element, with a link to its source. It finds one of the most common browser bugs in seconds. Here is a cart button:

index.html

```ts
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Cart</title></head>
<body>
  <button id="add">Add rice to cart</button>
  <p id="count">Cart: 0 items</p>
</body>
</html>
```

cart-bug.js

```ts
let items = 0;
const button = document.querySelector("#add");
const count = document.querySelector("#count");

function render() {
  count.textContent = `Cart: ${items} items`;
  button.addEventListener("click", () => {
    items++;
    render();
  });
}

render();
for (let click = 1; click <= 3; click++) {
  button.click();
  console.log(`after click ${click}: ${count.textContent}`);
}
```

What the browser terminal prints

```ts
after click 1: Cart: 1 items
after click 2: Cart: 3 items
after click 3: Cart: 7 items
```

Each click adds more than the one before: 1, then 2 more, then 4 more. The Event Listeners tab would show the button with 8 click listeners after three clicks. The cause is in `render`: every render adds *another* listener, and they pile up. The fix is to attach listeners once, outside anything that runs repeatedly:

cart-fixed.js

```ts
let items = 0;
const button = document.querySelector("#add");
const count = document.querySelector("#count");

function render() {
  count.textContent = `Cart: ${items} items`;
}

button.addEventListener("click", () => {
  items++;
  render();
});

render();
for (let click = 1; click <= 3; click++) {
  button.click();
  console.log(`after click ${click}: ${count.textContent}`);
}
```

What the browser terminal prints

```ts
after click 1: Cart: 1 items
after click 2: Cart: 2 items
after click 3: Cart: 3 items
```

[Events](https://zudojs.oyinlola.site/learn/browser-events) covers listeners and delegation in depth. The debugging lesson here is the symptom: when an action happens "too many times" and the count grows, look for a listener or a timer registered in code that runs more than once.

## Inspecting network traffic

Many bugs are not in your code at all but in the conversation between two programs. This client fails with an error that seems to make no sense:

products-client.jsNode.js only

```ts
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/products") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ sku: "RICE-5", priceKobo: 850000 }]));
    return;
  }
  res.writeHead(404, { "content-type": "text/html" });
  res.end("<!doctype html><h1>Page not found</h1>");
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

async function loadProducts() {
  const res = await fetch(`${base}/api/products/`);
  return res.json();
}

try {
  await loadProducts();
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
server.close();
```

Output of `node products-client.js`

```ts
SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

REASON IT OUT

### Before you touch the parsing code

- The error comes from `res.json()`. Is the bug more likely in the JSON parser, in your client, or in what the server sent? What would each one predict?
- What kind of document starts with `<!doctype`? When does a server send one to a client that asked for JSON?
- Which three facts about the response would separate those explanations, and which one would you look at first?

**Show the reasoning**

**Where:** `JSON.parse` is one of the most tested functions in the world; when it fails, the input is wrong. So the question becomes: why is the body not JSON?

**What:** `<!doctype html>` starts an HTML page. Servers send HTML to API clients mostly by accident: an error page (404, 500), a login page after a redirect, or a proxy's "bad gateway" page.

**The facts:** the status code (was it even a success?), the `content-type` header (what did the server claim to send?), and the start of the body. The status first, because a non-2xx status explains the rest by itself.

"Unexpected token '<'" means the body starts with `<`, so it is HTML, not JSON. The error is thrown by `res.json()`, but the cause is the request. Look at the whole response instead of just the body:

products-inspect.jsNode.js only

```ts
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/products") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ sku: "RICE-5", priceKobo: 850000 }]));
    return;
  }
  res.writeHead(404, { "content-type": "text/html" });
  res.end("<!doctype html><h1>Page not found</h1>");
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

for (const path of ["/api/products/", "/api/products"]) {
  const res = await fetch(base + path);
  const body = await res.text();
  console.log(`GET ${path} -> ${res.status} ${res.statusText}`);
  console.log(`  content-type: ${res.headers.get("content-type")}`);
  console.log(`  body: ${body.slice(0, 40)}`);
}
server.close();
```

Output of `node products-inspect.js`

```ts
GET /api/products/ -> 404 Not Found
  content-type: text/html
  body: <!doctype html><h1>Page not found</h1>
GET /api/products -> 200 OK
  content-type: application/json
  body: [{"sku":"RICE-5","priceKobo":850000}]
```

Status 404 and `text/html`: the trailing slash asked for a route that does not exist, and the server answered with its HTML error page. The rule for any failed request: **check the status, then the content type, then the body**, before you debug the code that reads them. A client should also check `res.ok` before calling `res.json()`, so that the error names the status instead of complaining about a `<`.

### The Network panel

In the browser, DevTools' **Network** panel records every request the page makes. Click a request to see:

- **Headers**: the URL, method, status code, request headers (was the `Authorization` header sent? which cookies?) and response headers (`content-type`, CORS headers, `cache-control`).
- **Payload**: what the page sent. Is the body the JSON you think it is, or `[object Object]`?
- **Preview / Response**: what came back, before your code touched it.
- **Timing**: where the time went: waiting for a connection, waiting for the server (a slow query), or downloading.

Useful switches: **Preserve log** keeps requests across page reloads and redirects; **Disable cache** makes sure you see what the server sends now; the throttling menu simulates a slow phone connection, which exposes race conditions and missing loading states. A red `(failed)` or `CORS error` status means the browser blocked the request; the reason is in the Console ([Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking) explains CORS).

Right-click a request and choose **Copy → Copy as cURL** to get a command that repeats the exact request from a terminal. That is how you turn a browser bug into a [reproduction](https://zudojs.oyinlola.site/learn/debug-method#reproduce) anyone can run:

Terminal (a real run, with the same server listening on port 3457)

```bash
$ curl -i http://localhost:3457/api/products/
HTTP/1.1 404 Not Found
content-type: text/html
Date: Thu, 24 Sep 2026 20:33:03 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

<!doctype html><h1>Page not found</h1>
```

`-i` prints the status line and headers before the body. For Node.js code, Node 24 can also show its own `fetch` and `http` requests in the DevTools Network panel: start it with `node --inspect --experimental-network-inspection app.js` and attach as above. The flag is still experimental, so logging the status, content type and the start of the body, as above, remains the dependable way.

## Source maps

You rarely run the code you write. TypeScript is compiled to JavaScript; browser code is bundled and minified into one file with short variable names. A stack trace or breakpoint in the *output* points at code you never wrote. [JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling#source-maps) introduced source maps for a bundle; here is what they do for debugging compiled TypeScript, the language of the next course ([What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#emit-files) covers the compiler's side). You only need to know that TypeScript is JavaScript plus type annotations, which the compiler removes. A wallet transfer in TypeScript:

src/transfer.ts

```ts
interface Account {
  owner: string;
  balanceKobo: number;
}

type Transfer = { from: Account; to: Account; amountKobo: number };

export function transfer({ from, to, amountKobo }: Transfer): void {
  if (amountKobo <= 0) {
    throw new RangeError(`Transfer amount must be positive, got ${amountKobo}`);
  }
  from.balanceKobo -= amountKobo;
  to.balanceKobo += amountKobo;
}
```

src/main.ts

```ts
import { transfer } from "./transfer.js";

const ada = { owner: "Ada", balanceKobo: 500000 };
const bola = { owner: "Bola", balanceKobo: 0 };

transfer({ from: ada, to: bola, amountKobo: 200000 });
transfer({ from: ada, to: bola, amountKobo: -50000 });
```

With `"sourceMap": true`, `"rootDir": "src"` and `"outDir": "dist"` in `tsconfig.json`, `tsc` writes a `.js.map` next to every `.js` file, and a comment at the end of the JavaScript that points to it:

Terminal (a real run, TypeScript 7)

```bash
$ npx tsc
$ ls dist
main.js  main.js.map  transfer.js  transfer.js.map
$ tail -n 1 dist/transfer.js
//# sourceMappingURL=transfer.js.map
$ cat dist/transfer.js.map
{"version":3,"file":"transfer.js","sourceRoot":"","sources":["../src/transfer.ts"],"names":[],"mappings":"AAOA,MAAM,UAAU,QAAQ,CAAC,EAAE,IAAI,EAAE,EAAE,EAAE,UAAU,EAAY;IACzD,IAAI,UAAU,IAAI,CAAC,EAAE,CAAC;QACpB,MAAM,IAAI,UAAU,CAAC,yCAAyC,UAAU,EAAE,CAAC,CAAC;IAC9E,CAAC;IACD,IAAI,CAAC,WAAW,IAAI,UAAU,CAAC;IAC/B,EAAE,CAAC,WAAW,IAAI,UAAU,CAAC;AAC/B,CAAC"}
```

Run the compiled code, first without the map and then with it:

Terminal (real runs)

```bash
$ node dist/main.js
file:///home/you/wallet/dist/transfer.js:3
        throw new RangeError(`Transfer amount must be positive, got ${amountKobo}`);
              ^

RangeError: Transfer amount must be positive, got -50000
    at transfer (file:///home/you/wallet/dist/transfer.js:3:15)
    at file:///home/you/wallet/dist/main.js:5:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
$ node --enable-source-maps dist/main.js
/home/you/wallet/src/transfer.ts:10
    throw new RangeError(`Transfer amount must be positive, got ${amountKobo}`);
          ^

RangeError: Transfer amount must be positive, got -50000
    at transfer (/home/you/wallet/src/transfer.ts:10:11)
    at <anonymous> (/home/you/wallet/src/main.ts:7:1)
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
```

Without the map, the trace names `transfer.js:3` and `main.js:5`: lines in files you never edit, whose numbers do not match your source (the interface and type alias were erased, so everything moved up). With `--enable-source-maps`, the same error names `transfer.ts:10` and `main.ts:7`, the second `transfer` call, and even shows the TypeScript line.

### What is inside the map

The `mappings` field is a compact list of pairs: "this position in the output came from that position in the source". Lines of output are separated by `;`, positions within a line by `,`, and each position is a few numbers written in **base64 VLQ**, a variable-length encoding where each character carries 5 bits of a number plus a "more digits follow" bit. Each number is stored as the *difference* from the previous one, which keeps the map small. Decoding it takes twenty lines:

read-map.js

```ts
const map = {
  sources: ["../src/transfer.ts"],
  mappings:
    "AAOA,MAAM,UAAU,QAAQ,CAAC,EAAE,IAAI,EAAE,EAAE,EAAE,UAAU,EAAY;IACzD,IAAI,UAAU,IAAI,CAAC,EAAE,CAAC;QACpB,MAAM,IAAI,UAAU,CAAC,yCAAyC,UAAU,EAAE,CAAC,CAAC;IAC9E,CAAC;IACD,IAAI,CAAC,WAAW,IAAI,UAAU,CAAC;IAC/B,EAAE,CAAC,WAAW,IAAI,UAAU,CAAC;AAC/B,CAAC",
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = B64.indexOf(char);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    values.push(value & 1 ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }
  return values;
}

let sourceLine = 0;
let sourceColumn = 0;
map.mappings.split(";").forEach((line, jsLine) => {
  let jsColumn = 0;
  line.split(",").forEach((segment, i) => {
    const [dJsColumn, , dSourceLine, dSourceColumn] = decodeVlq(segment);
    jsColumn += dJsColumn;
    sourceLine += dSourceLine;
    sourceColumn += dSourceColumn;
    if (i === 0) console.log(`transfer.js ${jsLine + 1}:${jsColumn + 1} -> transfer.ts ${sourceLine + 1}:${sourceColumn + 1}`);
  });
});
```

Output of `node read-map.js` and of the browser terminal

```ts
transfer.js 1:1 -> transfer.ts 8:1
transfer.js 2:5 -> transfer.ts 9:3
transfer.js 3:9 -> transfer.ts 10:5
transfer.js 4:5 -> transfer.ts 11:3
transfer.js 5:5 -> transfer.ts 12:3
transfer.js 6:5 -> transfer.ts 13:3
transfer.js 7:1 -> transfer.ts 14:1
```

Line 3 of the JavaScript (the `throw`) comes from line 10 of the TypeScript: exactly the translation `--enable-source-maps` did for the stack trace. Debuggers do the same for breakpoints, in both directions: you click line 10 of `transfer.ts` in VS Code, and it sets the real breakpoint on line 3 of `transfer.js`.

### Source maps in practice

- **Node.js:** run compiled code with `--enable-source-maps` (or `NODE_OPTIONS=--enable-source-maps`) so production logs show `.ts` lines. `tsx` and Node's own type stripping need no maps at all: type stripping replaces the types with spaces, so every line and column stays where it was.
- **Browsers:** DevTools loads maps automatically when the `sourceMappingURL` comment points to one, and shows your original files in Sources. Bundlers (Vite, esbuild, webpack) generate them with an option.
- **Inline maps** (`"inlineSourceMap": true`) embed the map in the `.js` file as base64. That is one file fewer to lose, and a bigger file.
- **Publishing maps is publishing your source.** A public site that serves `.map` files lets anyone read your original code with comments. That is fine for open-source projects; others upload maps privately to their error-tracking service and do not serve them.
- **A stale map lies.** If the `.js` is rebuilt but the `.map` is not (or the other way round), traces point at the wrong lines. When a trace names a line that cannot possibly throw, rebuild before you debug.

## Choosing the tool

A tool only helps when it answers the question your hypothesis asks. A quick guide:

| Question | Tool |
| --- | --- |
| What are all the values at this line? | Breakpoint, then Scope / `exec` |
| How does this value change over a loop? | Watch expressions, or a logpoint |
| What is different in iteration 7,431? | Conditional breakpoint |
| What was the state when it threw? | Pause on exceptions |
| Who calls this function with a bad value? | Breakpoint + Call Stack, or `console.trace` |
| Which code changed this element / ran on this click? | DOM change and event listener breakpoints |
| Did the request go out, and what came back? | Network panel, `curl -i`, logging status and content type |
| Where is this line in my TypeScript? | Source maps, `--enable-source-maps` |
| What happened in production last night? | Structured logs: you cannot pause the past |
| Why is it slow? | A profiler: `node --cpu-prof`, or the DevTools Performance panel |

A few more Node.js flags are worth knowing: `--trace-warnings` adds a stack trace to warnings (such as "MaxListenersExceededWarning", a sign of the listener pile-up above), `--trace-uncaught` shows where a non-Error value was thrown in CommonJS code, and `--stack-trace-limit=50` keeps more frames.

## Practice

TRY IT YOURSELF

### Plan a debugging session

A loop applies a discount to 20,000 orders, and one order ends up with a negative total. Write down, in `node inspect` commands, the session you would run: where the breakpoint goes, its condition, and the two things you would evaluate once it pauses. Assume the loop body is on line 42 of `discounts.js` and each order has `id`, `totalKobo` and `discountKobo`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A plain breakpoint on line 42 would pause 20,000 times. Re-read [Conditional breakpoints](#node-inspect): the condition should come straight from your hypothesis about what makes the total go negative.

HINT 2

`sb('discounts.js', 42, '')` sets it, `c` continues to it, and once paused, `exec` is how you look at any expression, including `typeof` a value you suspect is the wrong type.

SOLUTION

Pause just before the subtraction, only for the order that goes wrong, and look at both inputs:

```bash
$ node inspect discounts.js
debug> sb('discounts.js', 42, 'order.discountKobo > order.totalKobo')
debug> c
debug> exec order
debug> exec typeof order.discountKobo
debug> bt
```

The condition comes from the hypothesis "the discount is larger than the total". If it never pauses, that hypothesis is dead: try `order.totalKobo - order.discountKobo < 0` or `typeof order.discountKobo !== "number"` next. `bt` shows which code built the discount, one frame down.

TRY IT YOURSELF

### Redact before you log

A `Customer` class has `name`, `email` and `cardNumber`. Give it a custom inspect method so that `console.log` shows the name, the email and only the last four digits of the card.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Build the string with a template literal, the same shape as the worked example, but keep `name` and `email` in full and mask only the card.

HINT 2

`return \`Customer { name: '${this.name}', email: '${this.email}', card: '**** ${this.cardNumber.slice(-4)}' }\`;`

SOLUTION

customer-redact.jsNode.js only

```ts
import { inspect } from "node:util";

class Customer {
  constructor(name, email, cardNumber) {
    this.name = name;
    this.email = email;
    this.cardNumber = cardNumber;
  }

  [inspect.custom]() {
    return `Customer { name: '${this.name}', email: '${this.email}', card: '**** ${this.cardNumber.slice(-4)}' }`;
  }
}

console.log(new Customer("Chidi", "chidi@example.com", "4242424242424242"));
```

Output of `node customer-redact.js`

```ts
Customer { name: 'Chidi', email: 'chidi@example.com', card: '**** 4242' }
```

Every `console.log` and `util.inspect` of a customer is now safe, including logs you have not written yet. `JSON.stringify` ignores the inspect method, so for JSON logs add a `toJSON()` method with the same redaction.

TRY IT YOURSELF

### Read the response first

A page shows "SyntaxError: Unexpected end of JSON input" when it saves a task. In the Network panel the `POST /api/tasks` request has status `204 No Content`. What is the bug, and how should the client code change?

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Order matters: check `res.ok` first (a failed request needs no further reading), then the special case of an empty body, before falling through to the normal case.

HINT 2

`if (!res.ok) throw new Error(\`Request failed: ${res.status}\`); if (res.status === 204) return null; return res.json();`

SOLUTION

204 means "success, and there is no body". The client calls `res.json()` on an empty body, which throws "Unexpected end of JSON input". The request worked; the client's assumption did not. Check the status (and `content-type`) before parsing:

no-content.jsNode.js only

```ts
async function readJson(res) {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

const saved = await readJson(new Response(null, { status: 204 }));
console.log(saved);
const task = await readJson(new Response('{"id":7,"title":"Pay rent"}', { status: 201 }));
console.log(task);
try {
  await new Response(null, { status: 204 }).json();
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node no-content.js`

```ts
null
{ id: 7, title: 'Pay rent' }
SyntaxError: Unexpected end of JSON input
```

`new Response(...)` builds a response by hand, which makes this easy to test without a server.

## Summary

- A debugger pauses at a breakpoint and shows every value in scope. Step over runs a line, step into enters a call, step out finishes the current function; watch expressions are re-evaluated at every pause.
- `node inspect` works anywhere; `--inspect`, `--inspect-brk` and `--inspect-wait` let Chrome DevTools (`chrome://inspect`) or VS Code attach. The JavaScript Debug Terminal in VS Code attaches automatically. Never expose the inspector port.
- Conditional breakpoints, logpoints and pause-on-exceptions let you answer one precise question without editing code.
- `console.dir(x, { depth: null })` prints nested objects in full; `util.inspect.custom` controls how an object is printed and keeps secrets out of logs.
- In the browser, event listener, DOM change and fetch breakpoints find the code behind an event; the Event Listeners tab finds duplicate listeners.
- For a failed request, check the status, then the content type, then the body. The Network panel and `curl -i` show all three; "Copy as cURL" turns a browser request into a reproduction.
- Source maps translate positions in compiled code back to your source. Run compiled code with `--enable-source-maps`, and rebuild when a trace points somewhere impossible.

Next: [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice), where you find a regression with `git bisect`, dig to a root cause with the five whys, and work through five complete bug hunts.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
