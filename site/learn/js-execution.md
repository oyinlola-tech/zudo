---
title: "How JavaScript runs — ZudoJS Academy"
description: "Follow your code through the engine, from text to tokens, syntax tree, bytecode and machine code, and read sync and async stack traces with confidence."
source: https://zudojs.oyinlola.site/learn/js-execution
---

LEVEL 4 · LESSON 17 OF 20

How JavaScript runs Core

# How JavaScript runs

Follow your code through the engine, from text to tokens, syntax tree, bytecode and machine code, and read sync and async stack traces with confidence.

- **50 min** to read and try
- **You need:** Scope and how code runs, Recursion and The event loop
- **You build:** A pricing-rule engine for a shop, with a tokenizer, a parser, an interpreter and a compiler, the same stages a JavaScript engine uses

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe the stages an engine takes a file through, from source text to optimized machine code
- Explain why a syntax error stops a whole file while a runtime error stops one line
- Explain JIT compilation, optimization and deoptimization, and why consistent types and object shapes help
- Tell the engine's responsibilities from the host's, and where the event loop fits
- Read synchronous and asynchronous stack traces, and shape them with Error.captureStackTrace and stackTraceLimit
- Build a small tokenizer, parser, interpreter and compiler

## The deploy where nothing ran

A developer adds one line to the shop's startup file, deploys, and the server does not start. Not even the first log line, `"connecting to database"`, which comes *before* the new line, appears. Yesterday, when a different line had a bug (reading a property of `undefined`), the server printed everything up to that line and then crashed. Why did one broken line stop the lines before it this time?

You can see both situations side by side by giving the source text to `new Function`, which asks the engine to prepare a piece of code as a function without running it:

problem.js

```ts
const startupWithTypo = `
  console.log("connecting to database");
  console.log("starting server on port 3000";
`;
const startupWithBadValue = `
  console.log("connecting to database");
  const config = undefined;
  console.log("port", config.port);
`;

for (const [name, source] of [["typo", startupWithTypo], ["bad value", startupWithBadValue]]) {
  console.log(`--- ${name}`);
  try {
    const start = new Function(source);   // step 1: the engine reads the whole text
    start();                              // step 2: the engine runs it
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `node problem.js` and of the browser terminal

```ts
--- typo
SyntaxError: missing ) after argument list
--- bad value
connecting to database
TypeError: Cannot read properties of undefined (reading 'port')
```

The typo was found before a single line ran; the bad value was found while running, after the first line had already printed. That is because an engine does not run your file line by line as it reads it. It first reads the *whole* file and turns it into its own internal form, and only then runs it. An error in the first stage (a **syntax error**, also called an **early error**) means there is nothing to run. An error in the second stage (a **runtime error**) happens at one line, after everything before it.

This lesson walks through those stages: what the engine does with your text, how it makes code fast, how execution contexts and the stack fit in, where the host and the event loop come in, and how to read the stack traces it gives you. Then you will build the same stages yourself, for a tiny language of pricing rules.

## From text to machine code

A **JavaScript engine** is the program that runs JavaScript: V8 in Chrome and Node.js, SpiderMonkey in Firefox, JavaScriptCore in Safari ([Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro)). They differ in detail but share one design. Here is V8's, simplified:

```ts
 source text          "return priceKobo * qty;"
      │
      ▼  scanner (lexer)
 tokens               [return] [priceKobo] [*] [qty] [;]
      │
      ▼  parser
 syntax tree (AST)    Return
                        └─ Multiply
                             ├─ priceKobo
                             └─ qty
      │
      ▼  bytecode generator
 bytecode             Ldar a1 / Mul a0 / Return      ── run by the interpreter (Ignition)
      │                                                  while it collects type feedback
      ▼  when a function is "hot"
 optimized machine code  (Maglev, then TurboFan)     ── fast, but only valid for the
      │                                                  types it has seen so far
      ▼  if an assumption breaks
 deoptimize: throw the machine code away, go back to bytecode
```

V8's pipeline. Other engines have the same stages under different names.

- **Scanning** (or lexing) splits the text into **tokens**: the words of the language, such as keywords, names, numbers, strings and operators. Whitespace and comments are dropped.
- **Parsing** checks the tokens against the grammar (the rules of the language) and builds an **abstract syntax tree** (AST): a tree of objects that describes the program's structure. `priceKobo * qty` becomes a "multiply" node with two children. If the tokens do not fit the grammar, parsing fails with a `SyntaxError`, and the file never runs.
- **Bytecode** is a compact list of simple instructions for a virtual machine, generated from the AST. V8's interpreter, **Ignition**, runs it straight away. Starting quickly matters: most code on a page or in a server's startup runs only a few times.
- **Just-in-time (JIT) compilation**: while the interpreter runs, it records **type feedback** (for example "this multiplication has only ever seen small integers"). When a function becomes **hot** (it runs many times), an optimizing compiler (V8 has two: Maglev, then TurboFan) turns it into machine code specialised for those types. "Just in time" means it compiles while the program runs, based on what it has seen, rather than ahead of time.

You can ask Node.js to show the bytecode it generated for one function. For a two-line function, this is the real output on Node.js 24 (the memory addresses differ on every run):

total.js

```ts
function lineTotal(priceKobo, qty) {
  return priceKobo * qty;
}
console.log(lineTotal(950000, 2));
```

Terminal on your computer

```bash
$ node --print-bytecode --print-bytecode-filter=lineTotal total.js
[generated bytecode for function: lineTotal (0x2ea0241241a1 <SharedFunctionInfo lineTotal>)]
Bytecode length: 6
Parameter count 3
Register count 0
Frame size 0
   39 S> 0x2f133dd81a60 @    0 : 0b 04             Ldar a1
   56 E> 0x2f133dd81a62 @    2 : 41 03 00          Mul a0, [0]
   62 S> 0x2f133dd81a65 @    5 : b3                Return
Constant pool (size = 0)
Handler Table (size = 0)
Source Position Table (size = 8)
1900000
```

Three instructions: load argument 1 (`qty`) into the **accumulator** (the interpreter's working register), multiply it by argument 0 (`priceKobo`), return the accumulator. The `[0]` after `Mul` is a **feedback slot**: the place where the interpreter records which types this multiplication has seen.

### Lazy parsing

Parsing a big application fully before starting would be slow, so engines cheat a little. They **pre-parse** the body of a function they are not about to call: a quick scan that finds syntax errors and the variables it uses, without building its full tree. The full parse happens the first time the function is called. That is why a syntax error anywhere in the file is still reported before anything runs, and why a large file of functions that are never called costs little.

## Optimization and deoptimization

Optimized machine code is fast because it *assumes*: "priceKobo is always a small integer", "every order object has the same layout". Each assumption is protected by a quick check (a **guard**). When a guard fails, the engine cannot use the machine code any more; it **deoptimizes**: throws the machine code away and continues in the interpreter, and may optimize again later with wider assumptions.

Here a hot function sees 200,000 numbers, then one string (a price that came from a form without being converted), then numbers again. Node's `--trace-opt` and `--trace-deopt` flags show what the engine did:

hot.js

```ts
function lineTotal(priceKobo, qty) {
  return priceKobo * qty;
}
let sum = 0;
for (let i = 0; i < 200_000; i++) sum += lineTotal(i, 2);
sum += lineTotal("950000", 2);             // a string from a form
for (let i = 0; i < 200_000; i++) sum += lineTotal(i, 2);
console.log(sum > 0);
```

Terminal on your computer (output filtered to lineTotal, shortened)

```bash
$ node --trace-opt --trace-deopt hot.js | grep lineTotal
[marking lineTotal for optimization to MAGLEV, reason: hot and stable]
[completed compiling lineTotal (target MAGLEV)]
[marking lineTotal for optimization to TURBOFAN_JS, reason: hot and stable]
[completed optimizing lineTotal (target TURBOFAN_JS)]
[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing lineTotal ...]
```

"Hot and stable" got the function optimized twice, first by Maglev, then by TurboFan. Then the string broke the assumption "not a Smi": a **Smi** ("small integer") is V8's fast representation of integers. The function fell back to bytecode. The program still printed the right answer: deoptimization never changes *what* your code does, only how fast it runs.

Two practical lessons follow, and neither is "micro-optimise everything":

- **Keep types consistent in hot code.** Convert input at the edge (parse the form's string into a number once, when it arrives) so that inner functions always see the same types. This is also simply correct code: `"950000" * 2` happens to work, `"950000" + 2` does not.
- **Measure before optimising.** Engines are very good at ordinary code. Profile with real data ([Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools)) and fix what the profile shows.

### Hidden classes and object shapes

A property read like `order.total` could mean a slow search by name. Engines make it fast by giving objects a **hidden class** (V8 calls it a **map**, other engines a **shape**): a description of which properties an object has, in which order, and where each is stored. Objects created the same way share one hidden class. The code for `order.total` remembers "for objects of this hidden class, `total` is in slot 2", a trick called an **inline cache**. As long as the same hidden class keeps arriving, the read is a single memory access.

V8 has an internal function that tells you whether two objects share a hidden class. It is only available behind a flag, so this example switches it on from inside Node.js:

hidden-classes.jsNode.js only

```ts
import v8 from "node:v8";

v8.setFlagsFromString("--allow-natives-syntax");
const sameShape = new Function("a", "b", "return %HaveSameMap(a, b)");

const a = { id: 1, totalKobo: 950_000 };
const b = { id: 2, totalKobo: 120_000 };
const c = { totalKobo: 30_000, id: 3 };             // same properties, other order
const d = { id: 4, totalKobo: 50_000 };
d.coupon = "EID10";                                 // a property added later

console.log("a and b:", sameShape(a, b));
console.log("a and c (other order):", sameShape(a, c));
console.log("a and d (property added later):", sameShape(a, d));

function makeOrder(id, totalKobo, coupon = null) {
  return { id, totalKobo, coupon };                 // always the same properties, same order
}
console.log("two orders from one factory:", sameShape(makeOrder(5, 1), makeOrder(6, 2, "EID10")));
```

Output of `node hidden-classes.js`

```ts
a and b: true
a and c (other order): false
a and d (property added later): false
two orders from one factory: true
```

Property order and properties added later create different hidden classes. Code that sees many different shapes at one spot becomes **polymorphic** (a few shapes) or **megamorphic** (many), and slower. The habit that avoids it is one you want anyway: create objects of one kind in one place (a factory or a class constructor), with all their properties, in the same order, using `null` for "no value yet" instead of adding the property later.

> WATCH OUT
>
> `--allow-natives-syntax` exposes engine internals for experiments and tests. Never enable it in production code.

## Execution contexts, the stack and the heap

Once the code is ready, the engine runs it. [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#call-stack) introduced the pieces; here is how they fit together with what you now know about parsing.

Every piece of code runs inside an **execution context**. There is one for the module (or script) as a whole, and a new one for each function call. Setting up a context happens in two phases:

1. **Creation.** From the parse, the engine already knows every declaration in the function. It creates an **environment record** (the table of the context's variables) with all of them: `function` declarations get their function straight away; `var` gets `undefined`; `let`, `const` and `class` are created but *uninitialised*. It also sets `this` and links the record to the environment where the function was defined (the **outer environment**, which makes the scope chain and closures work).
2. **Execution.** The statements run in order.

Hoisting and the temporal dead zone are just the creation phase showing through:

creation-phase.js

```ts
function checkout() {
  console.log(typeof applyDiscount);   // function: created in the creation phase
  console.log(legacyTotal);            // undefined: var created, not yet assigned
  try {
    console.log(total);                // exists, but uninitialised until its line runs
  } catch (error) {
    console.log(error.name);
  }
  var legacyTotal = 100;
  const total = 200;
  function applyDiscount() {}
}
checkout();
```

Output of `node creation-phase.js` and of the browser terminal

```ts
function
undefined
ReferenceError
```

The **call stack** holds the execution contexts of calls in progress, the running one on top. Each entry, a **stack frame**, holds the function's local values and where to return to. The stack is small and fixed in size (around 1 MB in V8), which is why unbounded recursion ends in `RangeError: Maximum call stack size exceeded` ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion)).

The **heap** is the large area where objects, arrays, functions and closures' environments live. A frame on the stack holds *references* into the heap. When a function returns, its frame is gone at once; the objects it created stay on the heap as long as something still refers to them, which is why a closure can keep using its outer function's variables. Who cleans up the heap, and how memory leaks happen, is the subject of [the next lesson](https://zudojs.oyinlola.site/learn/js-memory).

## The engine and the host

The engine only knows the language: values, objects, functions, promises, the microtask queue. Everything that touches the outside world comes from the **host** that embeds the engine:

| Provided by | Examples |
| --- | --- |
| The engine (ECMAScript) | `Object`, `Array`, `Map`, `Promise`, `JSON`, `Math`, `Error`, `queueMicrotask`'s queue (promise jobs), parsing, JIT, garbage collection |
| Every major host | `setTimeout`, `console`, `fetch`, `URL`, `AbortController`, `structuredClone`, `queueMicrotask` |
| The browser | `document`, `window`, `localStorage`, rendering, user events |
| Node.js | `process`, `node:fs`, `node:http`, `setImmediate`, the libuv event loop |

The **event loop** belongs to the host too. The engine's job is "run this function until the stack is empty, then run the microtasks". The host decides *which* function to hand the engine next: a timer callback, a request handler, a click handler ([The event loop](https://zudojs.oyinlola.site/learn/js-event-loop)). So every task starts with an empty stack. A callback from a timer has no idea who scheduled it, and neither does its stack trace:

host-callback.js

```ts
function framesOf(error, names) {
  return error.stack.split("\n").slice(1).flatMap((line) => {
    const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(line));
    return name ? [line.includes("at async ") ? `async ${name}` : name] : [];
  });
}
const names = ["handleRequest", "scheduleReceipt", "sendReceipt"];

function sendReceipt() {
  console.log("in the timer task:", framesOf(new Error(), names));
}
function scheduleReceipt() {
  console.log("while scheduling: ", framesOf(new Error(), names));
  setTimeout(sendReceipt, 0);
}
function handleRequest() {
  scheduleReceipt();
}
handleRequest();
```

Output of `node host-callback.js` and of the browser terminal

```ts
while scheduling:  [ 'scheduleReceipt', 'handleRequest' ]
in the timer task: [ 'sendReceipt' ]
```

`framesOf` keeps only the frames of your own functions from `error.stack` (hosts add their own internal frames, which differ between Node.js and browsers). When `sendReceipt` runs, `handleRequest` and `scheduleReceipt` finished long ago: their frames are gone. If `sendReceipt` throws, the stack trace cannot tell you which request scheduled it. Log the context you need (an order id, a request id) inside the callback, or pass it along.

## Stack traces in depth

A stack trace is the call stack copied into the error's `stack` property *when the error object is created* (not when it is thrown). [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#stack-trace) showed how to read one. Three more things are worth knowing.

### Async stack traces

With `await`, V8 does better than with plain callbacks. When an async function is resumed after an `await`, the engine knows which async functions are waiting on it, and adds them to the trace marked `async`. This is called **zero-cost async stack traces**, because it costs nothing until an error is actually created:

async-trace.js

```ts
function framesOf(error, names) {
  return error.stack.split("\n").slice(1).flatMap((line) => {
    const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(line));
    return name ? [line.includes("at async ") ? `async ${name}` : name] : [];
  });
}
const names = ["handleCheckout", "chargeCard", "callGateway", "chargeCardThen"];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGateway() {
  await wait(5);
  throw new Error("gateway timeout");
}
async function chargeCard() {
  return await callGateway();
}
async function handleCheckout() {
  await chargeCard();
}

try {
  await handleCheckout();
} catch (error) {
  console.log("with await: ", framesOf(error, names));
}

function chargeCardThen() {
  return wait(5).then(() => {
    throw new Error("gateway timeout");
  });
}
try {
  await chargeCardThen();
} catch (error) {
  console.log("with .then:", framesOf(error, names));
}
```

Output of `node async-trace.js` and of the browser terminal

```ts
with await:  [ 'callGateway', 'async chargeCard', 'async handleCheckout' ]
with .then: []
```

The `await` chain kept the whole story: the error happened in `callGateway`, which was awaited by `chargeCard`, awaited by `handleCheckout`. The `.then` version lost it: the error was created inside an anonymous callback run by a timer task, with nothing on the stack below it. One more reason to prefer `async`/`await`. (The `return await` in `chargeCard` matters here too: with a bare `return`, `chargeCard` would already have finished and would not appear.)

### Shaping traces: captureStackTrace and stackTraceLimit

V8 (so Node.js and Chromium-based browsers) has two extras on `Error`:

- `Error.stackTraceLimit` is how many frames are recorded: 10 by default in V8, so in Node.js and in Chrome alike. Deep call chains (frameworks, middleware) can push your own frames past the cut-off; raising it helps when debugging, at a small cost for every error created.
- `Error.captureStackTrace(target, fn)` puts a `stack` on any object, leaving out `fn` and everything above it. Helper functions that create errors use it so the trace starts at the caller, where the mistake is, instead of inside the helper.

capture-stack.js

```ts
function framesOf(error, names) {
  return error.stack.split("\n").slice(1).flatMap((line) => {
    const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(line));
    return name ? [name] : [];
  });
}

function fail(message) {
  const error = new Error(message);
  Error.captureStackTrace(error, fail);      // hide fail itself from the trace
  return error;
}
function assertStock(qty) {
  if (qty < 0) throw fail(`stock cannot be negative: ${qty}`);
}
try {
  assertStock(-3);
} catch (error) {
  console.log(error.message, framesOf(error, ["fail", "assertStock"]));
}

function depth(n) {
  if (n === 0) return new Error("deep");
  return depth(n - 1);
}
const saved = Error.stackTraceLimit;
for (const limit of [10, 100]) {
  Error.stackTraceLimit = limit;
  console.log(`limit ${limit}: recorded ${framesOf(depth(50), ["depth"]).length} of the 51 depth frames`);
}
Error.stackTraceLimit = saved;
```

Output of `node capture-stack.js` and of the browser terminal

```ts
stock cannot be negative: -3 [ 'assertStock' ]
limit 10: recorded 10 of the 51 depth frames
limit 100: recorded 51 of the 51 depth frames
```

The trace for the negative stock starts at `assertStock`, the function that received the bad value; the helper `fail` is hidden. The recursion was 51 calls deep; with a limit of 10 (V8's default) only the top 10 frames were recorded, and raising the limit recorded all 51. The example restores the old limit at the end, because the setting is global.

### Source maps

The code that runs is often not the code you wrote: TypeScript is compiled to JavaScript, and front-end code is bundled and minified. The line numbers in a trace then point at the generated file. A **source map** is a file that maps positions in the generated code back to your source. Node.js uses them when started with `--enable-source-maps`, and browsers' developer tools use them automatically. [JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling) covers how to generate them.

## Build: a pricing-rule engine

A shop lets its staff write pricing rules as short formulas, stored in the database, for example `price * qty * 0.9` for a 10% discount or `(price - 500) * qty` for ₦5 off each item. The backend must turn such a formula into a number for every cart line. You will build it with the same stages as a JavaScript engine: a **tokenizer**, a **parser** that builds an AST, an **interpreter** that walks the tree, and a **compiler** that turns the tree into a JavaScript function once, so that running it many times is fast.

REASON IT OUT

### What can go wrong with rules written by staff?

Before writing any code, think about the input: text typed by people who are not programmers, stored, and run on every checkout.

- What should `price * * qty` or `(price - 500 * qty` produce, and how does the author find the mistake?
- Which names may a rule use? What if someone writes `process` or `constructor`?
- Should `price - 500 * qty` subtract 500 once or per item? Who decides?
- It is tempting to skip the parser and run the text with `new Function("return " + rule)`. Why is that dangerous?
- What about `price / 0`?

**Show the reasoning**

- **Bad syntax**: reject the rule when it is saved, not at checkout, with a `SyntaxError` that names the position, like an engine does. Parse once when saving; a rule that parses is guaranteed to have a valid shape.
- **Names**: allow only a fixed list (`price`, `qty`, `weightKg`). The tokenizer can check each name against it, so nothing else can ever reach the evaluator.
- **Precedence**: follow ordinary arithmetic, which staff already know: `*` and `/` before `+` and `-`, left to right, and brackets to override. So `price - 500 * qty` subtracts 500 × qty. The grammar encodes this.
- **Running raw text** is code injection: a "rule" like `process.exit()` or one that reads environment variables would run with the server's full power. Generating code from your *own* AST is safe, because the AST can only contain numbers, allowed names and four operators.
- **Division by zero** gives `Infinity` in JavaScript. The engine should refuse a non-finite result rather than charge a customer `Infinity` kobo.

### Stage 1: tokens

tokenize.js

```ts
export const ALLOWED_NAMES = new Set(["price", "qty", "weightKg"]);

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " ") { i++; continue; }
    const start = i;
    if (/[0-9.]/.test(ch)) {
      while (i < source.length && /[0-9._]/.test(source[i])) i++;
      const text = source.slice(start, i).replaceAll("_", "");
      if (!/^\d+(\.\d+)?$/.test(text)) throw new SyntaxError(`bad number "${text}" at position ${start}`);
      tokens.push({ type: "number", value: Number(text), pos: start });
    } else if (/[a-zA-Z]/.test(ch)) {
      while (i < source.length && /[a-zA-Z]/.test(source[i])) i++;
      const name = source.slice(start, i);
      if (!ALLOWED_NAMES.has(name)) throw new SyntaxError(`unknown name "${name}" at position ${start}`);
      tokens.push({ type: "name", value: name, pos: start });
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos: start });
      i++;
    } else {
      throw new SyntaxError(`unexpected "${ch}" at position ${start}`);
    }
  }
  tokens.push({ type: "end", pos: source.length });
  return tokens;
}
```

Each token keeps its position so errors can point at it. The name check happens here, at the very first stage, so a disallowed name never gets any further.

### Stage 2: the syntax tree

The parser is a **recursive descent parser**: one function per grammar rule, each calling the next for the parts that bind more tightly. The grammar, with precedence built in:

```ts
expression = term   { ("+" | "-") term }      lowest precedence, left to right
term       = factor { ("*" | "/") factor }
factor     = number | name | "(" expression ")"
```

Curly braces mean "repeated zero or more times".

parse.js

```ts
import { tokenize } from "./tokenize.js";

export function parse(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const fail = (token, what) =>
    new SyntaxError(`expected ${what} at position ${token.pos}${token.type === "end" ? " (end of rule)" : ""}`);

  function expression() {
    let node = term();
    while (peek().value === "+" || peek().value === "-") {
      const op = tokens[pos++].value;
      node = { type: "binary", op, left: node, right: term() };
    }
    return node;
  }
  function term() {
    let node = factor();
    while (peek().value === "*" || peek().value === "/") {
      const op = tokens[pos++].value;
      node = { type: "binary", op, left: node, right: factor() };
    }
    return node;
  }
  function factor() {
    const token = tokens[pos++];
    if (token.type === "number") return { type: "number", value: token.value };
    if (token.type === "name") return { type: "name", name: token.value };
    if (token.value === "(") {
      const node = expression();
      if (peek().value !== ")") throw fail(peek(), '")"');
      pos++;
      return node;
    }
    throw fail(token, "a number, a name or (");
  }

  const tree = expression();
  if (peek().type !== "end") throw fail(peek(), "an operator");
  return tree;
}
```

Try it on a good rule and on four broken ones:

parse-demo.js

```ts
import { parse } from "./parse.js";

console.log(JSON.stringify(parse("price - 500 * qty")));
for (const bad of ["price * * qty", "(price - 500 * qty", "price qty", "price * shipping"]) {
  try {
    parse(bad);
  } catch (error) {
    console.log(`${bad.padEnd(20)} ${error.name}: ${error.message}`);
  }
}
```

Output of `node parse-demo.js` and of the browser terminal

```json
{"type":"binary","op":"-","left":{"type":"name","name":"price"},"right":{"type":"binary","op":"*","left":{"type":"number","value":500},"right":{"type":"name","name":"qty"}}}
price * * qty        SyntaxError: expected a number, a name or ( at position 8
(price - 500 * qty   SyntaxError: expected ")" at position 18 (end of rule)
price qty            SyntaxError: expected an operator at position 6
price * shipping     SyntaxError: unknown name "shipping" at position 8
```

The tree for `price - 500 * qty` has the multiplication *inside* the subtraction: it is computed first. Precedence came out of the grammar's structure, with no special cases. Every broken rule was rejected with a position, before anything ran: an early error, exactly like the typo at the start of this lesson.

### Stage 3: an interpreter

An interpreter walks the tree and computes as it goes. It is short and easy to trust:

interpret.js

```ts
export function evaluate(node, vars) {
  switch (node.type) {
    case "number":
      return node.value;
    case "name":
      return vars[node.name];
    case "binary": {
      const a = evaluate(node.left, vars);
      const b = evaluate(node.right, vars);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      return a / b;
    }
  }
}
```

### Stage 4: a compiler

Walking the tree on every checkout repeats the same decisions (which node type? which operator?) millions of times. A compiler makes them once: it turns the tree into JavaScript source and asks the engine to build a function from it, which the engine can then optimise like any other hot function. This is the JIT idea at small scale. It is safe because the source is generated from the checked tree, never copied from the rule's text:

compile.js

```ts
export function compile(tree) {
  function emit(node) {
    if (node.type === "number") return String(node.value);
    if (node.type === "name") return `vars.${node.name}`;
    return `(${emit(node.left)} ${node.op} ${emit(node.right)})`;
  }
  const js = emit(tree);
  const fn = new Function("vars", `return ${js};`);
  return Object.assign(
    (vars) => {
      const result = fn(vars);
      if (!Number.isFinite(result)) throw new RangeError(`rule produced ${result}`);
      return Math.round(result);
    },
    { source: js },
  );
}
```

Now test the whole engine: the same rules through the interpreter and the compiled function, the error cases, and a speed comparison over many cart lines:

rules-test.js

```ts
import { parse } from "./parse.js";
import { evaluate } from "./interpret.js";
import { compile } from "./compile.js";

const line = { price: 950_000, qty: 3, weightKg: 5 };
const rules = {
  "10% off": "price * qty * 0.9",
  "₦5 off each": "(price - 500) * qty",
  "delivery by weight": "price * qty + weightKg * 20_000",
};

for (const [name, rule] of Object.entries(rules)) {
  const tree = parse(rule);
  const compiled = compile(tree);
  const same = Math.round(evaluate(tree, line)) === compiled(line);
  console.log(`${name.padEnd(19)} ${compiled(line)} kobo, interpreter agrees: ${same}, compiled to ${compiled.source}`);
}

try {
  compile(parse("price / (qty - 3)"))(line);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

const tree = parse("(price - 500) * qty + weightKg * 20_000");
const compiled = compile(tree);
const lines = Array.from({ length: 300_000 }, (_, i) => ({ price: 10_000 + i, qty: 1 + (i % 5), weightKg: i % 7 }));

function fastestOf(runs, work) {        // the best of several runs ignores one-off pauses
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    work();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}
let a = 0;
let b = 0;
const interpretedMs = fastestOf(5, () => { a = 0; for (const l of lines) a += evaluate(tree, l); });
const compiledMs = fastestOf(5, () => { b = 0; for (const l of lines) b += compiled(l); });

console.log("same total:", a === b, "| compiled was faster:", compiledMs < interpretedMs);
```

Output of `node rules-test.js` and of the browser terminal

```ts
10% off             2565000 kobo, interpreter agrees: true, compiled to ((vars.price * vars.qty) * 0.9)
₦5 off each         2848500 kobo, interpreter agrees: true, compiled to ((vars.price - 500) * vars.qty)
delivery by weight  2950000 kobo, interpreter agrees: true, compiled to ((vars.price * vars.qty) + (vars.weightKg * 20000))
RangeError: rule produced Infinity
same total: true | compiled was faster: true
```

Both paths agree on every rule. Division by zero was refused instead of producing `Infinity`. And the compiled function was faster over 300,000 cart lines (timing the best of five runs, so a single pause of the machine cannot decide the result), for the same reason V8 compiles hot functions: the decisions about the tree were made once, and the engine optimised the generated function.

Real engines are enormously more complex, but you have now written every stage: **scanning** into tokens, **parsing** into a tree (with early errors), **interpreting** the tree, and **compiling** it into faster code.

## In production

- **Syntax errors stop a whole file**, so run your code (or at least a type check and a linter) in CI before deploying. A startup that fails before logging anything is usually a syntax or import error.
- **Convert input types at the edge.** Hot functions stay fast, and code stays correct, when they always receive the same types.
- **Create objects of one kind in one place**, with all their properties in the same order.
- **Prefer `await` chains** for readable async stack traces, and include context (order id, request id) in errors and logs, because callbacks from timers and events start with an empty stack.
- **Ship source maps** (and start Node.js with `--enable-source-maps`) so production traces point at the code you wrote.
- **Never run user-provided text as code** (`eval`, `new Function`, `vm` with user strings). If users need formulas, parse them into a tree you control, as the rule engine does.

## Practice

TRY IT YOURSELF

### Syntax error or runtime error?

For each snippet, predict whether `new Function(source)` throws (a syntax error: nothing runs) or the function throws when called (a runtime error: earlier lines run). Then check.

which-error.js

```ts
const snippets = {
  "missing bracket": "console.log('a'); if (true { }",
  "undefined property": "console.log('a'); null.total;",
  "const reassigned": "const vat = 7.5; console.log('a'); vat = 8;",
  "duplicate let": "let qty = 1; console.log('a'); let qty = 2;",
};

for (const [name, source] of Object.entries(snippets)) {
  let printed = false;
  const log = console.log;
  console.log = () => (printed = true);
  let when;
  try {
    const fn = new Function(source);
    try { fn(); when = "ran fine"; } catch (e) { when = `runtime ${e.name}`; }
  } catch (e) {
    when = `early ${e.name}`;
  }
  console.log = log;
  console.log(`${name.padEnd(18)} ${when.padEnd(22)} first line printed: ${printed}`);
}
```

Output of `node which-error.js` and of the browser terminal

```ts
missing bracket    early SyntaxError      first line printed: false
undefined property runtime TypeError      first line printed: true
const reassigned   runtime TypeError      first line printed: true
duplicate let      early SyntaxError      first line printed: false
```

**Show a solution**

The missing bracket and the duplicate `let` are early errors: the grammar forbids them, so the parser rejects the code and nothing prints. Reading a property of `null` is a runtime `TypeError`. Assigning to a `const` is also a runtime `TypeError`, even though the engine could see it in the text: the specification defines it as an error at the moment of assignment. Early errors are exactly the ones the grammar and its static rules forbid.

TRY IT YOURSELF

### Add a min function to the rules

Staff want `min(price * qty, 5_000_000)` to cap a line at ₦50,000. Extend the tokenizer to allow `min` and a comma, the grammar with `factor = "min" "(" expression "," expression ")"`, and the interpreter. Keep the name whitelist working.

**Show a solution**

rules-min.js

```ts
function tokenize(source) {
  const tokens = [];
  const re = /\s*(?:(\d[\d_]*(?:\.\d+)?)|([a-zA-Z]+)|([-+*/(),]))/y;
  let m;
  while (re.lastIndex < source.length && (m = re.exec(source))) {
    const pos = m.index + m[0].length - (m[1] ?? m[2] ?? m[3]).length;
    if (m[1]) tokens.push({ type: "number", value: Number(m[1].replaceAll("_", "")), pos });
    else if (m[2]) {
      if (!["price", "qty", "min"].includes(m[2])) throw new SyntaxError(`unknown name "${m[2]}" at position ${pos}`);
      tokens.push({ type: "name", value: m[2], pos });
    } else tokens.push({ type: "op", value: m[3], pos });
  }
  if (re.lastIndex < source.length && source.slice(re.lastIndex).trim()) {
    throw new SyntaxError(`unexpected "${source.slice(re.lastIndex).trim()[0]}"`);
  }
  tokens.push({ type: "end", pos: source.length });
  return tokens;
}

function parse(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const expect = (value) => {
    if (tokens[pos].value !== value) throw new SyntaxError(`expected "${value}" at position ${tokens[pos].pos}`);
    pos++;
  };
  const expression = () => {
    let node = term();
    while (["+", "-"].includes(tokens[pos].value)) node = { type: "binary", op: tokens[pos++].value, left: node, right: term() };
    return node;
  };
  const term = () => {
    let node = factor();
    while (["*", "/"].includes(tokens[pos].value)) node = { type: "binary", op: tokens[pos++].value, left: node, right: factor() };
    return node;
  };
  const factor = () => {
    const t = tokens[pos++];
    if (t.type === "number") return { type: "number", value: t.value };
    if (t.value === "min") {
      expect("(");
      const a = expression();
      expect(",");
      const b = expression();
      expect(")");
      return { type: "min", args: [a, b] };
    }
    if (t.type === "name") return { type: "name", name: t.value };
    if (t.value === "(") {
      const node = expression();
      expect(")");
      return node;
    }
    throw new SyntaxError(`unexpected token at position ${t.pos}`);
  };
  const tree = expression();
  if (tokens[pos].type !== "end") throw new SyntaxError(`expected an operator at position ${tokens[pos].pos}`);
  return tree;
}

function evaluate(node, vars) {
  if (node.type === "number") return node.value;
  if (node.type === "name") return vars[node.name];
  if (node.type === "min") return Math.min(...node.args.map((a) => evaluate(a, vars)));
  const a = evaluate(node.left, vars);
  const b = evaluate(node.right, vars);
  return { "+": a + b, "-": a - b, "*": a * b, "/": a / b }[node.op];
}

const rule = parse("min(price * qty, 5_000_000)");
console.log(evaluate(rule, { price: 950_000, qty: 2 }), evaluate(rule, { price: 950_000, qty: 9 }));
try {
  parse("min(price * qty 5_000_000)");
} catch (error) {
  console.log(error.message);
}
```

Output of `node rules-min.js` and of the browser terminal

```ts
1900000 5000000
expected "," at position 16
```

This version uses a sticky regular expression (the `y` flag, see [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp)) to read one token at a time. Adding a construct to a language always touches every stage: the tokenizer learns the new words, the grammar the new shape, and the interpreter its meaning.

TRY IT YOURSELF

### Find who scheduled the failing callback

A receipt job fails inside a timer callback, and the stack trace does not show which order it was for. Change `scheduleReceipt` so that the error thrown later carries the order id and the stack of the *scheduling* call as its `cause`.

**Show a solution**

scheduled-cause.js

```ts
function framesOf(error, names) {
  return error.stack.split("\n").slice(1).flatMap((line) => {
    const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(line));
    return name ? [name] : [];
  });
}
const names = ["handleCheckout", "scheduleReceipt", "sendReceipt"];

function sendReceipt(order) {
  if (!order.email) throw new Error("no email address");
}

function scheduleReceipt(order) {
  const scheduledAt = new Error("scheduled here");      // captures the stack now
  setTimeout(() => {
    try {
      sendReceipt(order);
    } catch (error) {
      const wrapped = new Error(`receipt for order ${order.id} failed: ${error.message}`, { cause: scheduledAt });
      console.log(wrapped.message);
      console.log("failed in:", framesOf(error, names));
      console.log("scheduled from:", framesOf(wrapped.cause, names));
    }
  }, 0);
}

function handleCheckout(order) {
  scheduleReceipt(order);
}
handleCheckout({ id: 7, email: null });
```

Output of `node scheduled-cause.js` and of the browser terminal

```ts
receipt for order 7 failed: no email address
failed in: [ 'sendReceipt' ]
scheduled from: [ 'scheduleReceipt', 'handleCheckout' ]
```

An `Error` records the stack when it is *created*. Creating one at scheduling time and attaching it as the `cause` keeps the story that the event loop would otherwise lose. It costs a little per call, so do it where the information is worth it.

## Recap

- An engine scans text into tokens, parses them into a syntax tree, generates bytecode and runs it in an interpreter; hot functions are JIT-compiled into optimized machine code.
- Syntax (early) errors are found before anything runs; runtime errors happen at one line, after the lines before it.
- Optimized code relies on assumptions about types and object shapes; when one breaks, the engine deoptimizes. Keep types consistent and create objects in one place with the same properties in the same order.
- Each call gets an execution context, created in two phases (declarations first, which explains hoisting and the TDZ). Frames live on the stack; objects live on the heap.
- The engine runs code; the host (browser or Node.js) provides I/O, timers and the event loop. Each task starts with an empty stack.
- `await` gives async stack traces; plain callbacks do not. `Error.captureStackTrace` and `Error.stackTraceLimit` shape traces; source maps map them back to your source.

Next: [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory), where you find out what happens to all those objects on the heap, and how to find a memory leak.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
