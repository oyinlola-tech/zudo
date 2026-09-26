---
title: "Why doesn't this work? — ZudoJS Academy"
description: "Diagnose broken algorithms that run without errors but give wrong answers, using trace tables, predictions and boundary tests, then fix each root cause."
source: https://zudojs.oyinlola.site/learn/solve-broken
---

LEVEL 1 · LESSON 18 OF 18

Problem-solving fundamentals Foundation

# Why doesn't this work?

Diagnose broken algorithms that run without errors but give wrong answers, using trace tables, predictions and boundary tests, then fix each root cause.

- **50 min** to read and try
- **You need:** Problem workshop: intermediate
- **You build:** Diagnoses and fixes for six broken algorithms, plus a symptom-to-cause table you can use on any bug

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Trace an algorithm by hand in a trace table and find the exact step where it goes wrong
- Predict what code will do before running it, and use the difference as evidence
- Recognise off-by-one errors, wrong condition order, missing base cases, mutation during iteration and float comparison from their symptoms
- Fix the root cause instead of the symptom, and add the test that would have caught the bug
- Use a symptom-to-cause table to decide where to look first

## The bug with no error message

A customer writes to a small online shop: "Your site says my average spend over the last week is NaN. What does that mean?" The developer opens the code. It runs. There is no red error, no stack trace, nothing to search for. The program does exactly what it was told. It was just told the wrong thing.

These are **logic errors**: the code is valid JavaScript, it runs to the end, and the answer is wrong. They are the hardest bugs for beginners, because the usual strategy, "read the error message", has nothing to read. And they are the most common bugs in real systems, because syntax errors never survive long enough to reach a customer.

In this lesson you are handed six algorithms that are already written and already wrong. Your tools are not new syntax. They are the reasoning tools from this whole course: predict, trace, compare, find the first step where reality and your prediction disagree. In each case, try to find the bug yourself before you read the diagnosis.

## The method: predict, trace, compare

When code gives a wrong answer, resist the urge to change things until it works. Changing code at random can hide a bug instead of fixing it. Instead:

1. **Reproduce** the bug with the smallest input that shows it. Nine days of sales is easier to follow than nine thousand.
2. **Predict** what the code *should* do with that input, working it out by hand from the problem, not from the code.
3. **Trace** what the code *actually* does, step by step, writing down every variable after every step.
4. **Compare**: find the *first* step where the trace and your prediction disagree. The bug is at or just before that step.
5. **Fix the cause**, not the symptom, then add a test with the input that exposed it, so the bug can never come back unnoticed.

The main tool for step 3 is a **trace table**: one column per variable, one row per step. Here is a tiny, correct loop and its trace:

trace-demo.js

```ts
const prices = [300, 500, 200];
let total = 0;
for (let i = 0; i < prices.length; i++) {
  total = total + prices[i];
}
console.log(total);
```

Output of `node trace-demo.js` and of the browser terminal

```ts
1000
```

| Step | `i` | `i < prices.length` | `prices[i]` | `total` after the step |
| --- | --- | --- | --- | --- |
| start | – | – | – | 0 |
| 1 | 0 | true | 300 | 300 |
| 2 | 1 | true | 500 | 800 |
| 3 | 2 | true | 200 | 1000 |
| end | 3 | false: the loop stops | – | 1000 |

Writing it out feels slow. It is also the only way to see what the computer sees, instead of what you meant. You can make the computer write the trace for you by printing the variables inside the loop; you will do that below. Printing is quick, but the paper version makes you *predict* each row, and the prediction is what finds the bug.

## Bug 1: off by one

Here is the code behind the customer's NaN. It should return the average of the last 7 days of sales.

average-broken.js

```ts
function averageLast7(sales) {
  let total = 0;
  for (let i = sales.length - 7; i <= sales.length; i++) {
    total = total + sales[i];
  }
  return total / 7;
}

const sales = [120, 90, 100, 80, 110, 95, 105, 130, 70];   // 9 days
console.log(averageLast7(sales));
```

Output of `node average-broken.js` and of the browser terminal

```ts
NaN
```

REASON IT OUT

### Find it: the last 7 days

- With 9 days of sales, which positions hold the last 7 days? (Positions start at 0.)
- Which values does `i` take in the loop? Write them all down.
- What is `sales[9]`? What happens when you add it to a number?
- What will this function do for a customer with only 3 days of history, even after you fix the first bug?

**Show the reasoning**

**Prediction:** 9 days means positions 0 to 8. The last 7 are positions 2 to 8: 100 + 80 + 110 + 95 + 105 + 130 + 70 = 690, and 690 / 7 is about 98.57.

**Trace:** `i` starts at 9 − 7 = 2 and the loop continues while `i <= 9`, so `i` takes the values 2, 3, 4, 5, 6, 7, 8, *9*. That is eight values for seven days. At `i = 9`, `sales[9]` is past the end of the list, which gives `undefined`, and `690 + undefined` is `NaN`. Once a total is NaN, everything after it is NaN.

**Root cause:** `<=` where `<` was needed. The last valid position is `length − 1`, so a loop over positions must stop *before* `length`.

**Second bug, same family:** with 3 days, `i` starts at 3 − 7 = −4. `sales[-4]` is also `undefined`, so the result is NaN again. And even without that, dividing by 7 would be wrong when there are fewer than 7 days. Decide: average the days you have, and return `null` for a customer with no sales at all.

Here is the trace, written by the computer. Printing the variables inside the loop shows the exact step where the total breaks:

average-trace.js

```ts
const sales = [120, 90, 100, 80, 110, 95, 105, 130, 70];
let total = 0;
for (let i = sales.length - 7; i <= sales.length; i++) {
  total = total + sales[i];
  console.log(`i=${i} sales[i]=${sales[i]} total=${total}`);
}
```

Output of `node average-trace.js` and of the browser terminal

```ts
i=2 sales[i]=100 total=100
i=3 sales[i]=80 total=180
i=4 sales[i]=110 total=290
i=5 sales[i]=95 total=385
i=6 sales[i]=105 total=490
i=7 sales[i]=130 total=620
i=8 sales[i]=70 total=690
i=9 sales[i]=undefined total=NaN
```

The first row that disagrees with the prediction is `i=9`: there should not be a ninth position at all. Now the fix, which handles both bugs, and the tests that pin them down:

average-fixed.js

```ts
function check(label, actual, expected) {
  console.log(actual === expected ? `PASS ${label}` : `FAIL ${label}: got ${actual}, expected ${expected}`);
}

function averageLast7(sales) {
  if (sales.length === 0) return null;
  const start = Math.max(0, sales.length - 7);
  let total = 0;
  for (let i = start; i < sales.length; i++) {
    total = total + sales[i];
  }
  return total / (sales.length - start);
}

check("9 days", averageLast7([120, 90, 100, 80, 110, 95, 105, 130, 70]), 690 / 7);
check("exactly 7 days", averageLast7([10, 20, 30, 40, 50, 60, 70]), 40);
check("only 3 days", averageLast7([100, 200, 300]), 200);
check("no sales", averageLast7([]), null);
```

Output of `node average-fixed.js` and of the browser terminal

```ts
PASS 9 days
PASS exactly 7 days
PASS only 3 days
PASS no sales
```

`Math.max(0, …)` keeps the start from going below position 0, and dividing by the number of days actually added makes the average honest. The "exactly 7 days" test is the boundary: the start is exactly 0.

### The fencepost family

Off-by-one errors are also called **fencepost errors**, after a classic puzzle: a fence 30 metres long with a post every 3 metres needs 11 posts, not 10, because there is a post at both ends. The same trap hides in "how many days from the 3rd to the 7th, both included?" (5, not 7 − 3 = 4) and in "how many pages?" from [pagination](https://zudojs.oyinlola.site/learn/solve-intermediate#pagination). When you see an answer that is wrong by exactly one, look at every `<` versus `<=`, every start at 0 versus 1, and every "both ends included?" question.

## Bug 2: wrong condition order

A shop's loyalty rule: 10% off orders of ₦50,000 or more, 5% off orders of ₦10,000 or more. The marketing team reports that nobody has ever received the 10% discount.

loyalty-broken.js

```ts
function discountPercent(totalKobo) {
  if (totalKobo >= 1000000) return 5;    // ₦10,000 or more
  if (totalKobo >= 5000000) return 10;   // ₦50,000 or more
  return 0;
}

console.log(discountPercent(500000), discountPercent(2000000), discountPercent(8000000));
```

Output of `node loyalty-broken.js` and of the browser terminal

```ts
0 5 5
```

REASON IT OUT

### Find it: who reaches the second line?

- A function stops at its first `return`. Which totals ever reach the second `if`?
- Can any of those totals be ₦50,000 or more?
- Why did every test the developer wrote pass?

**Show the reasoning**

**Reachability:** the second `if` only runs when the first condition was false, that is, for totals *below* ₦10,000. None of those is ₦50,000 or more, so the second `return` can never run. It is **unreachable code**: it looks like it does something, and it never does.

**Root cause:** the checks overlap (every total over ₦50,000 is also over ₦10,000), and the broader check came first. With overlapping `>=` checks, the most specific (highest) one must come first.

**Why the tests passed:** the developer tested ₦5,000 and ₦20,000, which were both right. Nobody tested a total over ₦50,000, the only input that reaches the bug. A test for every rule, including one on each boundary, would have caught it the first time it ran.

The question "which inputs reach this line?" is one of the most powerful reasoning tools you have. For each line, describe the inputs that get there. If the answer is "none", the line is dead and something above it is wrong.

loyalty-fixed.js

```ts
function discountPercent(totalKobo) {
  if (totalKobo >= 5000000) return 10;
  if (totalKobo >= 1000000) return 5;
  return 0;
}

for (const total of [999999, 1000000, 4999999, 5000000, 8000000]) {
  console.log(`₦${total / 100}: ${discountPercent(total)}%`);
}
```

Output of `node loyalty-fixed.js` and of the browser terminal

```ts
₦9999.99: 0%
₦10000: 5%
₦49999.99: 5%
₦50000: 10%
₦80000: 10%
```

### When order causes a crash

Order also matters when one check *protects* another. This function should refuse missing users and banned users:

guard-order.js

```ts
function canCheckout(user) {
  if (user.banned) return "no: banned";
  if (user === null) return "no: please log in";
  return "yes";
}

console.log(canCheckout({ name: "Ada", banned: false }));
try {
  console.log(canCheckout(null));
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node guard-order.js` and of the browser terminal

```ts
yes
TypeError: Cannot read properties of null (reading 'banned')
```

The null check exists, but it runs *after* the line it was supposed to protect. Reading `.banned` of nothing crashes first. The rule: a check that makes a later line safe must come before that line. Swap the two `if`s and both calls work.

## Bug 3: the missing base case

A function may call *itself*. This is called **recursion**, and you will study it properly in [Recursion](https://zudojs.oyinlola.site/learn/js-recursion). The idea: solve a problem by solving a slightly smaller version of the same problem, until the problem is so small that the answer is obvious. That smallest case, where the function answers directly without calling itself, is the **base case**. Every call waits for the inner call to finish, so if the calls never reach a base case, they pile up until JavaScript gives up.

sum-broken.js

```ts
function sumTo(n) {
  return n + sumTo(n - 1);   // 5 + 4 + 3 + ... but where does it stop?
}

try {
  console.log(sumTo(5));
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node sum-broken.js` and of the browser terminal

```ts
RangeError: Maximum call stack size exceeded
```

The message means "too many calls waiting for each other". It is JavaScript's way of saying "your recursion never stopped". The fix is a base case: `if (n === 0) return 0;`. But a base case that exists is not enough. It must be *reachable* from every input.

Here is a more realistic case. A savings app rewards whoever started a chain of referrals. Each user records who referred them; the founder of a chain was referred by nobody (`null`).

referrals-broken.js

```ts
const referredBy = { dayo: "chen", chen: "bola", bola: "ada", ada: null };

function founder(user) {
  const parent = referredBy[user];
  if (parent === null) return user;    // the base case
  return founder(parent);
}

console.log(founder("dayo"));

for (const user of ["zara", "ada"]) {
  try {
    console.log(founder(user));
  } catch (error) {
    console.log(`${user}: ${error.name}`);
  }
}
```

Output of `node referrals-broken.js` and of the browser terminal

```ts
ada
zara: RangeError
ada
```

REASON IT OUT

### Find it: why does zara never stop?

- Trace `founder("dayo")`: write down each call and the value of `parent`.
- Now trace `founder("zara")`. What is `referredBy["zara"]`? Does it equal `null`? What is the next call?
- Someone edits the data so that `ada` was referred by `dayo`. What happens to `founder("dayo")`?

**Show the reasoning**

**dayo:** `founder("dayo")` → parent "chen" → `founder("chen")` → parent "bola" → `founder("bola")` → parent "ada" → `founder("ada")` → parent `null`: base case, return "ada". Four calls, and the answer travels back out through all of them.

**zara** is not in the table, so `referredBy["zara"]` is `undefined`. `undefined === null` is false, so the base case does not fire and the function calls `founder(undefined)`. The table has no entry for that either, so it calls `founder(undefined)` again, forever. The base case only covers "the founder", not "a user we have never heard of".

**A cycle** (ada referred by dayo) means the chain dayo → chen → bola → ada → dayo → … never reaches `null`. Real data contains mistakes like this, so the function must protect itself: remember the users already visited, and stop if one comes round again.

**Root cause:** the base case covers the happy path only. Every input must be able to reach *some* stopping point: the founder, an unknown user, or a cycle.

referrals-fixed.js

```ts
function founder(user, referredBy, visited = new Set()) {
  if (referredBy[user] === undefined) return "unknown user";
  if (visited.has(user)) return "cycle in the data";
  visited.add(user);
  const parent = referredBy[user];
  if (parent === null) return user;
  return founder(parent, referredBy, visited);
}

const good = { dayo: "chen", chen: "bola", bola: "ada", ada: null };
const looped = { dayo: "chen", chen: "bola", bola: "ada", ada: "dayo" };

console.log(founder("dayo", good));
console.log(founder("ada", good));
console.log(founder("zara", good));
console.log(founder("dayo", looped));
```

Output of `node referrals-fixed.js` and of the browser terminal

```ts
ada
ada
unknown user
cycle in the data
```

Now there are three ways out, and every input takes one of them. `visited = new Set()` is a **default parameter**: the first call gets a fresh empty set, and each recursive call passes the same set along so it remembers the whole chain. The table is passed in as a parameter too, so the tests can use a broken table without touching the real one.

> NOTE
>
> The recursive version of `sumTo` has the same hidden problem: with `if (n === 0) return 0;`, `sumTo(-1)` or `sumTo(2.5)` skips over 0 and never stops. `if (n <= 0) return 0;` is reachable from every number.

## Bug 4: changing a list while walking through it

An admin screen has a button that removes cancelled orders from the list on screen. Staff report that "sometimes one cancelled order stays behind".

remove-broken.js

```ts
function removeCancelled(orders) {
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].status === "cancelled") {
      orders.splice(i, 1);   // remove 1 item at position i
    }
  }
  return orders;
}

const orders = [
  { id: "A", status: "paid" },
  { id: "B", status: "cancelled" },
  { id: "C", status: "cancelled" },
  { id: "D", status: "paid" },
];

const left = removeCancelled(orders);
let ids = "";
for (const order of left) ids = ids + order.id + ":" + order.status + " ";
console.log(ids);
```

Output of `node remove-broken.js` and of the browser terminal

```ts
A:paid C:cancelled D:paid
```

`orders.splice(i, 1)` removes one item at position `i`, and every item after it moves one position to the left to close the gap.

REASON IT OUT

### Find it: where did C go?

- Fill in a trace table with the columns `i`, the list's contents, and what happens at that step.
- After B is removed at `i = 1`, which order is now at position 1? What is `i` on the next step?
- Why does the bug only appear "sometimes"?

**Show the reasoning**

| `i` | List before the step | What happens |
| --- | --- | --- |
| 0 | A B C D | A is paid: keep |
| 1 | A B C D | B is cancelled: remove it. C and D move left. |
| 2 | A C D | Position 2 is now **D**. C moved into position 1, which the loop has already passed. |
| 3 | A C D | 3 is not less than the length (3): stop |

**Root cause:** removing an item shifts the rest of the list, but `i` still moves forward, so the item right after a removed one is never looked at. The loop and the list disagree about where they are.

**"Sometimes":** it only goes wrong when two cancelled orders are next to each other. With one cancelled order, or cancelled orders spread out, the skipped item is always a paid one and nothing looks wrong. That is why the test data must include two matching items in a row.

There are two fixes. The best one avoids the problem entirely: do not change the list you are walking through. Build a new list of the orders to keep, as in [the filtering problem](https://zudojs.oyinlola.site/learn/solve-intermediate#filter). If you really must remove items in place, walk *backwards*: removing an item then only shifts items the loop has already visited.

remove-fixed.js

```ts
function keepNotCancelled(orders) {
  const kept = [];
  for (const order of orders) {
    if (order.status !== "cancelled") kept.push(order);
  }
  return kept;
}

function removeCancelledInPlace(orders) {
  for (let i = orders.length - 1; i >= 0; i--) {
    if (orders[i].status === "cancelled") orders.splice(i, 1);
  }
  return orders;
}

function ids(list) {
  let out = "";
  for (const order of list) out = out + order.id;
  return out;
}

const make = () => [
  { id: "A", status: "paid" },
  { id: "B", status: "cancelled" },
  { id: "C", status: "cancelled" },
  { id: "D", status: "paid" },
  { id: "E", status: "cancelled" },
];

console.log(ids(keepNotCancelled(make())), ids(removeCancelledInPlace(make())));
console.log(ids(keepNotCancelled([])), "|", ids(keepNotCancelled([{ id: "X", status: "cancelled" }])), "|");
```

Output of `node remove-fixed.js` and of the browser terminal

```ts
AD AD
 |  |
```

`make` is a small function that returns a fresh copy of the test data each time, so the in-place version cannot spoil the data for the other test. The last line checks two edge cases: an empty list, and a list where every order is removed; both print nothing between the bars. `i--` counts down by one each step.

## Bug 5: comparing decimals exactly

A school lets parents pay fees in instalments. An invoice of ₦3.30 in late fees was paid as ₦1.10 and then ₦2.20. The system still shows it as unpaid.

invoice-broken.js

```ts
const due = 3.3;
const payments = [1.1, 2.2];

let paid = 0;
for (const p of payments) paid = paid + p;

console.log(paid);
console.log(paid === due ? "Fully paid" : "Still owing");
```

Output of `node invoice-broken.js` and of the browser terminal

```ts
3.3000000000000003
Still owing
```

REASON IT OUT

### Find it: why is 1.1 + 2.2 not 3.3?

- Where have you seen a number like 3.3000000000000003 before?
- If you change `===` to `>=`, is the bug fixed, or just hidden?
- What is the fix that makes the comparison exact?

**Show the reasoning**

**Floating point:** computers store decimals in binary, and 1.1, 2.2 and 3.3 have no exact binary form, just as 1/3 has no exact decimal form. The tiny errors add up to 3.3000000000000003, and `===` sees every digit ([Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math)).

**Changing to `>=`** makes this example print "Fully paid", but only by luck: here the error happened to push the sum up. With other amounts the sum lands slightly *below* the true value (0.7 + 0.1 is 0.7999999999999999), and a correctly paid invoice would stay unpaid. That is a symptom fix.

**Root cause:** money stored as decimal naira. Store whole kobo (330, 110, 220) and every sum is exact. For measurements that really are decimals, such as weights, compare with a tolerance: "close enough" instead of "exactly equal".

invoice-fixed.js

```ts
const dueKobo = 330;
const paymentsKobo = [110, 220];

let paidKobo = 0;
for (const p of paymentsKobo) paidKobo = paidKobo + p;

console.log(paidKobo, paidKobo === dueKobo ? "Fully paid" : "Still owing");

function closeTo(a, b) {
  return Math.abs(a - b) < 0.000001;
}
console.log(0.7 + 0.1 >= 0.8, closeTo(0.7 + 0.1, 0.8));
```

Output of `node invoice-fixed.js` and of the browser terminal

```ts
330 Fully paid
false true
```

### The loop that never ends

Exact comparison with decimals can also stop a loop from ever stopping. This loop is meant to run for 0, 0.1, 0.2 … up to 1 and then stop. A safety counter stops it after 15 steps so the example can finish:

float-loop.js

```ts
let steps = 0;
for (let x = 0; x !== 1; x = x + 0.1) {
  steps = steps + 1;
  if (steps === 15) {
    console.log(`still running at x = ${x}`);
    break;
  }
}

let safeSteps = 0;
for (let tenths = 0; tenths <= 10; tenths++) safeSteps = safeSteps + 1;
console.log(`counting whole tenths: ${safeSteps} steps`);
```

Output of `node float-loop.js` and of the browser terminal

```ts
still running at x = 1.4000000000000001
counting whole tenths: 11 steps
```

`x` goes 0.1, 0.2, 0.30000000000000004, …, 0.9999999999999999, 1.0999999999999999, and jumps straight past 1 without ever being exactly 1, so `x !== 1` stays true forever. `break` leaves a loop early. The fix is the same idea as kobo: count in whole numbers (tenths) and divide only when you need the decimal.

## Bug 6: the total that only counts the last item

A last one, short and very common. A cart total is always equal to the price of the last item:

total-broken.js

```ts
function cartTotal(items) {
  let total = 0;
  for (const item of items) {
    total = item.price * item.quantity;
  }
  return total;
}

console.log(cartTotal([{ price: 500, quantity: 2 }, { price: 300, quantity: 1 }]));
```

Output of `node total-broken.js` and of the browser terminal

```ts
300
```

Trace it: after the first item `total` is 1000, after the second it is 300. Each step *replaces* the total instead of *adding* to it. The line should be `total = total + item.price * item.quantity;`. A test with only one item would pass; you need at least two items to see the difference. This is why "one item" and "several items" are separate rows in an edge-case table.

## From symptom to suspect

After enough bugs, you start to recognise them by their symptoms. This table is a starting point for where to look first. It does not replace tracing, but it tells you which rows of the trace table to watch.

| Symptom | Likely cause | Look at |
| --- | --- | --- |
| `NaN` appears in a total | Reading past the end of a list, a missing starting value, or text in arithmetic | Loop bounds, `<` vs `<=`, the first value of each counter |
| Wrong by exactly one (item, day, page) | Off-by-one / fencepost | Start at 0 or 1, `<` vs `<=`, both ends included? |
| One branch never happens | Wrong condition order, unreachable code | Which inputs reach that line? |
| "Maximum call stack size exceeded" | Missing or unreachable base case | Can every input reach a stopping point? Unknown input? Cycles? |
| Items skipped "sometimes" | Changing a list while walking through it | `splice`, removals inside a forward loop; two matches in a row |
| Numbers like 0.30000000000000004; equal amounts not equal | Exact comparison of decimals | Money in decimals, `===` on results of arithmetic |
| A loop that never ends | The stop condition can never become true | Is the loop variable changed? Can it skip past the target? |
| Result equals the last item only | Replacing instead of adding | `=` where `total = total + …` was needed |
| A crash on missing data, though a check exists | The check runs after the line it protects | Order of guard clauses |

Notice what is *not* in the table: "change things until it works". Each fix in this lesson came from a specific explanation of why the old code was wrong, and each came with a test that fails on the old code and passes on the new. That test is your proof. If you cannot write a test that fails before your fix, you have not found the bug yet.

These same bugs appear in every language and at every level of experience. [The debugging method](https://zudojs.oyinlola.site/learn/debug-method) and [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools), later in the academy, add breakpoints and debuggers, but they automate the trace table; the reasoning stays yours.

## Practice

Each exercise gives you broken code and a bug report. Predict, trace, compare, fix, and write the test that proves it.

TRY IT YOURSELF

### Locked out too late

Bug report: "The rule says an account locks after 3 failed logins, but I could try a 4th time." Find the bug by tracing the failures 1 to 4.

```ts
function isLocked(failedAttempts) {
  return failedAttempts > 3;
}
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Trace `failedAttempts = 3`: does `failedAttempts > 3` count that as locked? "Locks after 3 failed logins" means 3 itself should already be locked.

HINT 2

Change `>` to `>=`: `return failedAttempts >= 3;`

SOLUTION

Trace: after 1, 2 and 3 failures, `failedAttempts > 3` is false, so the account is still open after the third failure and a fourth try is allowed. "Locks after 3 failed logins" means locked when the count reaches 3: `>= 3`. It is an off-by-one on a boundary, caught by the boundary pair 2 and 3.

locked.js

```ts
function isLocked(failedAttempts) {
  return failedAttempts >= 3;
}

for (const n of [0, 2, 3, 4]) console.log(n, isLocked(n));
```

Output of `node locked.js` and of the browser terminal

```ts
0 false
2 false
3 true
4 true
```

TRY IT YOURSELF

### The average of nothing

Bug report: "The dashboard shows NaN as the average order value for new shops." Trace the function below with an empty list, explain the NaN, and fix it so that a shop without orders gets `null`.

```ts
function averageOrder(totals) {
  let sum = 0;
  for (const t of totals) sum = sum + t;
  return sum / totals.length;
}
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

With an empty list, the loop runs zero times: `sum` stays 0, and the function returns `0 / 0`, which is `NaN`. Add a guard clause before the loop.

HINT 2

`if (totals.length === 0) return null;`

SOLUTION

With an empty list the loop runs zero times, so `sum` is 0, and the function returns `0 / 0`, which is `NaN` in JavaScript: there is no sensible answer to "the average of nothing". The fix is a guard clause for the empty case, and the test is the empty list.

average-order.js

```ts
function averageOrder(totals) {
  if (totals.length === 0) return null;
  let sum = 0;
  for (const t of totals) sum = sum + t;
  return sum / totals.length;
}

console.log(averageOrder([]), averageOrder([4000, 6000]), averageOrder([2500]));
```

Output of `node average-order.js` and of the browser terminal

```ts
null 5000 2500
```

TRY IT YOURSELF

### All paid?

Bug report: "The system said all invoices were paid, but the second one was not." Trace the function with the list below, row by row. Then find a second bug by asking what it returns for an empty list.

```ts
function allPaid(invoices) {
  for (const invoice of invoices) {
    if (invoice.paid) {
      return true;
    } else {
      return false;
    }
  }
}

allPaid([{ id: 1, paid: true }, { id: 2, paid: false }]);
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Both branches return immediately, so the loop can never look past the first invoice. Only return `false` as soon as you find an unpaid one; return `true` after the loop finishes checking everyone.

HINT 2

`if (!invoice.paid) return false;` inside the loop, and `return true;` after it. That also fixes the empty-list case: the loop never runs, and `true` is returned.

SOLUTION

Trace: the loop looks at invoice 1, which is paid, and *returns true* immediately. It never looks at invoice 2. Both branches return, so the loop can never get past its first item: it really answers "is the first invoice paid?". The fix: return `false` as soon as an unpaid invoice is found, and return `true` only after the loop has checked them all.

Second bug: with an empty list the loop body never runs, and the function ends without a `return`, so it returns `undefined`. Decide: "all of zero invoices are paid" is true (there is nothing unpaid), which the fixed version gives naturally.

all-paid.js

```ts
function allPaid(invoices) {
  for (const invoice of invoices) {
    if (!invoice.paid) return false;
  }
  return true;
}

console.log(allPaid([{ id: 1, paid: true }, { id: 2, paid: false }]));
console.log(allPaid([{ id: 1, paid: true }, { id: 2, paid: true }]));
console.log(allPaid([]));
```

Output of `node all-paid.js` and of the browser terminal

```ts
false
true
true
```

## Recap

- Logic errors run without complaint and give wrong answers. Find them by reasoning, not by changing code at random.
- Reproduce with the smallest input, predict by hand, trace step by step, and look for the first step where the two disagree.
- Off-by-one: check `<` vs `<=`, 0 vs 1, and both ends of a range. Condition order: ask which inputs reach each line.
- Recursion needs a base case that every input can reach, including unknown input and cyclic data.
- Do not change a list while walking through it; build a new one. Do not compare decimals exactly; use whole kobo or a tolerance.
- Fix the cause, then add the test that fails on the old code. That test is the proof, and the guard against the bug coming back.

That completes Programming thinking. Next: [Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro), the first lesson of JavaScript fundamentals, where the language came from and how its code is put together. Every habit from this course (inputs, edge cases, tracing, tests) comes with you.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
