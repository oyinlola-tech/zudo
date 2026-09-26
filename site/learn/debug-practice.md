---
title: "Debugging practice — ZudoJS Academy"
description: "Find a regression with binary search and git bisect run, dig to root causes with the five whys, and work five complete bug hunts from report to regression test."
source: https://zudojs.oyinlola.site/learn/debug-practice
---

LEVEL 4 · LESSON 21 OF 21

Tooling and debugging Core

# Debugging practice

Find a regression with binary search and git bisect run, dig to root causes with the five whys, and work five complete bug hunts from report to regression test.

- **60 min** to read and try
- **You need:** The debugging method, Debugging tools, and Git and GitHub
- **You build:** A git bisect run that finds a bad commit on its own, five diagnosed and fixed bugs with regression tests, and a per-account lock that stops lost updates

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Binary-search inputs, code and history, and let git bisect run find the commit that broke a test
- Separate symptom, cause and root cause with the five whys, and turn each answer into an action
- Reproduce and fix a race condition that loses money by controlling the timing
- Diagnose off-by-one, lost this, floating-point and shared-object bugs from their symptoms
- Find "works on my machine" bugs by listing and testing environment differences

## "It worked last week"

The shop's accountant writes on Monday:

The invoice for order 2208 says ₦19,400. The customer cancelled the eggs, so it should be ₦17,000. This definitely worked last week; I checked a cancelled order on Tuesday.

You open the code. `invoiceTotalKobo` is two lines long and looks fine. Twelve commits have landed since last Tuesday, by three people, touching invoices, formatting and numbering. Reading all of them and guessing which one broke cancellations would take an hour and might still miss it.

"It worked before" is the most useful sentence a bug report can contain, because it turns the search for the bug into a search through *time*. Somewhere between a version that worked and the version that does not is a first bad change, and you can find it without understanding the code at all, using binary search.

This lesson is practice for [the debugging method](https://zudojs.oyinlola.site/learn/debug-method) and [the tools](https://zudojs.oyinlola.site/learn/debug-tools). It starts with binary-search debugging and `git bisect`, then root-cause analysis, then five complete bug hunts, each a bug that real teams ship all the time, and ends with bugs that only exist on some machines.

## Binary-search debugging

[Linear and binary search](https://zudojs.oyinlola.site/learn/dsa-searching#binary) finds an item in a sorted list by checking the middle and throwing away the half that cannot contain it. It needs about log₂ n checks: 10 for a thousand items, 20 for a million. The same idea finds bugs whenever you can split the suspects into an ordered list with "good" at one end and "bad" at the other:

| What you split | Good end | Bad end | One check |
| --- | --- | --- | --- |
| Input data | First half of the CSV imports fine | Whole CSV fails | Import half the rows |
| Code in a pipeline | Data correct after step 1 | Data wrong after step 8 | Print the data after step 4 |
| History (commits) | Last week's version | Today's version | Check out a version in between and run the test |
| Dependencies | Old lockfile | New lockfile | Upgrade half the packages |

The only requirement is a check that answers "good or bad?" reliably. That is why [reproducing](https://zudojs.oyinlola.site/learn/debug-method#reproduce) comes first: a repro that says PASS or FAIL is exactly that check. Here is the search itself, over a list of versions:

first-bad.js

```ts
function firstBad(versions, isBad) {
  let good = -1;                 // index known good (before the list)
  let bad = versions.length - 1; // index known bad
  let checks = 0;
  while (bad - good > 1) {
    const middle = Math.floor((good + bad) / 2);
    checks++;
    if (isBad(versions[middle])) bad = middle;
    else good = middle;
  }
  return { first: versions[bad], checks };
}

const versions = Array.from({ length: 1000 }, (_, i) => `v${i + 1}`);
const brokenFrom = 734;
const result = firstBad(versions, (v) => Number(v.slice(1)) >= brokenFrom);
console.log(result);
```

Output of `node first-bad.js` and of the browser terminal

```json
{ first: 'v734', checks: 10 }
```

Ten checks out of a thousand versions. The loop keeps one invariant: `good` always points at something known good (or before the list), `bad` at something known bad. When they are neighbours, `bad` is the first bad version. This only works if the bug, once introduced, stays: every version after the first bad one must also be bad. A bug that comes and goes (a flaky test, a random race) breaks the search, and you have to make the check reliable first.

## git bisect: binary search through history

As you saw in [Git and GitHub](https://zudojs.oyinlola.site/learn/git), Git stores your project's history as a list of **commits**: snapshots of all the files, each with an id (a hash such as `c9e71ff`) and a message. Git can also turn your folder back into any of those snapshots (`git checkout <id>`), which is what makes searching the history possible. The small, single-purpose commits that lesson asked for pay off here: the smaller each commit, the more precisely a search can point at the change that broke something. `git bisect` does the binary search for you: you tell it one good and one bad commit, and it checks out the commit in the middle for you to test.

### Make the check

First, turn the accountant's report into a script that exits with code 0 when the bug is absent and 1 when it is present. `git bisect run` uses the **exit code**: 0 means good, 1 to 127 means bad (except 125, which means "cannot test this commit, skip it").

check-invoice.js

```ts
import { invoiceTotalKobo } from "./invoice.js";

const lines = [
  { sku: "RICE-5", priceKobo: 850000, quantity: 2 },
  { sku: "EGG-30", priceKobo: 240000, quantity: 1, cancelled: true },
];
const total = invoiceTotalKobo(lines);
if (total !== 1700000) {
  console.log(`FAIL: total ${total}, expected 1700000`);
  process.exit(1);
}
console.log("PASS");
```

Keep this file **untracked** (not committed) or outside the repository. Bisect checks out old commits, and a test script that is part of the history would vanish or change with them. Untracked files stay put.

REASON IT OUT

### Before you run bisect

- Which commit do you mark as good, and how sure must you be that it really is good?
- What happens to the search if some old commits cannot run at all (a syntax error that was fixed the next day, a missing file)?
- The check fails for a *different* reason on some old commit, say the file was called `invoices.js` back then. What would bisect conclude, and why is that wrong?

**Show the reasoning**

**The good commit** must really be good: run the check on it first. If it fails there too, the bug is older than you think and bisect would report nonsense. The accountant said Tuesday worked, but "worked" was a manual check; the script is the evidence.

**Broken commits** must be skipped, not marked bad. Marking them bad makes bisect blame them. In a script, detect the situation and `process.exit(125)`; by hand, run `git bisect skip`.

**A different failure** ("cannot find module ./invoice.js") exits with a non-zero code, so bisect counts it as bad and may name the rename commit as the culprit. A good check fails only for the bug it tests: here, a wrong total. Anything else should exit 125.

### Run it

Here is a real run on a repository with the twelve commits since last week. The oldest one, `a8b7c0e`, passed the check:

Terminal (a real run, Git 2.53)

```bash
$ node check-invoice.js
FAIL: total 1940000, expected 1700000
$ git bisect start
status: waiting for both good and bad commits
$ git bisect bad
status: waiting for good commit(s), bad commit known
$ git bisect good a8b7c0e
Bisecting: 5 revisions left to test after this (roughly 3 steps)
[0df88252f16c0dd9e96f3f92a80f641a41c53c15] Extract lineTotalKobo
$ git bisect run node check-invoice.js
running 'node' 'check-invoice.js'
PASS
Bisecting: 2 revisions left to test after this (roughly 2 steps)
[44b32e594d77c171f631aef7de804bea35a9dd94] Use six-digit invoice numbers
running 'node' 'check-invoice.js'
FAIL: total 1940000, expected 1700000
Bisecting: 0 revisions left to test after this (roughly 1 step)
[c9e71ff01317655aee093e22df43f77b437a6a2e] Simplify invoiceTotalKobo with reduce
running 'node' 'check-invoice.js'
FAIL: total 1940000, expected 1700000
Bisecting: 0 revisions left to test after this (roughly 0 steps)
[e728ff4146af3c3edfa23936de8a21aff78a78d6] Explain kobo in README
running 'node' 'check-invoice.js'
PASS
c9e71ff01317655aee093e22df43f77b437a6a2e is the first bad commit
commit c9e71ff01317655aee093e22df43f77b437a6a2e
Author: Ada Obi <ada@example.com>
Date:   Wed Sep 9 10:00:00 2026 +0100

    Simplify invoiceTotalKobo with reduce

 invoice.js | 7 +------
 1 file changed, 1 insertion(+), 6 deletions(-)
bisect found first bad commit
$ git bisect reset
Previous HEAD position was e728ff4 Explain kobo in README
Switched to branch 'main'
```

- `git bisect bad` with no id marks the current commit (the newest) as bad; `git bisect good a8b7c0e` marks the last known good one.
- `git bisect run` checked out four commits, ran the script on each, and read the exit code. It never needed you. On a history of 1,000 commits it would run about 10 times.
- `git bisect reset` puts your folder back on the branch you started from. Always run it when you are done.

Now read the one commit that bisect named, instead of all twelve:

Terminal (a real run)

```bash
$ git show c9e71ff --format= -- invoice.js
diff --git a/invoice.js b/invoice.js
index 2a4151d..4ab1af5 100644
--- a/invoice.js
+++ b/invoice.js
@@ -1,10 +1,5 @@
 export function invoiceTotalKobo(lines) {
-  let total = 0;
-  for (const line of lines) {
-    if (line.cancelled) continue;
-    total += lineTotalKobo(line);
-  }
-  return total;
+  return lines.reduce((total, line) => total + lineTotalKobo(line), 0);
 }

 export function lineTotalKobo(line) {
```

The refactor turned a loop into a `reduce` and lost the `if (line.cancelled) continue;` on the way. Cancelled eggs (₦2,400) are added back: ₦17,000 + ₦2,400 = ₦19,400. The fix restores the rule, and the check script becomes a real test so it runs on every commit from now on:

invoice-fixed.js

```ts
function lineTotalKobo(line) {
  return line.priceKobo * line.quantity;
}

function billableLines(lines) {
  return lines.filter((line) => !line.cancelled);
}

function invoiceTotalKobo(lines) {
  return billableLines(lines).reduce((total, line) => total + lineTotalKobo(line), 0);
}

const lines = [
  { sku: "RICE-5", priceKobo: 850000, quantity: 2 },
  { sku: "EGG-30", priceKobo: 240000, quantity: 1, cancelled: true },
];
console.log(invoiceTotalKobo(lines), invoiceTotalKobo([]), invoiceTotalKobo(lines.slice(1)));
```

Output of `node invoice-fixed.js` and of the browser terminal

```ts
1700000 0 0
```

> Bisect by hand
>
> Without a script, bisect still works: at each step run your check yourself and type `git bisect good` or `git bisect bad`. Use `git bisect log` to see the decisions so far. Bisect works for anything you can judge, including "does the page look broken?", as long as you judge it the same way every time.

## Root-cause analysis: the five whys

Bisect found the *commit*. That is the cause of this bug, but not the reason the team shipped it. **Root-cause analysis** keeps asking why until it reaches something in the process you can change, so the same *kind* of bug cannot happen again. The simplest technique is the **five whys**: ask "why?" about each answer, about five times.

1. **Why was invoice 2208 wrong?** The cancelled eggs were included in the total.
2. **Why were they included?** The `reduce` refactor dropped the check for cancelled lines.
3. **Why did the review not notice?** The diff looked like a pure simplification. The rule "cancelled lines are not billed" lived only in a `continue` with no name, so nothing in the diff said a business rule was being deleted.
4. **Why did no test fail?** No test had a cancelled line in it.
5. **Why was there no such test?** Cancellation was added in a hurry without tests, and nothing in the team's process asks for a test when a business rule is added.

Each answer suggests an action, and the deeper ones prevent more future bugs:

| Level | Action | Prevents |
| --- | --- | --- |
| Symptom | Correct invoice 2208 and any others since 9 September | This customer's problem |
| Cause | Restore the cancelled check | This bug |
| Why 3 | Give the rule a name: `billableLines` | Silent deletion of the rule in future refactors |
| Why 4 | Add `check-invoice.js` as a regression test | This bug coming back |
| Why 5 | Pull request checklist: "new business rule? add a test" | The same class of bug for other rules |

Two rules keep this useful. First, **be blameless**: "Ada broke it" is a dead end, because the next person would make the same mistake in the same situation. Ask what in the situation let a careful person make it. Second, **stop at something you control**. "Because JavaScript has floating point" is true and useless; "because we store money as naira floats" is something you can change. Five is a guideline, not a rule: stop when the answer is an action.

## Bug hunt 1: the orders that are never shown

**Report:** "A customer has a receipt for order 1010, but it is not in the admin order list. I checked every page."

pagination-broken.js

```ts
function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  return {
    items: items.slice(start, end),
    totalPages: Math.floor(items.length / pageSize),
  };
}

const orders = Array.from({ length: 23 }, (_, i) => ({ id: 1001 + i }));
const first = paginate(orders, 1, 5);
console.log(first.totalPages, first.items.map((o) => o.id));
```

Output of `node pagination-broken.js` and of the browser terminal

```ts
4 [ 1001, 1002, 1003, 1004 ]
```

**Observe and reproduce.** Page 1 should hold five orders and holds four. That alone confirms a bug, but the report is about a *missing* order. Instead of guessing, measure: walk every page the way the admin screen does and list what never appears.

pagination-walk.js

```ts
function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  return {
    items: items.slice(start, end),
    totalPages: Math.floor(items.length / pageSize),
  };
}

const orders = Array.from({ length: 23 }, (_, i) => ({ id: 1001 + i }));
const seen = new Set();
const { totalPages } = paginate(orders, 1, 5);
for (let page = 1; page <= totalPages; page++) {
  for (const order of paginate(orders, page, 5).items) seen.add(order.id);
}
const missing = orders.map((o) => o.id).filter((id) => !seen.has(id));
console.log(`pages: ${totalPages}, shown: ${seen.size} of ${orders.length}`);
console.log("never shown:", missing);
```

Output of `node pagination-walk.js` and of the browser terminal

```ts
pages: 4, shown: 16 of 23
never shown: [
  1005, 1010,
  1015, 1020,
  1021, 1022,
  1023
]
```

REASON IT OUT

### Two patterns in one list

- Look at the missing ids. Which ones form a regular pattern, and which ones do not?
- For the regular ones: which position on each page do they have? Which line of `paginate` decides the last position?
- For the others: how many pages should 23 orders at 5 per page need? What does `Math.floor(23 / 5)` give?
- What tests would have caught each bug? Which list lengths are the edge cases?

**Show the reasoning**

**Every fifth order** (1005, 1010, 1015, 1020) is missing: the last position of each page. `slice(start, end)` already excludes `end`, and `end` was computed as `start + pageSize - 1`, so the page loses its last slot twice over. That is an off-by-one caused by mixing an *inclusive* end (the way people count) with an *exclusive* one (the way `slice` works).

**The tail** (1021 to 1023) is missing because 23 orders need 5 pages (four full, one with 3), and `Math.floor(23 / 5)` is 4. The last, partial page is never offered. Page counts need `Math.ceil`.

**Tests:** a length that is not a multiple of the page size (23), an exact multiple (20), fewer than one page (3), and zero. And one property that covers all of them: walking every page shows every item exactly once.

pagination-fixed.js

```ts
function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages: Math.ceil(items.length / pageSize),
  };
}

function walkAll(items, pageSize) {
  const ids = [];
  const { totalPages } = paginate(items, 1, pageSize);
  for (let page = 1; page <= totalPages; page++) ids.push(...paginate(items, page, pageSize).items);
  return ids;
}

let checked = 0;
for (let length = 0; length <= 30; length++) {
  const items = Array.from({ length }, (_, i) => i);
  for (let pageSize = 1; pageSize <= 7; pageSize++) {
    const shown = walkAll(items, pageSize);
    if (shown.length !== length || shown.some((item, i) => item !== i)) {
      console.log(`FAIL length=${length} pageSize=${pageSize}`);
    }
    checked++;
  }
}
console.log(`${checked} combinations: every item shown exactly once, in order`);
```

Output of `node pagination-fixed.js` and of the browser terminal

```ts
217 combinations: every item shown exactly once, in order
```

The verification does not test three hand-picked cases; it checks the property "every item exactly once, in order" for 217 combinations of length and page size, including the empty list. That style of test, a rule checked against many generated inputs, is called **property-based testing**, and [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) does it with a library. [The pagination problem](https://zudojs.oyinlola.site/learn/solve-intermediate#pagination) from Level 1 derives the correct formulas step by step.

## Bug hunt 2: the deposit that vanished

**Report:** "Ada topped up her wallet twice in a few seconds, ₦5,000 by card and ₦2,000 by bank transfer. Her balance only went up by ₦2,000. Both payments show as successful at the bank."

The deposit code reads the balance, adds the amount and writes it back. The fake database below takes 5 milliseconds per call, like a real one across a network:

race-broken.js

```ts
const balances = new Map([["ada", 0]]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBalance(id) {
  await wait(5);
  return balances.get(id);
}

async function setBalance(id, kobo) {
  await wait(5);
  balances.set(id, kobo);
}

async function deposit(id, kobo, source) {
  const balance = await getBalance(id);
  console.log(`${source}: read ${balance}`);
  await setBalance(id, balance + kobo);
  console.log(`${source}: wrote ${balance + kobo}`);
}

await Promise.all([deposit("ada", 500000, "card"), deposit("ada", 200000, "transfer")]);
console.log("final balance:", balances.get("ada"));
```

Output of `node race-broken.js` and of the browser terminal

```ts
card: read 0
transfer: read 0
card: wrote 500000
transfer: wrote 200000
final balance: 200000
```

Reproduced, with a log that shows the whole story: both deposits read 0 before either wrote. The card deposit wrote 500,000, then the transfer overwrote it with 0 + 200,000. This is a **lost update**, a kind of **race condition**: a bug whose result depends on the timing of two operations running at the same time.

```ts
time ───────────────────────────────────────────────────────►
card      read 0 ─────────────── write 0 + 500000 = 500000
transfer      read 0 ──────────────────── write 0 + 200000 = 200000   ← wins
```

Both operations read before either writes, so the second write is based on a stale balance and erases the first.

REASON IT OUT

### Why it never failed on the developer's laptop

- On the laptop, the database is on the same machine and answers in microseconds. How does that change the chance that two deposits overlap?
- Would adding `console.log` calls change whether the bug appears?
- Where must the fix live: in `deposit`, in the database, or in the client that sends two payments?

**Show the reasoning**

**Timing:** the race window is the time between the read and the write. Locally it is tiny, so two deposits almost never overlap; in production, with network latency and many users, overlaps are routine. Bugs like this are "works on my machine" by nature. The example above makes the window large and the timing fixed, which is how you reproduce a race on purpose: *control the timing* instead of hoping for it.

**Logging** changes timing slightly and can make a race appear or disappear. A bug that changes when you observe it is called a **heisenbug**. Reproductions with controlled delays are immune to that.

**The fix** belongs on the server: the client cannot know about other devices or a bank callback. Either make read-and-write a single operation the database performs atomically (`UPDATE wallets SET balance = balance + $1`, see [How databases work](https://zudojs.oyinlola.site/learn/databases)), or make sure deposits to the same account run one after another.

Here is the second option in plain JavaScript: a per-account lock that chains each operation onto the previous one for the same account. Different accounts still run in parallel.

race-fixed.js

```ts
const balances = new Map([["ada", 0], ["bola", 0]]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getBalance = async (id) => (await wait(5), balances.get(id));
const setBalance = async (id, kobo) => (await wait(5), balances.set(id, kobo));

const queues = new Map();
function withLock(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(key, next.catch(() => {}));
  return next;
}

function deposit(id, kobo) {
  return withLock(id, async () => {
    const balance = await getBalance(id);
    await setBalance(id, balance + kobo);
  });
}

const deposits = [];
for (let i = 0; i < 10; i++) {
  deposits.push(deposit("ada", 100000), deposit("bola", 50000));
}
await Promise.all(deposits);
console.log(balances.get("ada"), balances.get("bola"));
```

Output of `node race-fixed.js` and of the browser terminal

```ts
1000000 500000
```

Twenty concurrent deposits, none lost: 10 × ₦1,000 and 10 × ₦500. The verification is deliberately harsher than the report (ten overlapping deposits instead of two), because a race fix that survives only the reported case may just have made the window smaller. `previous.then(task, task)` runs the task after the previous one whether it succeeded or failed, so one failed deposit does not block the account forever. A lock in memory only works inside one process; with several server processes you need the database to do it, which is why the atomic `UPDATE` is the usual production answer. [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency) covers more patterns for async code.

## Bug hunt 3: the mailer that forgot itself

**Report:** "After the nightly job, no receipts were sent, and the log has one error."

mailer-broken.js

```ts
class ReceiptMailer {
  constructor() {
    this.sent = [];
  }

  send(order) {
    this.sent.push(`Receipt for order ${order.id}`);
  }
}

const mailer = new ReceiptMailer();
const paidOrders = [{ id: 1041 }, { id: 1042 }];

try {
  paidOrders.forEach(mailer.send);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log("sent:", mailer.sent.length);
```

Output of `node mailer-broken.js` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'sent')
sent: 0
```

**Read the error precisely.** It does not say `sent` is undefined; it says something was `undefined` when the code read `.sent` from it. The only `.sent` read inside `send` is `this.sent`. So the hypothesis is: *`this` is `undefined` inside `send`*. That predicts `send` works when called as `mailer.send(order)`, and fails when called any other way. Test it:

mailer-experiment.js

```ts
class ReceiptMailer {
  constructor() {
    this.sent = [];
  }

  send(order) {
    console.log("this is", this === undefined ? "undefined" : this.constructor.name);
    this?.sent.push(`Receipt for order ${order.id}`);
  }
}

const mailer = new ReceiptMailer();
mailer.send({ id: 1 });
const send = mailer.send;
send({ id: 2 });
[{ id: 3 }].forEach(mailer.send);
```

Output of `node mailer-experiment.js` and of the browser terminal

```ts
this is ReceiptMailer
this is undefined
this is undefined
```

Confirmed. `forEach(mailer.send)` passes the *function*, detached from the object; `forEach` then calls it as a plain function. `this` is decided by *how* a function is called, not where it was defined, and class bodies are in strict mode, so a plain call gets `undefined` ([How this gets lost](https://zudojs.oyinlola.site/learn/js-this#losing)). The fix is to keep the call a method call, or to bind:

mailer-fixed.js

```ts
class ReceiptMailer {
  sent = [];

  send = (order) => {
    this.sent.push(`Receipt for order ${order.id}`);
  };
}

const mailer = new ReceiptMailer();
const paidOrders = [{ id: 1041 }, { id: 1042 }];

paidOrders.forEach((order) => mailer.send(order));
paidOrders.forEach(mailer.send);
setTimeout(mailer.send, 0, { id: 1043 });
await new Promise((resolve) => setTimeout(resolve, 5));
console.log(mailer.sent);
```

Output of `node mailer-fixed.js` and of the browser terminal

```json
[
  'Receipt for order 1041',
  'Receipt for order 1042',
  'Receipt for order 1041',
  'Receipt for order 1042',
  'Receipt for order 1043'
]
```

Two fixes are shown together. At the call site, an arrow function `(order) => mailer.send(order)` keeps it a method call. In the class, `send` is now an arrow-function **class field**, which captures `this` when the object is created, so even `forEach(mailer.send)` and `setTimeout(mailer.send, …)` work. The class field costs one function per object instead of one shared on the prototype; for a mailer that is irrelevant. The regression test is the line that failed: `paidOrders.forEach(mailer.send)`.

Notice the second, quieter bug the report hinted at: the job threw on the *first* order and stopped, so no receipt was sent at all. A nightly job should record each failure and carry on with the next order, then report the failures. An exception in item 1 should not cancel items 2 to 10,000.

## Bug hunt 4: VAT that is one kobo short

**Report**, from the accountant again: "VAT is 7.5%. On a ₦111 item our invoices say ₦8.32 VAT. The tax office calculator says ₦8.33. It's one kobo, but they are all wrong the same way and the auditors noticed."

vat-broken.js

```ts
export function vatNaira(priceNaira) {
  return Math.round(priceNaira * 0.075 * 100) / 100;
}
```

vat-repro.js

```ts
import { vatNaira } from "./vat-broken.js";

console.log(vatNaira(111), vatNaira(100), vatNaira(1000));
```

Output of `node vat-repro.js` and of the browser terminal

```ts
8.32 7.5 75
```

Reproduced: ₦8.32. Exactly 7.5% of ₦111 is ₦8.325, and the rule for half a kobo is to round up, to ₦8.33. ₦100 and ₦1,000 come out right, so the bug is not in every amount. How many are affected? A reliable *reference* is needed first: BigInt arithmetic works on whole numbers exactly, with no floating point at all.

vat-survey.js

```ts
import { vatNaira } from "./vat-broken.js";

function vatKoboExact(priceNaira) {
  const priceKobo = BigInt(priceNaira) * 100n;
  return Number((priceKobo * 75n + 500n) / 1000n);
}

let wrong = 0;
const examples = [];
for (let naira = 1; naira <= 100000; naira++) {
  if (Math.round(vatNaira(naira) * 100) !== vatKoboExact(naira)) {
    wrong++;
    if (examples.length < 4) examples.push(`₦${naira}: ${naira * 0.075}`);
  }
}
console.log(`${wrong} of 100000 prices have the wrong VAT`);
console.log(examples);
```

Output of `node vat-survey.js` and of the browser terminal

```ts
7379 of 100000 prices have the wrong VAT
[
  '₦3: 0.22499999999999998',
  '₦17: 1.275',
  '₦29: 2.175',
  '₦31: 2.3249999999999997'
]
```

About 7% of all prices are affected. The examples look innocent (`1.275` is a perfect half kobo), so print more digits than JavaScript normally shows:

vat-digits.js

```ts
console.log(111 * 0.075, (111 * 0.075).toPrecision(20), 111 * 0.075 * 100);
```

Output of `node vat-digits.js` and of the browser terminal

```ts
8.325 8.3249999999999992895 832.4999999999999
```

JavaScript prints the shortest decimal that identifies a number, so the product *looks* like 8.325. The number actually stored is 8.32499999999999928…, a hair below the halfway point, because 0.075 has no exact binary form (like 1/3 in decimal). Multiplying by 100 makes the difference visible, and `Math.round` goes down. This is the floating-point problem from [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#floating-point), and the fix is the one from [money as whole kobo](https://zudojs.oyinlola.site/learn/logic-math#kobo): do the arithmetic in integers, and round exactly once.

vat-fixed.js

```ts
export function vatKobo(priceKobo) {
  if (!Number.isSafeInteger(priceKobo) || priceKobo < 0) throw new Error(`price must be whole kobo, got ${priceKobo}`);
  return Math.floor((priceKobo * 75 + 500) / 1000);
}

function vatKoboExact(priceKobo) {
  return Number((BigInt(priceKobo) * 75n + 500n) / 1000n);
}

let wrong = 0;
for (let naira = 1; naira <= 100000; naira++) {
  if (vatKobo(naira * 100) !== vatKoboExact(naira * 100)) wrong++;
}
console.log(vatKobo(11100), vatKobo(10000), vatKobo(33));
console.log(`${wrong} of 100000 prices have the wrong VAT`);
```

Output of `node vat-fixed.js` and of the browser terminal

```ts
833 750 2
0 of 100000 prices have the wrong VAT
```

`priceKobo * 75` is an exact integer; adding 500 and dividing by 1000, then flooring, is "round half up" in integer arithmetic. The same survey now finds no differences. The guard rejects non-integer kobo, because a float sneaking in from elsewhere would reopen the bug. [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) covers IEEE-754 and `Number.isSafeInteger` fully.

Root cause, one level up: money was stored in naira as floating-point numbers. Prices should be kobo integers everywhere, from the database column to the API. That is a migration, not a one-line fix, and the five whys would put it on the list as the real action.

## Bug hunt 5: another customer's rice

**Report**, marked urgent: "I opened the app and my cart already had two bags of rice in it. I have never ordered rice."

A cart with someone else's items is a privacy problem, not just a bug. The cart code starts every cart from a template object:

cart-broken.js

```ts
const EMPTY_CART = { items: [], couponCode: null };

function newCart(owner) {
  return { ...EMPTY_CART, owner };
}

const adaCart = newCart("ada");
adaCart.items.push({ sku: "RICE-5", quantity: 2 });
adaCart.couponCode = "WELCOME10";

const bolaCart = newCart("bola");
console.log(bolaCart);
```

Output of `node cart-broken.js` and of the browser terminal

```json
{
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  couponCode: null,
  owner: 'bola'
}
```

REASON IT OUT

### Isolate: what is shared?

- Bola has Ada's rice but not Ada's coupon code. What is different about how `items` and `couponCode` were changed?
- What does `{ ...EMPTY_CART }` copy: the array, or a reference to it?
- Which single expression would prove your hypothesis?

**Show the reasoning**

**Assignment vs mutation.** `adaCart.couponCode = "WELCOME10"` *replaced* a property on Ada's own object. `adaCart.items.push(…)` *changed* the array that `items` points to.

**Spread is shallow.** It copies each property's value into a new object, and the value of `items` is a reference to one array. Every cart made by `newCart` points at the same array, the one inside `EMPTY_CART` ([Shallow and deep copies](https://zudojs.oyinlola.site/learn/js-objects-deep#copies)).

**The proof** is an identity check: `adaCart.items === bolaCart.items`. If it is `true`, they are one array. `EMPTY_CART.items.length` should also no longer be 0.

cart-identity.js

```ts
const EMPTY_CART = { items: [], couponCode: null };
const newCart = (owner) => ({ ...EMPTY_CART, owner });

const adaCart = newCart("ada");
adaCart.items.push({ sku: "RICE-5", quantity: 2 });
const bolaCart = newCart("bola");

console.log(adaCart.items === bolaCart.items, adaCart.items === EMPTY_CART.items);
console.log("template now holds", EMPTY_CART.items.length, "item");
```

Output of `node cart-identity.js` and of the browser terminal

```ts
true true
template now holds 1 item
```

One array for everyone, and the "empty" template is not empty any more. On a server, the template lives as long as the process, so every cart created after Ada's shares her rice until the next restart. That also explains why it was hard to reproduce: after a deploy, everything looks fine for a while.

The fix creates fresh inner objects every time. And to stop the next template from being mutated, freeze it deeply in development, so a mutation throws at the line that does it instead of silently leaking:

cart-fixed.js

```ts
function deepFreeze(value) {
  for (const inner of Object.values(value)) {
    if (inner && typeof inner === "object") deepFreeze(inner);
  }
  return Object.freeze(value);
}

const EMPTY_CART = deepFreeze({ items: [], couponCode: null });

function newCart(owner) {
  return { ...structuredClone(EMPTY_CART), owner };
}

const adaCart = newCart("ada");
adaCart.items.push({ sku: "RICE-5", quantity: 2 });
const bolaCart = newCart("bola");
console.log(bolaCart.items.length, adaCart.items === bolaCart.items);

try {
  const sloppyCart = { ...EMPTY_CART, owner: "chidi" };
  sloppyCart.items.push({ sku: "EGG-30", quantity: 1 });
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node cart-fixed.js` and of the browser terminal

```ts
0 false
TypeError: Cannot add property 0, object is not extensible
```

`structuredClone` copies all the way down, so each cart gets its own array. The last part is the regression test for the *class* of bug: code that forgets to clone gets a `TypeError` at the exact line that tries to change the shared array. The same bug appears with default options objects, cached results returned to callers, and module-level constants. Whenever two users see each other's data, look for a shared object first.

## "Works on my machine"

A bug that happens in production but not on your laptop is not a mystery; it is a difference. The race above was one (network latency). Here is another, from the shop's daily sales report, which groups orders by day:

day-key.js

```ts
export function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
```

An order placed at 00:30 on 25 September in Lagos is 23:30 on 24 September in UTC. `getDate()` uses the *local* time zone of whatever machine runs the code. This script runs the same function in three child processes, each with a different `TZ` environment variable, which is how Node.js picks its time zone:

tz-compare.jsNode.js only

```ts
import { execFileSync } from "node:child_process";

const code = `
  import("./day-key.js").then(({ dayKey }) => {
    console.log(dayKey(new Date("2026-09-24T23:30:00Z")), new Date("2026-09-25").getDate());
  });
`;

for (const tz of ["Africa/Lagos", "UTC", "America/New_York"]) {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  console.log(tz.padEnd(17), out.trim());
}
```

Output of `node tz-compare.js`

```ts
Africa/Lagos      2026-09-25 25
UTC               2026-09-24 25
America/New_York  2026-09-24 24
```

The developer in Lagos sees 25 September; the server, which like most servers runs in UTC, files the same order under 24 September. The second column shows a related trap: the date-only string `"2026-09-25"` is parsed as midnight *UTC*, which in New York is still the 24th. The fix is to decide which time zone the business day belongs to and compute in it explicitly (for example with `Intl.DateTimeFormat` and `timeZone: "Africa/Lagos"`, see [Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates)), and to run tests with `TZ=UTC` and `TZ=Africa/Lagos` so the difference shows up before production.

### The checklist

When something works in one place and not another, list the differences and test them one at a time, starting with the most likely:

| Difference | Typical bug | How to check |
| --- | --- | --- |
| Data | Production has a customer with no address, an emoji in a name, 10,000 rows | Reproduce with a copy of the real record |
| Time zone and locale | Dates on the wrong day; `toLocaleString` formats differ | `TZ=UTC node …`; print `Intl.DateTimeFormat().resolvedOptions()` |
| Environment variables | A missing or string-typed setting ([the delivery fee](https://zudojs.oyinlola.site/learn/debug-tools#node-inspect)) | Compare the variable names (never paste secrets) |
| Node.js and dependency versions | An API that only exists in a newer version; a library that changed behaviour | `node --version`; install with `npm ci` from the lockfile |
| Operating system | File names: macOS and Windows ignore case, Linux does not (`./Invoice.js` vs `./invoice.js`); `\r\n` line endings | Run the tests in a Linux container or CI |
| Timing and load | Races, timeouts, a cache that is always warm locally | Controlled delays, many concurrent requests |
| State | A leftover file, a database row, a feature flag, a logged-in admin | Start from a clean database and a fresh user |

A small script that prints the environment facts (without secrets) saves a round trip in every bug report:

env-report.js

```ts
console.log({
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  env: Object.keys(process.env).filter((k) => k.startsWith("SHOP_")).sort(),
});
```

Continuous integration (CI), a server that runs your tests on every push in a clean, known environment, is the standard cure for "works on my machine": if the tests pass there, they pass somewhere other than your laptop.

## Writing it up

A bug is finished when the next person can understand it without you. For anything that affected users, write a short report in the issue or pull request:

**Summary:** Invoices since 9 September included cancelled lines.

**Impact:** 37 invoices overstated by ₦800 to ₦12,400. Customers were not charged the wrong amount; only the documents were wrong.

**Timeline:** introduced 9 Sept (commit c9e71ff), reported 14 Sept 09:10, fixed 14 Sept 11:30, invoices reissued 14 Sept 16:00.

**Root cause:** a refactor removed an unnamed business rule; no test covered cancelled lines.

**Fix and prevention:** rule restored as `billableLines`; regression test added; PR checklist now asks for a test with every new business rule.

Teams that write these, blamelessly, get better every month, because each report turns one bug into a guard against a whole class of them. The five hunts in this lesson each ended the same way: a fix at the cause, a test that fails without it, and one idea for stopping the next one.

## Practice

TRY IT YOURSELF

### Bisect a broken discount

You have 200 commits since the last release, which was good. The test `node check-discount.js` exits 1 when discounts are wrong. (a) Write the commands to find the first bad commit automatically, given the release commit `v1.4.0`. (b) About how many times will the test run? (c) Some commits in the middle fail to start because of a missing file that was added back later. What should `check-discount.js` do on those commits?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Math.log2(n)` gives the exact number of halvings; `Math.ceil` rounds it up to a whole number of test runs, the same as the worked example.

HINT 2

`console.log(\`${commits} commits: about ${Math.ceil(Math.log2(commits))} test runs\`);`

SOLUTION

(a)

```ts
git bisect start
git bisect bad
git bisect good v1.4.0
git bisect run node check-discount.js
git bisect reset
```

(b) log₂ 200 is about 7.6, so 8 runs. Doubling the history only adds one more run.

(c) Detect that the commit cannot be tested (for example, the import fails) and exit with code 125, which tells bisect to skip it. Exiting 1 there would make bisect blame the wrong commit.

bisect-steps.js

```ts
for (const commits of [12, 200, 1000, 100000]) {
  console.log(`${commits} commits: about ${Math.ceil(Math.log2(commits))} test runs`);
}
```

Output of `node bisect-steps.js` and of the browser terminal

```ts
12 commits: about 4 test runs
200 commits: about 8 test runs
1000 commits: about 10 test runs
100000 commits: about 17 test runs
```

TRY IT YOURSELF

### Five whys for the vanished deposit

Do a five-whys analysis for [bug hunt 2](#race), starting from "Ada's ₦5,000 deposit disappeared". Write each answer, then one action for the last two levels.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Re-read [Bug hunt 2](#race)'s reasoning block and the "why it never failed on the developer's laptop" answer: each of your five whys should use a fact already established there, one level deeper each time.

HINT 2

The last two levels should point at something about *testing practice*, not the specific race — what kind of test would have had to exist for this bug to be caught before release?

SOLUTION

1. Why did it disappear? The transfer deposit overwrote the balance that the card deposit had written.
2. Why did it overwrite it? Both deposits read the balance before either wrote, and each wrote "what I read + my amount".
3. Why could they both read first? Deposit was written as read-then-write in application code, with no lock and no atomic update.
4. Why did testing not find it? All tests sent one deposit at a time against a local database with no latency, so the race window was never hit.
5. Why were there no concurrency tests? The team had no guideline that money-changing operations must be tested under concurrent calls.

Actions: (4) add a test that fires many concurrent deposits and checks the final balance, as `race-fixed.js` does; (5) a rule: every operation that changes money uses an atomic database update or a transaction with a row lock, and ships with a concurrency test.

TRY IT YOURSELF

### Hunt: the discount that grows

Report: "The first customer today got 10% off, the second 20%, the third 30%." Find the bug in this code by reproducing it, then fix it and prove the fix with three customers.

```ts
const DEFAULT_PROMO = { percent: 0, reasons: [] };

function promoFor(customer) {
  const promo = DEFAULT_PROMO;
  if (customer.firstOrderToday) {
    promo.percent += 10;
    promo.reasons.push("first order today");
  }
  return promo;
}
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Copy each field's *value* into a new object first (a plain number, and a new array made from the old one's contents), then apply the `if`. That new object is what you return.

HINT 2

`const promo = { percent: DEFAULT_PROMO.percent, reasons: [...DEFAULT_PROMO.reasons] }; if (customer.firstOrderToday) { promo.percent += 10; promo.reasons.push("first order today"); } return promo;`

SOLUTION

Reproduce with three customers who all qualify. Hypothesis: `promo` is not a copy, it *is* `DEFAULT_PROMO`, so every call adds 10 to the same object. Test: `promoFor(a) === promoFor(b)` would be `true`.

promo.js

```ts
const DEFAULT_PROMO = Object.freeze({ percent: 0, reasons: Object.freeze([]) });

function promoFor(customer) {
  const promo = { percent: DEFAULT_PROMO.percent, reasons: [...DEFAULT_PROMO.reasons] };
  if (customer.firstOrderToday) {
    promo.percent += 10;
    promo.reasons.push("first order today");
  }
  return promo;
}

const customers = [{ name: "Ada" }, { name: "Bola" }, { name: "Chidi" }].map((c) => ({ ...c, firstOrderToday: true }));
for (const customer of customers) {
  const promo = promoFor(customer);
  console.log(customer.name, promo.percent, promo.reasons.length);
}
console.log(DEFAULT_PROMO.percent);
```

Output of `node promo.js` and of the browser terminal

```ts
Ada 10 1
Bola 10 1
Chidi 10 1
0
```

Each call builds a new object with its own array, and the frozen default makes any future `DEFAULT_PROMO.percent += …` fail loudly in strict mode code instead of silently accumulating.

## Summary

- When something "worked before", binary-search the history: `git bisect start`, mark one bad and one good commit, and `git bisect run` a check script that exits 0 for good, 1 for bad and 125 for "cannot test". It needs about log₂ n runs. Keep the script untracked and `git bisect reset` when done.
- Binary search also works on input data, pipeline steps and dependency upgrades, as long as the check is reliable.
- Root-cause analysis asks "why?" until the answer is something you can change, blamelessly. Fix the symptom, the cause and the process.
- Off-by-one bugs hide in inclusive-vs-exclusive ends and floor-vs-ceil; check "every item exactly once" across many sizes.
- Lost updates happen when two operations read before either writes. Reproduce by controlling timing; fix with atomic updates or per-key serialisation; verify under heavy concurrency.
- A detached method loses `this`; an error about reading a property of `undefined` inside a method is the tell.
- Money in floating point is off by a kobo somewhere; compute in integer kobo and round once, and compare against an exact reference such as BigInt.
- Spread copies are shallow; shared inner arrays leak data between users. Clone deeply and freeze templates.
- "Works on my machine" means a difference: data, time zone, environment, versions, OS, timing or state. List them and test one at a time.

This completes the JavaScript platforms course. Next: [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup) starts the TypeScript course, where a type checker catches many of the bugs you hunted in this module before the code ever runs.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
