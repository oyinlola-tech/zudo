---
title: "Binary search on the answer — ZudoJS Academy"
description: "Use binary search beyond sorted arrays: find the smallest truck capacity, the first failing build and items in rotated lists by halving a range of answers."
source: https://zudojs.oyinlola.site/learn/pattern-binary-search
---

LEVEL 3 · LESSON 20 OF 21

Problem-solving patterns Core

# Binary search on the answer

Use binary search beyond sorted arrays: find the smallest truck capacity, the first failing build and items in rotated lists by halving a range of answers.

- **55 min** to read and try
- **You need:** Big O and complexity, Linear and binary search, and The two pointers pattern
- **You build:** A truck capacity planner, a build bisector, a rotated-log search and a loan repayment finder, all built on one tested firstTrue function

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise problems whose yes/no answers switch from false to true exactly once as a number grows
- Write one firstTrue function with a clear invariant and reuse it for bounds, capacities and versions
- Solve minimum-capacity and first-failing-build problems with O(log range) feasibility checks
- Search a rotated sorted array in O(log n) by deciding which half is sorted
- Choose correct search bounds, and test a search on the answer against a linear scan of all answers

## The problem: how big a truck?

A distribution company must move a warehouse's backlog of parcels to a hub within 5 days. The parcels sit on a conveyor in a fixed order and must be loaded in that order (the ones at the front block the rest). Each day the truck takes parcels from the front of the line until the next one would exceed its capacity, then drives to the hub. Trucks are rented by capacity, in kilograms, and bigger ones cost more. The operations manager asks: *"What is the smallest capacity that ships everything within 5 days?"*

This does not look like searching. There is no sorted array and no target value to find. Yet binary search, which you wrote in [Linear and binary search](https://zudojs.oyinlola.site/learn/dsa-searching), is exactly the tool, once you see what is being searched: not the parcels, but the *possible answers*.

REASON IT OUT

### Before you code: what can the answer be?

- What is the smallest capacity that could possibly work, before you even think about days?
- What capacity certainly ships everything in one day?
- If a capacity of 120 kg ships everything in 5 days, does 121 kg? Does 119 kg?
- Given one capacity, how would you check whether it works? How long does that check take?

**Show the reasoning**

**At least the heaviest parcel.** A truck smaller than that can never carry it, so the answer is at least `max(weights)`.

**The total weight** ships everything in one day, so the answer is at most `sum(weights)`. The answer lies somewhere between these two numbers.

**121 kg certainly works:** a bigger truck can always carry what a smaller one carried each day, so it needs no more days. 119 kg may or may not. This one-way property is the key: once a capacity works, every bigger capacity works too.

**The check** simulates the loading: walk the parcels once, starting a new day whenever the next parcel does not fit, and count the days. One pass over `n` parcels: O(n).

## A naive solution: try every capacity

With a check in hand, the first working solution tries capacities from the smallest possible upwards and stops at the first one that works:

naive-capacity.js

```ts
function daysNeeded(weights, capacity) {
  let days = 1;
  let load = 0;
  for (const w of weights) {
    if (load + w > capacity) {  // this parcel starts the next day
      days++;
      load = 0;
    }
    load += w;
  }
  return days;
}

function minCapacityNaive(weights, maxDays) {
  let capacity = Math.max(...weights);
  while (daysNeeded(weights, capacity) > maxDays) capacity++;
  return capacity;
}

const parcels = [30, 25, 40, 10, 35, 20, 45, 15, 30, 25]; // kg, in conveyor order
console.log(minCapacityNaive(parcels, 5), daysNeeded(parcels, 60), daysNeeded(parcels, 59));
console.log(minCapacityNaive(parcels, 1), minCapacityNaive(parcels, 10));
```

Output of `node naive-capacity.js` and of the browser terminal

```ts
60 5 6
275 45
```

It works: 60 kg is the smallest capacity that ships these ten parcels in 5 days, and 59 kg needs 6. With one day allowed the answer is the total, and with ten days (one parcel a day) it is the heaviest parcel, exactly the two ends from the reason block.

## What is wrong with it: count the operations

The real backlog is thousands of parcels, and the number of candidate capacities grows with the total weight. Count how many parcels the naive search simulates loading, over all the capacities it tries:

naive-capacity-count.js

```ts
function daysNeeded(weights, capacity, counter) {
  let days = 1;
  let load = 0;
  for (const w of weights) {
    counter.loads++;
    if (load + w > capacity) {
      days++;
      load = 0;
    }
    load += w;
  }
  return days;
}

function minCapacityNaive(weights, maxDays, counter) {
  let capacity = Math.max(...weights);
  counter.checks++;
  while (daysNeeded(weights, capacity, counter) > maxDays) {
    capacity++;
    counter.checks++;
  }
  return capacity;
}

for (const n of [100, 1000, 10000]) {
  const weights = Array.from({ length: n }, (_, i) => 1 + ((i * 37) % 50)); // 1 to 50 kg
  const counter = { checks: 0, loads: 0 };
  const capacity = minCapacityNaive(weights, 5, counter);
  console.log(`n=${String(n).padEnd(6)} capacity=${String(capacity).padEnd(6)} checks=${String(counter.checks).padEnd(6)} parcel loads=${counter.loads}`);
}
```

Output of `node naive-capacity-count.js` and of the browser terminal

```ts
n=100    capacity=524    checks=475    parcel loads=47500
n=1000   capacity=5100   checks=5051   parcel loads=5051000
n=10000  capacity=51000  checks=50951  parcel loads=509510000
```

The number of checks grows with the answer (roughly `total weight / days`), and each check walks all `n` parcels. Both grow with `n`, so the work grows like `n²`: 10,000 parcels already cost about half a billion simulated loads. The waste is that each failed check teaches you more than "not this capacity": it teaches you "not this one, *and not any smaller one*". Stepping up by 1 kg throws that away.

## The pattern: find where false turns into true

Write the check's answer for every capacity in order and you get a very particular shape:

```ts
capacity:   45    50    55    59    60    61    65    70   ...  275
days:        8     8     6     6     5     5     5     5   ...    1
works?      no    no    no    no    YES   YES   YES   YES  ...  YES
                                   ^
                        the first yes is the answer
```

A yes/no function whose answers, over an ordered range, go *false, false, …, false, true, true, …, true* and switch exactly once is called a **monotonic predicate** ("predicate" means a function that returns true or false; "monotonic" means it only ever changes in one direction). Binary search does not need a sorted array. It needs exactly this: a range where one test at the middle tells you which half the switch point is in.

- If the middle is **true**, the first true is the middle or somewhere to its left.
- If the middle is **false**, the first true is somewhere to its right.

Every problem in this lesson is solved by one small function, `firstTrue(lo, hi, test)`: the smallest number in `lo` to `hi` for which `test` is true. It uses the half-open style of `lowerBound` in [Linear and binary search](https://zudojs.oyinlola.site/learn/dsa-searching#bounds), with `hi` one past the last candidate, and returns `hi` itself if no candidate passes:

first-true.js

```ts
export function firstTrue(lo, hi, test, counter = { checks: 0 }) {
  // Invariant: every number below lo is false; every number from hi on is true (or past the end).
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    counter.checks++;
    if (test(mid)) hi = mid;     // mid is true: the first true is mid or before it
    else lo = mid + 1;           // mid is false: the first true is after it
  }
  return lo;                     // lo === hi: the first true, or the original hi if none
}
```

The invariant is what makes it correct. At the start nothing is known, so it holds trivially: there is nothing below `lo` in the range and nothing from `hi` on. Each step keeps it: a true middle becomes the new `hi`, a false middle moves `lo` past it. Each step also shrinks the range, because `mid` is strictly below `hi`. When `lo` meets `hi`, the invariant says everything below is false and everything from there on is true: that point is the switch.

The lower bound from the searching lesson is the special case where the test is "is this item at least the target?":

lower-bound.js

```ts
import { firstTrue } from "./first-true.js";

const orderIds = [1004, 1011, 1011, 1011, 1015, 1020];
const lowerBound = (items, target) => firstTrue(0, items.length, (i) => items[i] >= target);
const upperBound = (items, target) => firstTrue(0, items.length, (i) => items[i] > target);

console.log(lowerBound(orderIds, 1011), upperBound(orderIds, 1011), upperBound(orderIds, 1011) - lowerBound(orderIds, 1011));
console.log(lowerBound(orderIds, 1000), lowerBound(orderIds, 1013), lowerBound(orderIds, 9999));
```

Output of `node lower-bound.js` and of the browser terminal

```ts
1 4 3
0 4 6
```

The first and last position of 1011 are 1 and 3 (upper bound minus one), it appears 3 times, a new id 1013 would be inserted at position 4, and 9999 would go past the end (6). One function, many questions.

### How to recognise it

- The question asks for the **minimum** (or maximum) value such that something is possible: the smallest capacity, the lowest speed, the fewest servers, the largest loan.
- You can write a **check** for one candidate answer ("can it be done with this capacity?") much more easily than you can compute the answer directly.
- The check is **monotonic**: if a value works, every bigger (or every smaller) value works too.
- Something is **ordered in time** and changes once: the first bad version, the first day stock ran out, the first log line after a timestamp.

## The improved solution

Search capacities from `max(weights)` to `sum(weights)` with the loading simulation as the test. Because `firstTrue` treats `hi` as exclusive, pass `sum + 1`:

capacity.js

```ts
import { firstTrue } from "./first-true.js";

export function daysNeeded(weights, capacity, counter = { loads: 0 }) {
  let days = 1;
  let load = 0;
  for (const w of weights) {
    counter.loads++;
    if (load + w > capacity) {
      days++;
      load = 0;
    }
    load += w;
  }
  return days;
}

export function minCapacity(weights, maxDays, counter = { checks: 0, loads: 0 }) {
  if (weights.length === 0) return 0;
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new RangeError("maxDays must be a positive integer");
  const heaviest = Math.max(...weights);
  const total = weights.reduce((a, b) => a + b, 0);
  return firstTrue(heaviest, total + 1, (c) => daysNeeded(weights, c, counter) <= maxDays, counter);
}
```

Try it on the ten parcels, and count the work as before:

min-capacity.js

```ts
import { minCapacity } from "./capacity.js";

const parcels = [30, 25, 40, 10, 35, 20, 45, 15, 30, 25];
console.log(minCapacity(parcels, 5), minCapacity(parcels, 1), minCapacity(parcels, 10), minCapacity([], 3));

for (const n of [100, 1000, 10000]) {
  const weights = Array.from({ length: n }, (_, i) => 1 + ((i * 37) % 50));
  const counter = { checks: 0, loads: 0 };
  const capacity = minCapacity(weights, 5, counter);
  console.log(`n=${String(n).padEnd(6)} capacity=${String(capacity).padEnd(6)} checks=${String(counter.checks).padEnd(3)} parcel loads=${counter.loads}`);
}
```

Output of `node min-capacity.js` and of the browser terminal

```ts
60 275 45 0
n=100    capacity=524    checks=11  parcel loads=1100
n=1000   capacity=5100   checks=15  parcel loads=15000
n=10000  capacity=51000  checks=18  parcel loads=180000
```

The same capacities as the naive version, with 11 to 18 checks instead of hundreds or tens of thousands. At 10,000 parcels, 180,000 simulated loads instead of about 510 million. The number of checks is `log₂(total − heaviest + 1)`, rounded up: doubling the total weight adds just one check.

Notice the division of labour. The *check* contains all the knowledge about trucks and parcels; the *search* knows nothing about them. That separation is what makes the pattern reusable: change the check and the same `firstTrue` finds a minimum rider speed, a minimum server count, or a minimum interest rate.

## Its complexity

Let `n` be the input size, `R` the number of candidate answers (here `total − heaviest + 1`), and `C` the cost of one check (here O(n)).

| Approach | Checks | Total time | Extra space |
| --- | --- | --- | --- |
| try every candidate upwards | up to R | O(R · C) | O(1) |
| binary search on the answer | ⌈log₂ R⌉ | O(C · log R) | O(1) |
| truck capacity | ⌈log₂(total − max + 1)⌉ | O(n log(total)) | O(1) |

The range `R` can be huge (billions of kobo, years of seconds) and it barely matters: `log₂` of a billion is about 30. What matters is the cost of each check, which is why the pattern shines when a check is expensive, as in the next problem.

## The first failing build

On Monday the checkout tests passed. Today, 1,000 commits later, they fail. Running the full test suite for one commit takes about 8 minutes. Which commit broke checkout?

REASON IT OUT

### Before you code: bisecting a history

- Checking every commit from Monday forwards, how many test runs is that at worst, and how long?
- What must be true about the history for binary search to be valid here?
- What could make the test results *not* monotonic?
- What are `lo` and `hi`, and what do you already know about them?

**Show the reasoning**

**Linear:** up to 1,000 runs, about 8,000 minutes, more than five days of machine time.

**Monotonic history:** once a commit is broken, every later commit is broken too, until the fix. So the results over the commits are good, good, …, bad, bad: a monotonic predicate "is this commit broken?".

**What breaks it:** a flaky test (sometimes fails for no reason), or a bug that was introduced, fixed, and introduced again. Then "the first bad commit" is not well defined, and bisecting returns some switch point, not necessarily the one you want. Make the test deterministic first.

**Bounds:** commit 0 (Monday) is known good and the last commit is known bad. Search the commits after the good one; the last one is certainly bad.

bisect.js

```ts
import { firstTrue } from "./first-true.js";

const commits = Array.from({ length: 1001 }, (_, i) => ({ id: `c${String(i).padStart(4, "0")}`, index: i }));
const brokenFrom = 637; // unknown to the search: only the test knows

function testsFail(commit, log) {
  log.push(commit.id); // in real life: check out, build, run the suite (8 minutes)
  return commit.index >= brokenFrom;
}

const log = [];
const first = firstTrue(1, commits.length, (i) => testsFail(commits[i], log));
console.log(`first failing commit: ${commits[first].id} after ${log.length} test runs (about ${log.length * 8} minutes)`);
console.log(log.join(" "));

let linearRuns = 0;
for (const commit of commits.slice(1)) {
  linearRuns++;
  if (commit.index >= brokenFrom) break;
}
console.log(`walking forwards from Monday: ${linearRuns} test runs (about ${linearRuns * 8} minutes)`);
```

Output of `node bisect.js` and of the browser terminal

```ts
first failing commit: c0637 after 10 test runs (about 80 minutes)
c0501 c0751 c0626 c0689 c0658 c0642 c0634 c0638 c0636 c0637
walking forwards from Monday: 637 test runs (about 5096 minutes)
```

Ten test runs, 80 minutes, instead of 637 runs and about three and a half days. The log shows the search homing in: a run in the middle, then a quarter, then an eighth. This is exactly what `git bisect` does. You mark one commit good and one bad; git checks out the middle commit; you (or a script with `git bisect run`) report good or bad; and it halves again. [The Git lesson](https://zudojs.oyinlola.site/learn/git) covers git itself, and [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice) uses bisect on a real bug hunt.

> NOTE
>
> Time estimates like "about 80 minutes" here are *computed* from the number of test runs, not measured. The count is the reliable quantity; multiply it by the cost of one run to reason about time.

## Searching a rotated list

A delivery tracker keeps the last 12 hours of GPS pings in a **ring buffer**: a fixed-size array that is written in a circle, overwriting the oldest entry once full (you built one in [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues)). The timestamps inside are sorted, but the sorted order starts somewhere in the middle of the array and wraps around:

```ts
positions:   0     1     2     3     4     5     6     7
minutes:   [610,  615,  620,  580,  590,  595,  600,  605]
                         ^     ^
                   newest       oldest: the array is sorted, then "rotated" at 3
```

Such an array is called a **rotated sorted array**. Support asks for the ping at minute 595. Plain binary search fails: at the middle (position 3, value 580) it would conclude that 595, being bigger, lies to the right, which here happens to be true, but for 615 it would also go right and miss it.

REASON IT OUT

### Before you code: which half is sorted?

- Split a rotated sorted array at any middle position. Can *both* halves contain the rotation point?
- How can you tell, from just three values (`items[lo]`, `items[mid]`, `items[hi]`), which half is in normal sorted order?
- Once you know one half is sorted, how do you decide whether the target is in it?

**Show the reasoning**

**No.** There is only one place where the values drop, so at least one half has no drop: it is sorted normally.

**Compare the ends.** If `items[lo] <= items[mid]`, the left half has no drop and is sorted. Otherwise the drop is in the left half, so the right half is sorted.

**Range check on the sorted half.** A sorted half contains the target exactly when the target lies between its first and last values. If it does, search there; if not, the target can only be in the other half. Either way, one comparison discards half the array, so the search stays O(log n).

rotated.js

```ts
function searchRotated(items, target, counter = { steps: 0 }) {
  let lo = 0;
  let hi = items.length - 1;           // inclusive bounds this time
  while (lo <= hi) {
    counter.steps++;
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid] === target) return mid;
    if (items[lo] <= items[mid]) {       // left half lo..mid is sorted
      if (items[lo] <= target && target < items[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {                             // right half mid..hi is sorted
      if (items[mid] < target && target <= items[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}

const pings = [610, 615, 620, 580, 590, 595, 600, 605];
console.log(pings.map((m) => searchRotated(pings, m)).join(" "));
console.log(searchRotated(pings, 597), searchRotated([], 1), searchRotated([580], 580));

const big = Array.from({ length: 1000000 }, (_, i) => (i + 400000) % 1000000); // rotated at 600000
const counter = { steps: 0 };
console.log(searchRotated(big, 123456, counter), counter.steps, "steps for a million pings");
```

Output of `node rotated.js` and of the browser terminal

```ts
0 1 2 3 4 5 6 7
-1 -1 0
723456 20 steps for a million pings
```

This version uses inclusive bounds (`lo <= hi`, `mid ± 1`), like the classic search in the searching lesson; `firstTrue` uses half-open bounds. Both are correct on their own terms; mixing them is the bug. Every value is found, a missing minute returns −1, and a million entries take about 20 steps.

> WATCH OUT
>
> With **duplicate** values the trick can fail: in `[5, 5, 5, 1, 5]`, `items[lo]`, `items[mid]` and `items[hi]` are all 5, and nothing tells you which half is sorted. Real solutions then shrink by one (`lo++`), which makes the worst case O(n). Timestamps from one clock are usually unique; order totals are not.

## Failure cases

- **A test that is not monotonic.** Binary search assumes one switch. With a flaky test, or a condition like "the truck is *exactly* full on the last day" (true, false, true…), the result is an arbitrary switch point, returned with total confidence. Before searching, argue that "works for x" implies "works for every bigger x".
- **Bounds that do not contain the answer.** Starting at 1 kg instead of the heaviest parcel is harmless (the check fails there), but ending below the total can mean no capacity passes, and `firstTrue` returns `hi`, a value you never tested. Choose an `lo` that is a valid lower limit and an `hi` that certainly works, or check the result before trusting it.
- **A check that is wrong at the edges.** `daysNeeded` must handle a parcel exactly equal to the capacity (`load + w > capacity`, not `>=`). A bug in the check becomes a bug in the answer, and the search hides it.
- **Mixing bound styles.** `hi = mid` belongs with `lo < hi` and an exclusive `hi`; `hi = mid − 1` belongs with `lo <= hi`. Mixing them loops forever or skips answers, as the searching lesson's classic bugs showed.
- **Searching real numbers.** On decimals, `lo < hi` may never become false. Search integers in the smallest unit (kobo, grams, seconds) whenever you can, or run a fixed number of halvings.
- **Rotated arrays with duplicates** lose the O(log n) guarantee.

## Testing a search on the answer

The naive version, "try every candidate from the bottom", is the perfect reference: slow, but its correctness is obvious. Compare on many small random inputs, including single parcels, parcels of equal weight and a day limit larger than the number of parcels:

capacity-test.js

```ts
import { daysNeeded, minCapacity } from "./capacity.js";

function minCapacitySlow(weights, maxDays) {
  if (weights.length === 0) return 0;
  let c = Math.max(...weights);
  while (daysNeeded(weights, c) > maxDays) c++;
  return c;
}

function xorshift(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

const random = xorshift(2026);
let agree = 0, oneDay = 0, onePerDay = 0;
for (let t = 0; t < 3000; t++) {
  const weights = Array.from({ length: Math.floor(random() * 9) }, () => 1 + Math.floor(random() * 20));
  const days = 1 + Math.floor(random() * 10);
  const fast = minCapacity(weights, days);
  if (fast === minCapacitySlow(weights, days)) agree++;
  if (weights.length > 0 && fast === weights.reduce((a, b) => a + b, 0)) oneDay++;
  if (weights.length > 0 && fast === Math.max(...weights)) onePerDay++;
}
console.log(`${agree}/3000 agree; ${oneDay} answers at the top bound, ${onePerDay} at the bottom bound`);
```

Output of `node capacity-test.js` and of the browser terminal

```ts
3000/3000 agree; 580 answers at the top bound, 1964 at the bottom bound
```

Counting how many answers landed on each bound shows the test reached both ends of the search range, where off-by-one bugs live. The test imports `minCapacity` from `capacity.js`, the file written earlier in this project, so the code you tested is the code you ship. It also borrows that file's `daysNeeded` for the reference, so the test checks the *search*; the check itself was verified by hand on the ten-parcel example.

## Binary search in production

- **`git bisect run`.** Give git a script that exits 0 for good and non-zero for bad, and it bisects unattended. Make the script deterministic; one flaky run sends it down the wrong half.
- **Capacity planning.** "The fewest servers that keep response times under 300 ms at peak" is a search on the answer, with a load test as the check. Each check is expensive, so halving the range matters.
- **Logs and time series.** Log files and metrics are sorted by time; tools jump to the first line after a timestamp with a binary search over the file's byte offsets instead of reading gigabytes.
- **Database indexes.** A B-tree index is a very wide, shallow search tree; each level is a small binary search. It is why `WHERE created_at >= …` on an indexed column is fast.
- **Configuration bisecting.** When one of 40 feature flags breaks a page, turning half of them off at a time finds it in about 6 tries.

## New problems to practise

TRY IT YOURSELF

### The slowest printer that finishes on time

A print shop has jobs with these page counts: `[120, 45, 300, 80, 210]`. A printer prints `s` pages per hour and works on one job at a time; a job of `p` pages takes `Math.ceil(p / s)` whole hours (the leftover part of an hour is not used for the next job). What is the slowest speed that finishes all jobs within 10 hours? Use `firstTrue`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Search speeds from 1 to `Math.max(...jobs)` (inclusive): the slowest one where `hoursAt(jobs, s) <= maxHours` is the switch point `firstTrue` finds.

HINT 2

`return firstTrue(1, Math.max(...jobs) + 1, (s) => hoursAt(jobs, s) <= maxHours);`

SOLUTION

printer.js

```ts
import { firstTrue } from "./first-true.js";

function hoursAt(jobs, speed) {
  let hours = 0;
  for (const pages of jobs) hours += Math.ceil(pages / speed);
  return hours;
}

function slowestSpeed(jobs, maxHours) {
  if (jobs.length > maxHours) return null; // at least one hour per job
  return firstTrue(1, Math.max(...jobs) + 1, (s) => hoursAt(jobs, s) <= maxHours);
}

const jobs = [120, 45, 300, 80, 210];
const speed = slowestSpeed(jobs, 10);
console.log(speed, hoursAt(jobs, speed), hoursAt(jobs, speed - 1));
console.log(slowestSpeed(jobs, 5), slowestSpeed(jobs, 4));
```

Output of `node printer.js` and of the browser terminal

```ts
100 10 11
300 null
```

The bounds: speed 1 is the slowest possible, and at the size of the largest job every job takes one hour, which is the best possible, so if that fails nothing works (hence the early `null` when there are more jobs than hours). Faster is never slower, so the check is monotonic. Printing the hours at the answer and one below it confirms that it is the switch point.

TRY IT YOURSELF

### The smallest monthly repayment

A customer borrows ₦500,000 at 3% interest per month and wants to repay it in 12 equal monthly payments. Each month, interest is added to the balance (rounded to the nearest kobo) and then the payment is subtracted. Find the smallest payment, in whole kobo, that brings the balance to zero or below after 12 months.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Search payments from 0 to `principal * 2` (inclusive) for the smallest one where `balanceAfter(principal, 0.03, p, 12) <= 0`.

HINT 2

`const payment = firstTrue(0, principal * 2, (p) => balanceAfter(principal, 0.03, p, 12) <= 0);`

SOLUTION

repayment.js

```ts
import { firstTrue } from "./first-true.js";

function balanceAfter(principalKobo, monthlyRate, payment, months) {
  let balance = principalKobo;
  for (let m = 0; m < months; m++) {
    balance += Math.round(balance * monthlyRate);
    balance -= payment;
  }
  return balance;
}

const principal = 500000 * 100;
const payment = firstTrue(0, principal * 2, (p) => balanceAfter(principal, 0.03, p, 12) <= 0);
console.log(`₦${(payment / 100).toFixed(2)} a month`);
console.log(balanceAfter(principal, 0.03, payment, 12) <= 0, balanceAfter(principal, 0.03, payment - 1, 12) <= 0);
```

Output of `node repayment.js` and of the browser terminal

```ts
₦50231.05 a month
true false
```

A bigger payment always leaves a smaller balance, so "paid off" is monotonic in the payment. The upper bound, twice the principal, certainly works (the first payment alone clears the loan and the interest on it). Searching whole kobo keeps everything in integers; there is a formula for this particular loan, but the search works just as well when the rules get messy (fees, a grace month, rounding rules) and the formula does not.

TRY IT YOURSELF

### The oldest ping in the ring buffer

In a rotated sorted array of unique timestamps, find the position of the *smallest* one (the oldest ping, where the rotation happened) in O(log n). Hint: compare the middle with the last element.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Search positions 0 to `items.length - 2` (inclusive) for the first one where `items[i] <= last`.

HINT 2

`return firstTrue(0, items.length - 1, (i) => items[i] <= last);`

SOLUTION

rotation-point.js

```ts
import { firstTrue } from "./first-true.js";

function oldestPosition(items) {
  if (items.length === 0) return -1;
  const last = items[items.length - 1];
  return firstTrue(0, items.length - 1, (i) => items[i] <= last);
}

console.log(oldestPosition([610, 615, 620, 580, 590, 595, 600, 605]));
console.log(oldestPosition([580, 590, 600]), oldestPosition([600, 580]), oldestPosition([580]));
```

Output of `node rotation-point.js` and of the browser terminal

```ts
3
0 1 0
```

Every value before the rotation point is bigger than the last element, and every value from the rotation point on is at most the last element: "at most the last element" is a monotonic predicate over positions, so the oldest ping is its first true. An array that is not rotated at all gives position 0. The search range excludes the last position, because the predicate is always true there.

## Summary

- Binary search needs a monotonic yes/no test over an ordered range, not a sorted array: false, …, false, true, …, true. It finds the switch in ⌈log₂ R⌉ tests.
- Write one `firstTrue(lo, hi, test)` with a clear invariant (everything below `lo` is false, everything from `hi` on is true) and reuse it: lower and upper bound, minimum capacity, first failing build.
- For "the minimum value such that…", write a check for one candidate, argue it is monotonic, pick bounds that surely contain the answer, and search them.
- Total cost is the cost of one check times log of the range, so even huge ranges are cheap; expensive checks (builds, load tests) benefit most.
- In a rotated sorted array, one half is always sorted; a range check on it decides which half to keep.
- Test against a linear scan of every candidate, and make sure the tests land on both bounds.

Next: [Pattern practice](https://zudojs.oyinlola.site/learn/pattern-practice), where the problems no longer tell you which pattern to use.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
