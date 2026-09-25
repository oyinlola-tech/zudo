---
title: "Designing error handling — ZudoJS Academy"
description: "Decide which layer handles each error, chain causes, collect failures with AggregateError, and build a payment flow that never loses an error."
source: https://zudojs.oyinlola.site/learn/js-error-design
---

LEVEL 4 · LESSON 19 OF 20

Errors and modules in depth Core

# Designing error handling

Decide which layer handles each error, chain causes, collect failures with AggregateError, and build a payment flow that never loses an error.

- **55 min** to read and try
- **You need:** Handling errors, Asynchronous JavaScript, Functional JavaScript and Generators
- **You build:** A layered payment flow (gateway client, payment service, order service, HTTP boundary) with retries, compensation, cause chains and one log line per failure, tested against a fake gateway

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Classify an error as expected, environmental or a bug, and decide whether it is recoverable
- Choose for each layer whether to handle, translate or let an error propagate, and log it exactly once
- Wrap errors with { cause } at layer boundaries and read a cause chain
- Report several failures at once with AggregateError
- Place error boundaries at the edges of a program: requests, jobs, the process
- Recognise every way an error gets swallowed, and test error paths

## The order that was confirmed but never paid

[Handling errors](https://zudojs.oyinlola.site/learn/js-errors) taught the tools: `throw`, `try`/`catch`/`finally`, error classes, `cause`, and turning errors into safe API responses. Tools are not a design. Here is what happens when every layer of a real checkout uses them with good intentions and no plan:

problem.js

```ts
const logs = [];
const log = (line) => logs.push(line);

function gatewayCharge(orderId, kobo) {
  throw new Error("ETIMEDOUT: gateway did not answer in 10s");
}

function chargeCard(orderId, kobo) {
  try {
    return gatewayCharge(orderId, kobo);
  } catch (error) {
    log(`chargeCard failed: ${error.message}`);
    return null;
  }
}

function placeOrder(order) {
  try {
    const charge = chargeCard(order.id, order.totalKobo);
    return { ...order, status: "confirmed", chargeId: charge?.id ?? "unknown" };
  } catch (error) {
    log(`placeOrder failed: ${error.message}`);
    throw new Error("Order failed");
  }
}

console.log(placeOrder({ id: "ORD-7", totalKobo: 2327850 }));
console.log(logs);
```

Output of `node problem.js` and of the browser terminal

```json
{
  id: 'ORD-7',
  totalKobo: 2327850,
  status: 'confirmed',
  chargeId: 'unknown'
}
[ 'chargeCard failed: ETIMEDOUT: gateway did not answer in 10s' ]
```

The customer sees "confirmed", the warehouse ships ₦23,278.50 of goods, and no money was taken. Every piece of this code "handles errors", and together they produced the worst possible outcome:

- `chargeCard` caught an error it could do nothing about, logged it, and returned `null`. The error was **swallowed**: turned into an ordinary-looking value that the caller did not check.
- `placeOrder`'s `catch` never ran, because nothing was thrown any more. If it had run, it would have replaced the real reason with "Order failed" and thrown away the original error.
- A timeout is also ambiguous: the gateway may have charged the card and failed to answer. Nobody asked that question.

Error handling is a design problem: *for each kind of failure, which layer can actually do something about it, and what should every other layer do?* This lesson gives you a way to answer that, the language features that support it (`cause` chains, `AggregateError`, boundaries), and ends with this payment flow rebuilt so that no error can be lost.

## Three kinds of failure

Before deciding who handles an error, decide what kind it is. A useful classification has three groups, and they call for completely different responses:

| Kind | Examples | Who can do something | Typical response |
| --- | --- | --- | --- |
| **Expected outcomes** (sometimes called operational or domain errors) | Card declined, insufficient stock, invalid input, order not found, daily limit reached | The user, or the business logic | Tell the user precisely; offer an alternative. Not a bug; do not page anyone. |
| **Environment failures** | Network timeout, database down, rate limited by a provider, disk full | Retry logic, fallbacks, operators | Retry if safe, fall back if possible, otherwise fail the request cleanly and alert if it persists. |
| **Bugs** (programmer errors) | `TypeError: Cannot read properties of undefined`, a broken invariant, calling a function with the wrong arguments | A developer, by changing the code | Do not try to recover. Fail the request, log everything, fix the code. |

This also answers "is it **recoverable**?". An expected outcome is recoverable by design: the program has a planned path for it. An environment failure *may* be recoverable by waiting or trying elsewhere. A bug is not recoverable by the running program: the code's assumptions are wrong, so any "recovery" code is running on assumptions that are also wrong. That is why catching a `TypeError` and carrying on is almost never correct.

### Make the kind visible in the type

Code can only treat kinds differently if it can tell them apart. Give expected outcomes and environment failures their own classes (or a machine-readable `code`), and let bugs stay as the built-in `TypeError`, `RangeError` and friends. One common convention is a flag that says whether retrying could help:

kinds.js

```ts
export class AppError extends Error {
  constructor(message, { code, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
  }
}
export class CardDeclinedError extends AppError {
  constructor(reason) {
    super(`card declined: ${reason}`, { code: "CARD_DECLINED" });
    this.reason = reason;
  }
}
export class GatewayUnavailableError extends AppError {
  constructor(message, { cause } = {}) {
    super(message, { code: "GATEWAY_UNAVAILABLE", retryable: true, cause });
  }
}

export function kindOf(error) {
  if (error instanceof AppError) return error.retryable ? "environment" : "expected";
  return "bug";
}
```

use-kinds.js

```ts
import { CardDeclinedError, GatewayUnavailableError, kindOf } from "./kinds.js";

const failures = [
  new CardDeclinedError("insufficient funds"),
  new GatewayUnavailableError("gateway returned 503"),
  (() => { try { null.id; } catch (error) { return error; } })(),
];

for (const error of failures) console.log(kindOf(error).padEnd(12), `${error.name}: ${error.message}`);
```

Output of `node use-kinds.js` and of the browser terminal

```ts
expected     CardDeclinedError: card declined: insufficient funds
environment  GatewayUnavailableError: gateway returned 503
bug          TypeError: Cannot read properties of null (reading 'id')
```

Anything that is not one of your deliberate error classes is treated as a bug by default. That is the safe default: an unknown error must never be mistaken for "card declined" and shown to a customer, and never be retried blindly.

## Handle, translate or let it pass

When a function calls something that can throw, it has exactly three honest choices:

1. **Handle it**: the function knows a correct way to continue. A retry succeeded; a cached exchange rate is good enough; "not found" means "create a new cart". After handling, the error is gone, and the result must be genuinely correct.
2. **Translate it**: the function cannot recover, but it can say what the failure means *at its level*. A payment service turns "HTTP 503 from gateway" into `GatewayUnavailableError`, keeping the original as the `cause`.
3. **Let it pass**: do nothing. The error keeps unwinding the call stack to a caller that can handle or translate it. This is the default, and it is correct far more often than beginners expect.

What is not on the list: catching an error in order to log it and then continue as if nothing happened (swallowing), and catching, logging and re-throwing in every layer. The second one is not dangerous, but it turns one failure into a pile of duplicate log lines that hide the order of events:

log-once.js

```ts
const logs = [];

function gateway() {
  throw new Error("gateway returned 503");
}
function payments() {
  try {
    return gateway();
  } catch (error) {
    logs.push(`payments: ${error.message}`);
    throw error;
  }
}
function orders() {
  try {
    return payments();
  } catch (error) {
    logs.push(`orders: ${error.message}`);
    throw error;
  }
}
function handleRequest() {
  try {
    return orders();
  } catch (error) {
    logs.push(`request failed: ${error.message}`);
    return { status: 503 };
  }
}

console.log(handleRequest());
console.log(logs);
```

Output of `node log-once.js` and of the browser terminal

```json
{ status: 503 }
[
  'payments: gateway returned 503',
  'orders: gateway returned 503',
  'request failed: gateway returned 503'
]
```

Three log lines for one failure. In a busy service, an alert counting "errors per minute" now fires three times too often, and anyone reading the logs has to work out that these are the same event. The rule: **log an error once, at the place that handles it**. Layers in between either translate it (adding information through `cause`, not through extra log lines) or leave it alone. The `try`/`catch` in `payments` and `orders` above can simply be deleted.

```ts
  HTTP boundary   catches everything · logs once · maps to a response
       ▲
  order service   handles: stock conflicts, compensation (refund) · lets the rest pass
       ▲
  payment service handles: retry transient failures · translates gateway errors
       ▲
  gateway client  translates: HTTP status and network errors → typed errors
       ▲
  fetch / socket  throws low-level errors (ETIMEDOUT, ECONNRESET, 5xx)
```

Each layer handles only what it can act on. Errors travel upward; logging happens at the top.

## Cause chains: context without losing detail

Translating an error must never throw away the original: it is the detail a developer needs to find the root. The `cause` option (introduced in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors#error-objects)) links the new error to the old one, and each layer can add its own link. The result is a **cause chain**: the top says what failed in business terms, the bottom says what actually broke.

cause-chain.js

```ts
class GatewayUnavailableError extends Error {
  name = "GatewayUnavailableError";
}
class PaymentFailedError extends Error {
  name = "PaymentFailedError";
}

function httpPost() {
  const error = new Error("connect ECONNREFUSED 10.0.4.2:443");
  error.code = "ECONNREFUSED";
  throw error;
}
function chargeViaGateway(orderId) {
  try {
    return httpPost();
  } catch (error) {
    throw new GatewayUnavailableError(`gateway unreachable while charging ${orderId}`, { cause: error });
  }
}
function payForOrder(orderId) {
  try {
    return chargeViaGateway(orderId);
  } catch (error) {
    throw new PaymentFailedError(`payment for ${orderId} could not be completed`, { cause: error });
  }
}

function describeChain(error) {
  const lines = [];
  for (let current = error, depth = 0; current && depth < 10; current = current.cause, depth++) {
    const code = current.code ? ` [${current.code}]` : "";
    lines.push(`${"  ".repeat(depth)}${depth ? "caused by " : ""}${current.name}${code}: ${current.message}`);
  }
  return lines.join("\n");
}

try {
  payForOrder("ORD-7");
} catch (error) {
  console.log(describeChain(error));
  console.log("root is a network error:", error.cause.cause.code === "ECONNREFUSED");
}
```

Output of `node cause-chain.js` and of the browser terminal

```ts
PaymentFailedError: payment for ORD-7 could not be completed
  caused by GatewayUnavailableError: gateway unreachable while charging ORD-7
    caused by Error [ECONNREFUSED]: connect ECONNREFUSED 10.0.4.2:443
root is a network error: true
```

Each layer added a sentence in its own vocabulary (orders, gateway, network) and kept everything below it. `describeChain` is the kind of helper a logger uses to print the whole chain in one log entry; the depth limit protects against a chain that loops back on itself. (`console.log(error)` in Node also prints causes, as `[cause]:` blocks under the stack trace.)

Two design points:

- **Translate at boundaries, not everywhere.** A good place to wrap is where the vocabulary changes: network → gateway, gateway → payment. Wrapping in every function adds links that say nothing new.
- **Keep machine-readable facts.** Messages are for people. Code that decides (retry? which HTTP status?) should read `name`, a `code` or a flag like `retryable`, from the top error or by searching the chain. Parsing message text breaks the day someone rewords it.

### Things that are thrown but are not errors

JavaScript can throw any value, and some libraries do throw strings or plain objects. A catch block therefore cannot assume it received an `Error` (TypeScript types the `catch` variable as `unknown` for this reason). Normalise at the edge where foreign code is called. `Error.isError(value)` (ES2026; available in Node.js 24 and Chromium-based browsers, so check any other runtime you target) checks for a real error object, even one created in another realm such as an iframe or a `vm` context, where `instanceof Error` fails:

normalise.js

```ts
function toError(value) {
  if (Error.isError(value)) return value;
  return new Error(`non-error thrown: ${JSON.stringify(value)}`, { cause: value });
}

const thrown = [new TypeError("bad"), "insufficient funds", { code: 51 }, undefined];
for (const value of thrown) {
  try {
    throw value;
  } catch (caught) {
    const error = toError(caught);
    console.log(`${error.name}: ${error.message}`);
  }
}
console.log(Error.isError({ name: "Error", message: "fake", stack: "" }));
```

Output of `node normalise.js` and of the browser terminal

```ts
TypeError: bad
Error: non-error thrown: "insufficient funds"
Error: non-error thrown: {"code":51}
Error: non-error thrown: undefined
false
```

## Several failures at once: AggregateError

Some operations fail in more than one way at the same time. A cart can have three invalid lines; a batch of vendor payouts can have two failures among fifty successes; a fallback can fail after the main path already failed. Reporting only the first failure hides the others, and the user fixes one line, submits, and is told about the next. `AggregateError` is the built-in error that carries a list: `new AggregateError(errors, message, { cause })`, with the list in `.errors`.

### Collecting validation problems

aggregate-validate.js

```ts
class InvalidLineError extends Error {
  name = "InvalidLineError";
  constructor(sku, problem) {
    super(`${sku}: ${problem}`);
    this.sku = sku;
  }
}

function validateCart(lines, stock) {
  const problems = [];
  for (const line of lines) {
    if (!(line.sku in stock)) problems.push(new InvalidLineError(line.sku, "unknown product"));
    else if (!Number.isInteger(line.qty) || line.qty < 1) problems.push(new InvalidLineError(line.sku, `bad quantity ${line.qty}`));
    else if (line.qty > stock[line.sku]) problems.push(new InvalidLineError(line.sku, `only ${stock[line.sku]} left`));
  }
  if (problems.length > 0) throw new AggregateError(problems, `${problems.length} cart lines are invalid`);
  return lines;
}

try {
  validateCart(
    [{ sku: "RICE-5", qty: 2 }, { sku: "TV-99", qty: 1 }, { sku: "OIL-1", qty: 0 }, { sku: "SALT", qty: 9 }],
    { "RICE-5": 10, "OIL-1": 3, SALT: 4 },
  );
} catch (error) {
  console.log(error.name, "-", error.message);
  for (const problem of error.errors) console.log("  ", problem.message);
  console.log(error.errors.map((problem) => problem.sku));
}
```

Output of `node aggregate-validate.js` and of the browser terminal

```ts
AggregateError - 3 cart lines are invalid
   TV-99: unknown product
   OIL-1: bad quantity 0
   SALT: only 4 left
[ 'TV-99', 'OIL-1', 'SALT' ]
```

The customer sees every problem at once, and each item in `.errors` keeps its own type and fields (the `sku`), so an API can return a structured list.

### Partial failure in a batch

Paying fifty vendors at the end of the day is fifty independent operations. One failure must not stop the other forty-nine, and must not be lost either. `Promise.allSettled` ([Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#allsettled)) waits for all of them; the failures are then gathered into one `AggregateError` for the caller:

payouts.js

```ts
async function payVendor(vendor) {
  await null;
  if (vendor.account === null) throw new Error(`${vendor.name}: no bank account on file`);
  if (vendor.kobo > 50000000) throw new Error(`${vendor.name}: above the single-transfer limit`);
  return `${vendor.name} paid ₦${vendor.kobo / 100}`;
}

async function payAll(vendors) {
  const results = await Promise.allSettled(vendors.map(payVendor));
  const paid = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (failures.length > 0) {
    const error = new AggregateError(failures, `${failures.length} of ${vendors.length} payouts failed`);
    error.paid = paid;
    throw error;
  }
  return paid;
}

try {
  await payAll([
    { name: "Mama Put Foods", account: "0123", kobo: 1500000 },
    { name: "Ade Prints", account: null, kobo: 300000 },
    { name: "Kano Grains", account: "0456", kobo: 90000000 },
    { name: "Eko Oils", account: "0789", kobo: 720000 },
  ]);
} catch (error) {
  console.log(error.message);
  console.log("paid:", error.paid);
  console.log("failed:", error.errors.map((e) => e.message));
}
```

Output of `node payouts.js` and of the browser terminal

```ts
2 of 4 payouts failed
paid: [ 'Mama Put Foods paid ₦15000', 'Eko Oils paid ₦7200' ]
failed: [
  'Ade Prints: no bank account on file',
  'Kano Grains: above the single-transfer limit'
]
```

The caller learns both halves: which vendors were paid (so they are not paid twice when the batch is retried) and why each failure happened. `Promise.any`, which succeeds when any promise succeeds, uses `AggregateError` the same way when *all* of them fail ([Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#any)).

> WATCH OUT
>
> Do not use `AggregateError` just to throw two errors "to be safe". It is for genuinely independent failures that the caller needs to see together. For one failure with a history, use a `cause` chain.

## Recovering correctly: retry, fallback, compensate

Handling an error means the program continues *correctly*. Three recovery strategies cover most real cases, and each has a condition that must be true first.

### Retry: only if trying again is safe

A retry is safe when the operation is **idempotent**: doing it twice has the same effect as doing it once. Reading an order is idempotent. Charging a card is not, unless you make it so: payment gateways accept an **idempotency key**, a unique id for the *intent* ("charge for ORD-7"), and will not charge twice for the same key. That also resolves the ambiguous timeout from the first section: retrying with the same key either completes the charge or returns the one that already happened. And only retry errors marked as retryable; retrying "card declined" just annoys the bank.

### Fallback: only if the substitute is acceptable

If the live exchange rate service is down, a rate cached ten minutes ago may be fine for showing prices, and unacceptable for settling a payment. A fallback is a business decision, and it must be visible: log that it happened, and never fall back silently from an error that means "your code is wrong".

### Compensate: undo what already happened

Some operations cannot be wrapped in one database transaction because they span systems. If the card was charged and then saving the order fails, the program cannot "un-throw". It must **compensate**: run an action that reverses the first step, a refund. If the compensation also fails, both failures matter, and a person must be told.

compensate.js

```ts
async function checkout({ charge, refund, saveOrder }, order) {
  const payment = await charge(order);
  try {
    return await saveOrder({ ...order, chargeId: payment.id });
  } catch (saveError) {
    try {
      await refund(payment.id);
    } catch (refundError) {
      throw new AggregateError([saveError, refundError], `order ${order.id} not saved and refund of ${payment.id} failed: manual action needed`);
    }
    throw new Error(`order ${order.id} not saved; payment ${payment.id} refunded`, { cause: saveError });
  }
}

const order = { id: "ORD-7", totalKobo: 2327850 };
const charge = async () => ({ id: "ch_881" });
const failingSave = async () => { throw new Error("database: connection lost"); };

for (const refund of [async () => {}, async () => { throw new Error("gateway: refund window closed"); }]) {
  try {
    await checkout({ charge, refund, saveOrder: failingSave }, order);
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
    const inner = error instanceof AggregateError ? error.errors : [error.cause];
    for (const e of inner) console.log("   -", e.message);
  }
}
```

Output of `node compensate.js` and of the browser terminal

```ts
Error: order ORD-7 not saved; payment ch_881 refunded
   - database: connection lost
AggregateError: order ORD-7 not saved and refund of ch_881 failed: manual action needed
   - database: connection lost
   - gateway: refund window closed
```

In both cases the error still propagates: compensation is cleanup, not recovery. The request fails either way; what compensation changes is whether the customer keeps their money. The second case produces an error an operator must act on, which is exactly what the `AggregateError` carries.

## How errors get swallowed

A swallowed error is worse than a crash: the program keeps running on a false assumption, and there is nothing in the logs to explain the damage later. Most swallowing is accidental. Here are the common forms in one file:

swallowing.js

```ts
function emptyCatch() {
  try {
    JSON.parse("{ broken");
  } catch {}
  return "carried on";
}

function returnInFinally() {
  try {
    throw new Error("charge failed");
  } finally {
    return "finally won";
  }
}

async function forgottenAwait() {
  try {
    return Promise.reject(new Error("saved nothing"));
  } catch {
    return "caught";
  }
}

async function awaited() {
  try {
    return await Promise.reject(new Error("saved nothing"));
  } catch (error) {
    return `caught: ${error.message}`;
  }
}

console.log(emptyCatch());
console.log(returnInFinally());
forgottenAwait().then(
  (value) => console.log("forgottenAwait resolved:", value),
  (error) => console.log("forgottenAwait rejected past its own catch:", error.message),
);
console.log(await awaited());
const settled = await Promise.resolve().then(() => { throw new Error("background job failed"); }).catch(() => {});
console.log("fire-and-forget .catch(() => {}):", settled);
```

Output of `node swallowing.js` and of the browser terminal

```ts
carried on
finally won
caught: saved nothing
forgottenAwait rejected past its own catch: saved nothing
fire-and-forget .catch(() => {}): undefined
```

- **Empty `catch {}`**: the error is gone. If ignoring a failure really is correct (a best-effort cache write), say so in a comment and at least count it in a metric.
- **`return` in `finally`**: a `return` (or `throw`) in `finally` replaces whatever the `try` was doing, including a thrown error. Use `finally` only for cleanup.
- **`return promise` without `await` inside `try`**: the function hands the promise back without waiting for it, so its rejection only takes effect after the function has left the `try`. `return await` keeps it inside. Here the error still reached the caller, but the function's own `catch`, which might have translated it, never ran.
- **`.catch(() => {})`** turns a rejection into `undefined`, the promise version of an empty `catch`.
- **Returning `null` or `false` for failure**, as `chargeCard` did at the start: callers who forget to check carry on with a value that means "failed" as if it meant "succeeded".

### Result values: when failure is normal

Returning a value for failure is not wrong in itself; the problem is a value that *looks like* success. When a failure is a normal, expected outcome that every caller must handle, a **result object** makes that explicit: `{ ok: true, value }` or `{ ok: false, error }`. The transfer limiter in [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#build) did exactly this. The rule of thumb:

- Return a result when the caller is expected to branch on the outcome every time (validation of a form, a limiter, "is this coupon valid?").
- Throw when the caller usually cannot continue and the error should travel up to someone who can (a failed charge, a lost database connection, a bug).

## Error boundaries at the edges

Letting errors propagate only works if something at the top catches them. An **error boundary** is that something: a place, at the edge of a unit of work, that catches *everything*, logs it once with its full cause chain, turns it into the right outcome for that edge, and lets the rest of the program keep running. Each kind of program has its own edges:

| Edge | Unit of work | What the boundary does |
| --- | --- | --- |
| HTTP handler | One request | Map expected errors to 4xx with a safe message; everything else to a generic 500. Log once. (The calculator API in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors#build) is one.) |
| Job or message worker | One job | Mark the job failed or schedule a retry; the worker keeps taking jobs. One bad job must not stop the queue. |
| Scheduled task, CLI command | One run | Log, set a non-zero exit code, clean up. |
| The process | Everything | Last resort for errors that escaped every other boundary: log, then shut down cleanly and let a supervisor restart the process. |

A job worker boundary, where each job is isolated from the others:

worker-boundary.js

```ts
const jobs = [
  { id: 1, type: "send-receipt", orderId: "ORD-7" },
  { id: 2, type: "send-receipt", orderId: null },
  { id: 3, type: "resize-image", orderId: "ORD-8" },
  { id: 4, type: "send-receipt", orderId: "ORD-9" },
];

const handlers = {
  "send-receipt": (job) => `receipt for ${job.orderId.toUpperCase()} sent`,
};

function runJob(job) {
  const handler = handlers[job.type];
  if (!handler) throw new Error(`no handler for job type ${job.type}`);
  return handler(job);
}

const summary = { done: 0, failed: 0 };
for (const job of jobs) {
  try {
    console.log(`job ${job.id}: ${runJob(job)}`);
    summary.done += 1;
  } catch (error) {
    summary.failed += 1;
    console.log(`job ${job.id} FAILED (${error.name}: ${error.message})`);
  }
}
console.log(summary);
```

Output of `node worker-boundary.js` and of the browser terminal

```ts
job 1: receipt for ORD-7 sent
job 2 FAILED (TypeError: Cannot read properties of null (reading 'toUpperCase'))
job 3 FAILED (Error: no handler for job type resize-image)
job 4: receipt for ORD-9 sent
{ done: 2, failed: 2 }
```

Job 2 hit a bug and job 3 hit a configuration gap, yet jobs 1 and 4 were done. Without a boundary per job, the first failure would have stopped the loop, and every job after it would have waited for a restart. `@zudojs/queue` and `@zudojs/http` put these boundaries in for you; knowing why they exist tells you not to add a second, swallowing layer of your own inside them.

### The process boundary in Node

An error that escapes everything, such as a rejected promise nobody awaited, reaches the process. Node's default for an unhandled rejection is to print it and exit with code 1, which is the right behaviour: the process is in an unknown state ([Promises in depth](https://zudojs.oyinlola.site/learn/js-promises#unhandled) showed when a rejection counts as unhandled). You can hook in to log it properly first, but not to "keep going". Installing an `unhandledRejection` listener *replaces* the default crash, so the listener itself must make the process end with a failure:

process-boundary.jsNode.js only

```ts
process.on("unhandledRejection", (reason) => {
  console.log(`fatal: unhandled rejection: ${reason.message}`);
  process.exitCode = 1;
});

async function nightlyReport() {
  throw new Error("report query timed out");
}

nightlyReport();
console.log("main code finished");
```

Output of `node process-boundary.js`

```ts
main code finished
fatal: unhandled rejection: report query timed out
```

This short script has nothing left to run, so setting `process.exitCode` is enough: Node exits with code 1 once the loop is empty. A server always has something left to run (its listening socket), so its listener must start a shutdown: stop accepting requests, finish the ones in flight, close connections and exit, which is the job of a lifecycle manager ([the ZudoJS runtime](https://zudojs.oyinlola.site/learn/zudo-runtime) handles shutdown signals this way). The process boundary is a safety net for bugs, not a place to handle errors that belong to a request or a job.

## Before you build: an error policy for payments

REASON IT OUT

### Which layer handles which payment error?

You will rebuild the checkout from the first section with four layers: a **gateway client** that talks HTTP to the payment provider, a **payment service**, an **order service** and an **HTTP boundary**. For each failure below, decide which layer handles it, what the others do, and what the customer sees:

- The gateway answers `402` with `{ "reason": "insufficient_funds" }`.
- The gateway times out. Did the charge happen?
- The gateway answers `503` three times in a row.
- The charge succeeds, then saving the order fails.
- The gateway returns a response without the `id` field the code expects.

**Show the reasoning**

- **Declined (402)**: an expected outcome. The gateway client translates it into `CardDeclinedError` with the reason. Payment and order services let it pass. The HTTP boundary maps it to a 402 with a helpful message ("Your card was declined: insufficient funds"). Nothing is retried; the log line is informational, not an alarm.
- **Timeout**: an environment failure with an unknown outcome. The gateway client translates it into a retryable `GatewayUnavailableError`. The payment service retries *with the same idempotency key*, so if the first attempt did charge, the retry returns that charge instead of charging again.
- **503 three times**: the payment service gives up after its retry budget and lets the error pass, wrapped as `PaymentFailedError` with the last failure as its cause. The boundary maps it to a 503, which tells the client the failure is temporary and it may try again later, and logs it once with the whole chain.
- **Save fails after charge**: only the order service knows both steps happened, so it compensates with a refund and then lets the failure pass. If the refund also fails, it throws an `AggregateError` that the boundary logs as needing manual action.
- **Missing `id`**: the gateway broke its contract, or our code expects the wrong shape. That is a bug-class failure: the gateway client should check the shape and throw a plain `Error` (not a retryable one). The boundary returns a generic 500 and logs everything. It must not be reported to the customer as "declined".

## Build: a payment flow that never loses an error

The error classes carry the kind (through the class and the `retryable` flag) and an HTTP status for the boundary:

errors.js

```ts
export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL", retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}
export class CardDeclinedError extends AppError {
  constructor(reason) {
    super(`card declined: ${reason.replaceAll("_", " ")}`, { status: 402, code: "CARD_DECLINED" });
  }
}
export class GatewayUnavailableError extends AppError {
  constructor(message, { cause } = {}) {
    super(message, { status: 503, code: "GATEWAY_UNAVAILABLE", retryable: true, cause });
  }
}
export class PaymentFailedError extends AppError {
  constructor(message, { cause } = {}) {
    super(message, { status: 503, code: "PAYMENT_FAILED", cause });
  }
}
```

The gateway client is the only layer that knows HTTP status codes. It translates every response into a charge or a typed error, and checks the shape of what it got:

gateway.js

```ts
import { CardDeclinedError, GatewayUnavailableError } from "./errors.js";

export function createGatewayClient(send) {
  return {
    async charge({ orderId, kobo, idempotencyKey }) {
      let response;
      try {
        response = await send({ path: "/charges", body: { orderId, kobo }, idempotencyKey });
      } catch (error) {
        throw new GatewayUnavailableError(`no answer from gateway for ${orderId}`, { cause: error });
      }
      if (response.status === 402) throw new CardDeclinedError(response.body.reason);
      if (response.status >= 500) throw new GatewayUnavailableError(`gateway returned ${response.status}`);
      if (response.status !== 200 || typeof response.body?.id !== "string") {
        throw new Error(`unexpected gateway response ${response.status}: ${JSON.stringify(response.body)}`);
      }
      return { id: response.body.id };
    },
    async refund(chargeId) {
      const response = await send({ path: `/charges/${chargeId}/refund`, body: {} });
      if (response.status !== 200) throw new Error(`refund of ${chargeId} failed with ${response.status}`);
    },
  };
}
```

The payment service retries only retryable errors, always with the same idempotency key, and wraps the last failure when it gives up. The order service compensates. The HTTP boundary is the only place that logs:

services.js

```ts
import { AppError, PaymentFailedError } from "./errors.js";

export function createPaymentService(gateway, { attempts = 3 } = {}) {
  return {
    async pay(order) {
      const idempotencyKey = `charge:${order.id}`;
      for (let attempt = 1; ; attempt++) {
        try {
          return await gateway.charge({ orderId: order.id, kobo: order.totalKobo, idempotencyKey });
        } catch (error) {
          if (!error.retryable) throw error;
          if (attempt === attempts) {
            throw new PaymentFailedError(`payment for ${order.id} failed after ${attempts} attempts`, { cause: error });
          }
        }
      }
    },
  };
}

export function createOrderService(payments, gateway, saveOrder) {
  return {
    async placeOrder(order) {
      const charge = await payments.pay(order);
      try {
        return await saveOrder({ ...order, status: "confirmed", chargeId: charge.id });
      } catch (saveError) {
        try {
          await gateway.refund(charge.id);
        } catch (refundError) {
          throw new AggregateError([saveError, refundError], `order ${order.id}: not saved, refund of ${charge.id} failed`);
        }
        throw new Error(`order ${order.id} not saved; charge ${charge.id} refunded`, { cause: saveError });
      }
    },
  };
}

export function createHttpBoundary(orders, log) {
  return async function handlePlaceOrder(order) {
    try {
      const saved = await orders.placeOrder(order);
      return { status: 201, body: { orderId: saved.id, chargeId: saved.chargeId } };
    } catch (error) {
      log(error);
      if (error instanceof AppError) {
        return { status: error.status, body: { code: error.code, message: error.message } };
      }
      return { status: 500, body: { code: "INTERNAL", message: "Something went wrong. Please try again later." } };
    }
  };
}
```

Notice what is *absent*: no `try`/`catch` in `pay` for declines, none in `placeOrder` around `pay`, and no logging below the boundary. Each layer only catches what it acts on.

Now a fake gateway that can play any scenario, and a logger that prints the cause chain on one entry. The fake's `"timeout"` is the nasty case: it records the charge and *then* fails to answer, like a real gateway that charged the card and dropped the connection. Charges are stored by idempotency key, the way a real gateway deduplicates them:

main.js

```ts
import { createGatewayClient } from "./gateway.js";
import { createHttpBoundary, createOrderService, createPaymentService } from "./services.js";

function fakeGateway(script) {
  const calls = [];
  const charges = new Map();
  const send = async (request) => {
    calls.push(request.path);
    const step = script.shift() ?? "ok";
    const recordCharge = () => {
      if (request.idempotencyKey && !charges.has(request.idempotencyKey)) charges.set(request.idempotencyKey, `ch_${charges.size + 1}`);
    };
    if (step === "timeout") {
      recordCharge();
      throw new Error("ETIMEDOUT");
    }
    if (step === "503") return { status: 503, body: {} };
    if (step === "declined") return { status: 402, body: { reason: "insufficient_funds" } };
    if (step === "garbage") return { status: 200, body: { ok: true } };
    if (step === "refund-fails") return { status: 500, body: {} };
    recordCharge();
    return { status: 200, body: { id: charges.get(request.idempotencyKey) } };
  };
  return { send, calls, charges };
}

function chain(error) {
  const parts = [];
  for (let e = error; e; e = e.cause) parts.push(e instanceof AggregateError ? `${e.message} [${e.errors.map((x) => x.message).join("; ")}]` : e.message);
  return parts.join(" <- ");
}

async function scenario(label, script, { saveFails = false } = {}) {
  const gateway = fakeGateway(script);
  const client = createGatewayClient(gateway.send);
  const saveOrder = async (order) => {
    if (saveFails) throw new Error("database connection lost");
    return order;
  };
  const logs = [];
  const handle = createHttpBoundary(createOrderService(createPaymentService(client), client, saveOrder), (e) => logs.push(chain(e)));
  const response = await handle({ id: "ORD-7", totalKobo: 2327850 });
  console.log(`${label}: ${response.status} ${JSON.stringify(response.body)}`);
  console.log(`   calls: ${gateway.calls.length}, distinct charges: ${gateway.charges.size}, log lines: ${logs.length}`);
  for (const line of logs) console.log(`   log: ${line}`);
}

await scenario("happy path", []);
await scenario("declined", ["declined"]);
await scenario("timeout then ok", ["timeout", "ok"]);
await scenario("gateway down", ["503", "503", "503"]);
await scenario("bad response", ["garbage"]);
await scenario("save fails", ["ok"], { saveFails: true });
await scenario("save and refund fail", ["ok", "refund-fails"], { saveFails: true });
```

Output of `node main.js` and of the browser terminal

```ts
happy path: 201 {"orderId":"ORD-7","chargeId":"ch_1"}
   calls: 1, distinct charges: 1, log lines: 0
declined: 402 {"code":"CARD_DECLINED","message":"card declined: insufficient funds"}
   calls: 1, distinct charges: 0, log lines: 1
   log: card declined: insufficient funds
timeout then ok: 201 {"orderId":"ORD-7","chargeId":"ch_1"}
   calls: 2, distinct charges: 1, log lines: 0
gateway down: 503 {"code":"PAYMENT_FAILED","message":"payment for ORD-7 failed after 3 attempts"}
   calls: 3, distinct charges: 0, log lines: 1
   log: payment for ORD-7 failed after 3 attempts <- gateway returned 503
bad response: 500 {"code":"INTERNAL","message":"Something went wrong. Please try again later."}
   calls: 1, distinct charges: 0, log lines: 1
   log: unexpected gateway response 200: {"ok":true}
save fails: 500 {"code":"INTERNAL","message":"Something went wrong. Please try again later."}
   calls: 2, distinct charges: 1, log lines: 1
   log: order ORD-7 not saved; charge ch_1 refunded <- database connection lost
save and refund fail: 500 {"code":"INTERNAL","message":"Something went wrong. Please try again later."}
   calls: 2, distinct charges: 1, log lines: 1
   log: order ORD-7: not saved, refund of ch_1 failed [database connection lost; refund of ch_1 failed with 500]
```

Read each scenario against the policy you reasoned out:

- **Declined**: one gateway call, no retry, a 402 the customer can act on, and a log line that is plainly not a bug.
- **Timeout then ok**: two calls, one charge. The idempotency key made the retry safe, whatever the first attempt did.
- **Gateway down**: three attempts, then a 503 whose log line holds the whole chain in one entry.
- **Bad response**: a contract failure became a generic 500, not "declined", and was not retried.
- **Save fails**: the charge was refunded before the error propagated. **Both fail**: an `AggregateError` naming both failures, the one log line an operator must act on.

### Testing error paths

Error paths are code, and untested error paths are where production surprises live. The fake above makes each failure a one-word script, so tests can assert the *policy*: which errors are retried, how many calls are made, what is logged, and that nothing is charged twice:

policy.test.js

```ts
import { createGatewayClient } from "./gateway.js";
import { createPaymentService } from "./services.js";
import { CardDeclinedError, PaymentFailedError } from "./errors.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

function scripted(steps) {
  const keys = [];
  const send = async (request) => {
    keys.push(request.idempotencyKey);
    const step = steps.shift();
    if (step === "timeout") throw new Error("ETIMEDOUT");
    if (step === "declined") return { status: 402, body: { reason: "do_not_honor" } };
    if (step === "503") return { status: 503, body: {} };
    return { status: 200, body: { id: "ch_1" } };
  };
  return { send, keys };
}

async function outcome(promise) {
  try {
    return { ok: await promise };
  } catch (error) {
    return { error: error.name, cause: error.cause?.name ?? null };
  }
}

const order = { id: "ORD-7", totalKobo: 100 };
{
  const g = scripted(["declined", "ok"]);
  const result = await outcome(createPaymentService(createGatewayClient(g.send)).pay(order));
  check("declined is not retried", [result.error, g.keys.length], ["CardDeclinedError", 1]);
}
{
  const g = scripted(["timeout", "503", "ok"]);
  const result = await outcome(createPaymentService(createGatewayClient(g.send)).pay(order));
  check("transient errors are retried", result, { ok: { id: "ch_1" } });
  check("every attempt uses the same key", new Set(g.keys).size, 1);
}
{
  const g = scripted(["503", "503", "503", "ok"]);
  const result = await outcome(createPaymentService(createGatewayClient(g.send), { attempts: 3 }).pay(order));
  check("gives up after the budget", [result, g.keys.length], [{ error: "PaymentFailedError", cause: "GatewayUnavailableError" }, 3]);
}
check("declined is expected, not retryable", new CardDeclinedError("x").retryable, false);
check("wrapped error keeps its cause", new PaymentFailedError("p", { cause: new Error("root") }).cause.message, "root");
```

Output of `node policy.test.js` and of the browser terminal

```ts
PASS declined is not retried -> ["CardDeclinedError",1]
PASS transient errors are retried -> {"ok":{"id":"ch_1"}}
PASS every attempt uses the same key -> 1
PASS gives up after the budget -> [{"error":"PaymentFailedError","cause":"GatewayUnavailableError"},3]
PASS declined is expected, not retryable -> false
PASS wrapped error keeps its cause -> "root"
```

### In production

- **One failure, one log entry, the whole chain.** Log at the boundary, with the cause chain and a request or job id, as structured data ([Structured logging](https://zudojs.oyinlola.site/learn/zudo-logging)). Alert on bug-class errors and on environment errors that persist; expected outcomes are metrics, not alarms.
- **Messages to users are designed, not forwarded.** Only errors you created for users (declined, validation, not found) carry messages that reach the client. Everything else becomes a generic message; the details stay in the logs.
- **Unknown outcomes need reconciliation.** If the last attempt timed out, the charge may or may not exist, and no error class can tell you which. Record the idempotency key with the failed order, and let a background job ask the gateway later whether that key was charged, then refund it or complete the order.
- **Retry budgets, backoff and idempotency go together.** Retries without backoff hammer a struggling provider ([backoff in Generators](https://zudojs.oyinlola.site/learn/js-generators#lazy)); retries without idempotency keys charge twice.
- **Use the framework's classes.** In a ZudoJS app, `@zudojs/errors` provides the error hierarchy with status codes and the HTTP layer provides the boundary, so your code mostly throws the right class and lets it pass ([The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors)).

## Practice

TRY IT YOURSELF

### Find the root cause

Write `rootCause(error)` that follows `.cause` links to the deepest error and returns it, and `findInChain(error, predicate)` that returns the first error in the chain for which `predicate` is true (or `undefined`). Both must stop on a chain that loops back on itself.

**Show a solution**

root-cause.js

```ts
function* chainOf(error) {
  const seen = new Set();
  for (let current = error; current instanceof Error && !seen.has(current); current = current.cause) {
    seen.add(current);
    yield current;
  }
}

const rootCause = (error) => [...chainOf(error)].at(-1);
const findInChain = (error, predicate) => chainOf(error).find(predicate);

const network = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
const gateway = new Error("gateway unreachable", { cause: network });
const payment = new Error("payment failed", { cause: gateway });

console.log(rootCause(payment).message);
console.log(findInChain(payment, (e) => e.code === "ECONNRESET")?.message);
console.log(findInChain(payment, (e) => e.code === "E_NOPE"));

const loopA = new Error("A");
const loopB = new Error("B", { cause: loopA });
loopA.cause = loopB;
console.log(rootCause(loopA).message);
```

Output of `node root-cause.js` and of the browser terminal

```ts
ECONNRESET
ECONNRESET
undefined
B
```

A generator ([Generators](https://zudojs.oyinlola.site/learn/js-generators)) walks the chain lazily, so `findInChain` stops at the first match, and the `seen` set stops at a loop. Searching the chain by a `code`, instead of by message text, keeps the check working when messages are reworded.

TRY IT YOURSELF

### Validate a whole form at once

A registration form has `email`, `phone` (11 digits for a Nigerian number) and `password` (at least 10 characters). Write `validateSignup(form)` that throws one `AggregateError` listing every invalid field, where each inner error has a `field` property, and returns the form if everything is valid.

**Show a solution**

signup.js

```ts
class FieldError extends Error {
  name = "FieldError";
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function validateSignup(form) {
  const problems = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email ?? "")) problems.push(new FieldError("email", "enter a valid email address"));
  if (!/^0\d{10}$/.test(form.phone ?? "")) problems.push(new FieldError("phone", "enter an 11-digit phone number starting with 0"));
  if ((form.password ?? "").length < 10) problems.push(new FieldError("password", "use at least 10 characters"));
  if (problems.length) throw new AggregateError(problems, "signup form has errors");
  return form;
}

try {
  validateSignup({ email: "ada@shop", phone: "0803123456", password: "short" });
} catch (error) {
  console.log(error.message);
  console.log(Object.fromEntries(error.errors.map((e) => [e.field, e.message])));
}
console.log(validateSignup({ email: "ada@shop.ng", phone: "08031234567", password: "long enough pw" }).email);
```

Output of `node signup.js` and of the browser terminal

```ts
signup form has errors
{
  email: 'enter a valid email address',
  phone: 'enter an 11-digit phone number starting with 0',
  password: 'use at least 10 characters'
}
ada@shop.ng
```

Turning `.errors` into a field-to-message map gives a client exactly what it needs to show each message next to its input. A form is a case where every failure matters at once; stopping at the first would make the user submit three times.

TRY IT YOURSELF

### Fix the swallowing

This refund function reports success even when the refund failed. Find all three ways it loses the error, and rewrite it so failures reach the caller with context.

bad-refund.js

```ts
async function refundOrder(gateway, order) {
  try {
    gateway.refund(order.chargeId).catch(() => {});
  } catch (error) {
    console.log(`refund failed: ${error.message}`);
  } finally {
    return "refunded";
  }
}

const gateway = { refund: async () => { throw new Error("refund window closed"); } };
console.log(await refundOrder(gateway, { id: "ORD-7", chargeId: "ch_881" }));
```

Output of `node bad-refund.js` and of the browser terminal

```ts
refunded
```

**Show a solution**

Three problems: the promise from `gateway.refund` is not awaited, so its rejection can never reach the `catch` block; `.catch(() => {})` throws the rejection away (someone added it to silence an "unhandled rejection" warning, which was the one signal that something was wrong); and the `return` in `finally` would override any error anyway. Await the call, drop the swallowing, and wrap with context:

good-refund.js

```ts
async function refundOrder(gateway, order) {
  try {
    await gateway.refund(order.chargeId);
    return "refunded";
  } catch (error) {
    throw new Error(`refund for ${order.id} (${order.chargeId}) failed`, { cause: error });
  }
}

const gateway = { refund: async () => { throw new Error("refund window closed"); } };
try {
  await refundOrder(gateway, { id: "ORD-7", chargeId: "ch_881" });
} catch (error) {
  console.log(error.message, "<-", error.cause.message);
}
```

Output of `node good-refund.js` and of the browser terminal

```ts
refund for ORD-7 (ch_881) failed <- refund window closed
```

The rewritten version has no `finally` at all, because it has nothing to clean up. The caller now decides what to do, and the log at the boundary will say which order and which charge were affected.

## Recap

- Classify failures: expected outcomes (tell the user), environment failures (retry, fall back or fail cleanly) and bugs (fail, log, fix). Only the first two are recoverable by the running program; unknown errors default to "bug".
- For each call that can throw, a layer handles the error (and continues correctly), translates it (with `{ cause }`), or lets it pass. Letting it pass is usually right. Never swallow; log once, at the handling boundary.
- Cause chains keep the business meaning on top and the root detail at the bottom. Decide with names, codes and flags, not message text. Normalise non-errors with `Error.isError`.
- `AggregateError` reports independent failures together: form fields, batch payouts, a failed compensation after a failed save.
- Retry only idempotent operations (use idempotency keys), fall back only to acceptable substitutes, and compensate for steps that already happened.
- Put error boundaries at the edges: per request, per job, per command, and at the process as a last resort.
- Watch for swallowing: empty `catch`, `return` in `finally`, un-awaited promises in `try`, `.catch(() => {})`, and failure values that look like success.

Next: [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems), how JavaScript files find and load each other, in Node and in the browser.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
