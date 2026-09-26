---
title: "Sliding window and prefix sums — ZudoJS Academy"
description: "Find the best 7 days of revenue, the longest on-time streak and any range total without re-adding numbers, using sliding windows and prefix sums."
source: https://zudojs.oyinlola.site/learn/pattern-sliding-window
---

LEVEL 3 · LESSON 19 OF 21

Problem-solving patterns Core

# Sliding window and prefix sums

Find the best 7 days of revenue, the longest on-time streak and any range total without re-adding numbers, using sliding windows and prefix sums.

- **55 min** to read and try
- **You need:** Big O and complexity, Hash maps and sets, Stacks and queues, The frequency counter pattern and The two pointers pattern
- **You build:** A revenue report with the best 7-day period, a delivery streak finder, a range-total API backed by prefix sums, and a zero-balance period counter

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise problems about contiguous ranges that a sliding window or prefix sums can answer
- Turn an O(n · k) recomputation into an O(n) fixed-size window by adding what enters and subtracting what leaves
- Grow and shrink a variable-size window to find the longest or shortest range that satisfies a rule
- Answer any range total in O(1) after O(n) preparation with prefix sums, and count ranges with a given sum using prefix sums and a Map
- Explain why negative values break the shrinking window, and test window code against brute force

## The problem: the best week of the year

A small chain of supermarkets records its revenue for every day, in kobo. The owner is planning next year's promotions and asks: *"What were our best 7 days in a row, and how much did we make in them?"* Not the best calendar week, Monday to Sunday: any 7 consecutive days.

A run of consecutive items in a list is called a **subarray** (for strings, a **substring**). "Consecutive" is the important word. The frequency counter from [the frequency lesson](https://zudojs.oyinlola.site/learn/pattern-frequency) forgets positions, so it cannot help here; the answer lives in which values sit *next to* each other.

REASON IT OUT

### Before you code: 7 days in a row

- How many different 7-day periods does a year of 365 days contain?
- Two neighbouring periods, days 10–16 and days 11–17. How many days do they share? What is the difference between their totals?
- What should happen if there are fewer than 7 days of data?
- If two periods tie for the best total, which should the report show?
- What happens to "7 days in a row" if the data has no row for a day the shop was closed?

**Show the reasoning**

**Periods:** a period can start on day 1 up to day 359, so there are `365 − 7 + 1 = 359` of them. In general `n − k + 1`.

**Neighbours** share 6 days (11 to 16). The second total is the first total, minus day 10 (which left), plus day 17 (which arrived). You never need to add up the 6 shared days again. That observation is the whole pattern.

**Fewer than 7 days:** there is no 7-day period, so return `null` and let the report say "not enough data". Returning the total of the 5 days you have would silently answer a different question.

**Ties:** decide explicitly. Here, the earliest period wins (use `>`, not `>=`, when comparing with the best so far).

**Missing rows:** then 7 rows are not 7 days. Fill closed days with a 0 revenue row first, so that positions and days line up. This is one of the [failure cases](#failure-cases).

## A naive solution: add up every period

For each possible start day, add up the 7 days from there, and keep the best:

naive-week.js

```ts
function bestPeriodNaive(daily, k) {
  if (k <= 0 || daily.length < k) return null;
  let best = null;
  for (let start = 0; start + k <= daily.length; start++) {
    let total = 0;
    for (let d = start; d < start + k; d++) total += daily[d];
    if (best === null || total > best.total) best = { start, total };
  }
  return best;
}

const revenue = [42000, 51000, 38000, 60000, 75000, 90000, 88000, 40000, 35000, 99000, 101000, 97000, 30000, 45000];
const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const best = bestPeriodNaive(revenue.map((n) => n * 100), 7);
console.log(`best 7 days start on day ${best.start + 1}: ${naira(best.total)}`);
console.log(bestPeriodNaive([100, 200], 7));
```

Output of `node naive-week.js` and of the browser terminal

```ts
best 7 days start on day 6: ₦550,000
null
```

Days are counted from 1 in the report and from 0 in the array, which is why the output adds 1. The `toLocaleString("en-NG")` call only formats the number with thousands separators; the maths stays in whole kobo.

## What is wrong with it: count the operations

For one shop and one year, 359 periods of 7 additions is nothing. But the same report is soon wanted for the whole chain, hourly, over five years, with a window of 30 days (720 hours), and then for every product. Count the additions:

naive-week-count.js

```ts
function bestPeriodNaive(values, k, counter) {
  let best = -Infinity;
  for (let start = 0; start + k <= values.length; start++) {
    let total = 0;
    for (let d = start; d < start + k; d++) {
      counter.adds++;
      total += values[d];
    }
    best = Math.max(best, total);
  }
  return best;
}

for (const [label, n, k] of [["1 year, daily, 7 days", 365, 7], ["5 years, hourly, 7 days", 43800, 168], ["5 years, hourly, 30 days", 43800, 720]]) {
  const values = Array.from({ length: n }, (_, i) => (i * 7919) % 1000);
  const counter = { adds: 0 };
  bestPeriodNaive(values, k, counter);
  console.log(`${label.padEnd(25)} n=${String(n).padEnd(6)} k=${String(k).padEnd(4)} adds=${counter.adds}`);
}
```

Output of `node naive-week-count.js` and of the browser terminal

```ts
1 year, daily, 7 days     n=365    k=7    adds=2513
5 years, hourly, 7 days   n=43800  k=168  adds=7330344
5 years, hourly, 30 days  n=43800  k=720  adds=31018320
```

The count is `(n − k + 1) · k`: O(n · k). When the window is small compared with the data, that is close to `n · k`; a 30-day hourly window over five years already costs over 31 million additions for one product, and there are thousands of products. The waste is exactly what the reason block found: each period re-adds the `k − 1` values it shares with its neighbour.

## The pattern: slide, don't recompute

A **window** is a range of consecutive positions, described by its two edges: `left` (the first position inside) and `right` (the last). The **sliding window** pattern keeps a summary of what is inside the window (a total, a count, a `Map`) and updates it as the edges move, instead of recomputing it. It has two shapes, and a close relative:

```ts
1. Fixed size k: both edges move together, one step at a time.
   [ 4  2  7  1  8  3 ]
     [-----]              total = 13
        [-----]           total = 13 - 4 + 1 = 10

2. Variable size: right moves every step; left moves only when the window breaks a rule.
   right grows the window  ->  check the rule  ->  while broken, left shrinks it

3. Prefix sums: precompute running totals once, then the total of ANY range
   is one subtraction. Useful when the ranges are not neighbours.
```

Both window shapes are two pointers moving in the same direction, like the reader and writer in [the two pointers lesson](https://zudojs.oyinlola.site/learn/pattern-two-pointers#dedupe). Each edge only moves forward, so each moves at most `n` times in total: O(n), however the window grows and shrinks.

### How to recognise it

- The question is about **contiguous** ranges: "in a row", "consecutive", "any 7 days", "substring", "streak", "period".
- It asks for the best, longest, shortest or number of such ranges.
- The summary of a range can be updated cheaply when one item enters or leaves: a sum, a count, a set of what is inside.
- Many queries ask for totals of arbitrary ranges of data that does not change: that is prefix sums.

## The improved solution

Add up the first window once. Then, for each step, add the value that enters on the right and subtract the value that leaves on the left:

best-week.js

```ts
function bestPeriod(daily, k, counter = { ops: 0 }) {
  if (k <= 0 || daily.length < k) return null;
  let total = 0;
  for (let d = 0; d < k; d++) {
    counter.ops++;
    total += daily[d];
  }
  let best = { start: 0, total };
  for (let right = k; right < daily.length; right++) {
    counter.ops++;
    total += daily[right] - daily[right - k]; // one day enters, one day leaves
    if (total > best.total) best = { start: right - k + 1, total };
  }
  return best;
}

const revenue = [42000, 51000, 38000, 60000, 75000, 90000, 88000, 40000, 35000, 99000, 101000, 97000, 30000, 45000];
const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const best = bestPeriod(revenue.map((n) => n * 100), 7);
console.log(`best 7 days start on day ${best.start + 1}: ${naira(best.total)}`);
console.log(bestPeriod([100, 200], 7), bestPeriod([500, 900, 300], 3));

for (const [n, k] of [[365, 7], [43800, 168], [43800, 720]]) {
  const values = Array.from({ length: n }, (_, i) => (i * 7919) % 1000);
  const counter = { ops: 0 };
  bestPeriod(values, k, counter);
  console.log(`n=${String(n).padEnd(6)} k=${String(k).padEnd(4)} ops=${counter.ops}`);
}
```

Output of `node best-week.js` and of the browser terminal

```ts
best 7 days start on day 6: ₦550,000
null { start: 0, total: 1700 }
n=365    k=7    ops=365
n=43800  k=168  ops=43800
n=43800  k=720  ops=43800
```

The answer is the same, and the work is exactly `n` operations whatever the window size: `k` to fill the first window, then one per slide. Going from a 7-day to a 30-day window costs nothing extra. The start of the window that ends at `right` is `right − k + 1`; getting that formula right is where most off-by-one bugs in window code live, so check it on a tiny case (with `k = 3` and `right = 3`, the window is positions 1, 2, 3, so the start is 1).

## Its complexity

| Approach | Time | Extra space |
| --- | --- | --- |
| recompute every window | O((n − k + 1) · k), about O(n · k) | O(1) |
| fixed-size sliding window | O(n) | O(1) |
| variable-size window with a `Map` of contents | O(n) average | O(size of the alphabet or the window) |
| prefix sums: build, then each range query | O(n), then O(1) per query | O(n) |

When the window size `k` is a small constant, O(n · k) is technically O(n) too. The difference matters when `k` grows with the data, as it did above (720 hours out of 43,800), or when you run the report thousands of times.

## Variable size: the longest on-time streak

A logistics company rewards riders for streaks of on-time deliveries. Each rider's history is a list of `true` (on time) and `false` (late). The first question, the longest run of `true`, needs only a counter that resets on a late delivery. The company then relaxes the rule: *a streak may include at most one late delivery* (traffic happens). Now a simple reset no longer works, because a late delivery does not end the streak, the *second* late one does.

REASON IT OUT

### Before you code: at most one late delivery

- A window of consecutive deliveries is valid if it contains at most one `false`. What must you keep track of about the window to know whether it is valid?
- You extend the window to the right and it becomes invalid (two lates). Could a longer valid window still start at the current `left`?
- How far must `left` move to make the window valid again?

**Show the reasoning**

**Track the number of lates inside the window.** Adding a delivery on the right may raise it; removing one on the left may lower it. That is the window's summary.

**No.** Any window starting at `left` that reaches this far or further contains both lates. So `left` can move on for good, just as each pointer move in the two pointers lesson discarded a candidate that could not win.

**Until one late leaves the window:** move `left` forward, subtracting what leaves, while the count is above the limit.

streak.js

```ts
function longestStreak(onTime, maxLate) {
  let left = 0;
  let late = 0;
  let best = { length: 0, start: 0 };
  for (let right = 0; right < onTime.length; right++) {
    if (!onTime[right]) late++;              // grow: one delivery enters
    while (late > maxLate) {                 // shrink until valid again
      if (!onTime[left]) late--;
      left++;
    }
    const length = right - left + 1;
    if (length > best.length) best = { length, start: left };
  }
  return best;
}

const T = true, F = false;
const history = [T, T, F, T, T, T, F, T, T, F, T];
console.log("no lates allowed:", longestStreak(history, 0));
console.log("one late allowed:", longestStreak(history, 1));
console.log("two lates allowed:", longestStreak(history, 2));
console.log(longestStreak([], 1), longestStreak([F, F], 0));
```

Output of `node streak.js` and of the browser terminal

```ts
no lates allowed: { length: 3, start: 3 }
one late allowed: { length: 6, start: 0 }
two lates allowed: { length: 9, start: 0 }
{ length: 0, start: 0 } { length: 0, start: 0 }
```

`right − left + 1` is the length of a window whose edges are both inside it. The inner `while` looks like a nested loop, but `left` only ever moves forward and never passes `right`, so over the whole run it moves at most `n` times. The total work is at most `2n` pointer moves: O(n) time, O(1) space.

The general recipe for a variable window, which you will reuse in every problem of this kind:

```ts
for each right:
    add item[right] to the window summary
    while the window breaks the rule:
        remove item[left] from the summary; left++
    the window [left .. right] is now the longest valid one ending at right: record it
```

### The longest block without a repeated ad

A radio station sells advertising slots. For a sponsor package it wants the longest block of consecutive slots in which no advert plays twice. This is the classic "longest substring without repeating characters", with ad codes instead of characters. The window's summary is now a `Map` from ad to the last position it played. When the ad entering on the right already played *inside* the window, `left` jumps just past that earlier play:

no-repeats.js

```ts
function longestWithoutRepeat(slots) {
  const lastSeen = new Map();
  let left = 0;
  let best = { length: 0, start: 0 };
  for (let right = 0; right < slots.length; right++) {
    const previous = lastSeen.get(slots[right]);
    if (previous !== undefined && previous >= left) left = previous + 1;
    lastSeen.set(slots[right], right);
    if (right - left + 1 > best.length) best = { length: right - left + 1, start: left };
  }
  return { ...best, block: slots.slice(best.start, best.start + best.length) };
}

console.log(longestWithoutRepeat(["MTN", "GLO", "DANGOTE", "MTN", "INDOMIE", "GLO", "PEAK", "MTN"]));
console.log(longestWithoutRepeat([..."abba"]));
console.log(longestWithoutRepeat([]).length);
```

Output of `node no-repeats.js` and of the browser terminal

```json
{
  length: 5,
  start: 2,
  block: [ 'DANGOTE', 'MTN', 'INDOMIE', 'GLO', 'PEAK' ]
}
{ length: 2, start: 0, block: [ 'a', 'b' ] }
0
```

The check `previous >= left` is the subtle part, and the `"abba"` case tests it: when the last `a` arrives, its earlier position (0) is already outside the window (which starts at 2 after the second `b`), so `left` must not jump backwards to 1. Without that check the window would grow a duplicate `b` back inside. Each position is visited once by `right` and `left` only jumps forward: O(n) time, O(k) space for the `Map` of distinct ads.

## Prefix sums: any range in one subtraction

The owner's dashboard lets managers pick any two dates and see the revenue between them. Thousands of managers, each choosing different ranges. The ranges are not neighbours, so there is nothing to slide; a loop per query would cost O(n) each.

A **prefix sum** array stores, at position `i`, the total of the first `i` values. It has one more entry than the data, starting with 0 (the total of nothing):

```ts
daily:          5   3   8   2   6
prefix:     0   5   8  16  18  24
index:      0   1   2   3   4   5

total of days 1..3 (0-based positions 1 to 3) = prefix[4] - prefix[1] = 18 - 5 = 13  (3 + 8 + 2)
```

The total of positions `from` to `to` (inclusive) is `prefix[to + 1] − prefix[from]`: everything up to the end of the range, minus everything before its start. Building the array is one O(n) pass; every query afterwards is O(1).

prefix-sums.js

```ts
function buildPrefix(values) {
  const prefix = new Array(values.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i] + values[i];
  return prefix;
}

function rangeTotal(prefix, from, to) {
  if (from < 0 || to >= prefix.length - 1 || from > to) throw new RangeError(`bad range ${from}..${to}`);
  return prefix[to + 1] - prefix[from];
}

const daily = [5, 3, 8, 2, 6].map((naira) => naira * 100000); // ₦5,000 is 500,000 kobo
const prefix = buildPrefix(daily);
console.log(prefix);
console.log(rangeTotal(prefix, 1, 3), rangeTotal(prefix, 0, 4), rangeTotal(prefix, 2, 2));
try {
  rangeTotal(prefix, 3, 5);
} catch (error) {
  console.log(error.message);
}

const year = Array.from({ length: 365 }, (_, i) => 3000000 + ((i * 7919) % 500000));
const yearPrefix = buildPrefix(year);
let brute = 0;
for (let d = 31; d <= 58; d++) brute += year[d]; // February: a loop of 28 additions
console.log(rangeTotal(yearPrefix, 31, 58) === brute);
```

Output of `node prefix-sums.js` and of the browser terminal

```json
[ 0, 500000, 800000, 1600000, 1800000, 2400000 ]
1300000 2400000 800000
bad range 3..5
true
```

The extra leading 0 is what makes the formula work for ranges that start at position 0 with no special case. Prefix sums only suit data that does not change: if a past day's revenue is corrected, every prefix after it changes too, O(n) per update. For data that changes often and is queried often, structures called Fenwick trees and segment trees do both in O(log n); they are beyond this course, but now you know what problem they solve.

## Counting periods with a given total

A business account records each day's *net* cash flow: sales minus refunds and expenses, so some days are negative. The accountant asks how many periods of consecutive days had a net flow of exactly ₦0 (those periods are candidates for a netting-off check).

A variable window does not work here. Its shrinking rule assumed that adding a value never makes a total smaller and removing one never makes it bigger. With negative values that is false: a window that is "too big" might become exactly right after adding a refund. Prefix sums rescue it, together with the frequency counter. A period from position `i` to `j` has total `prefix[j + 1] − prefix[i]`. That total is the target exactly when `prefix[i] = prefix[j + 1] − target`. So walk the prefix sums once, and for each one ask: how many earlier prefix sums equal the current one minus the target? That is a count lookup in a `Map`.

zero-periods.js

```ts
function countPeriods(net, target) {
  const seen = new Map([[0, 1]]); // the empty prefix, before day 0
  let running = 0;
  let periods = 0;
  for (const value of net) {
    running += value;
    periods += seen.get(running - target) ?? 0;
    seen.set(running, (seen.get(running) ?? 0) + 1);
  }
  return periods;
}

function countPeriodsBrute(net, target) {
  let periods = 0;
  for (let i = 0; i < net.length; i++) {
    let total = 0;
    for (let j = i; j < net.length; j++) {
      total += net[j];
      if (total === target) periods++;
    }
  }
  return periods;
}

const net = [3000, -3000, 5000, -2000, -3000, 4000, -4000]; // in naira, for readability
console.log(countPeriods(net, 0), countPeriodsBrute(net, 0));
console.log(countPeriods(net, 2000), countPeriodsBrute(net, 2000));
console.log(countPeriods([], 0), countPeriods([0, 0], 0));
```

Output of `node zero-periods.js` and of the browser terminal

```ts
7 7
1 1
0 3
```

Starting the `Map` with `0 → 1` counts periods that begin on the very first day, exactly as the leading 0 did in the prefix array. The order of the two lines inside the loop matters: look up *before* adding the current prefix, or an empty period would be counted when the target is 0. O(n) time and O(n) space, where the brute force is O(n²). This is the pattern that answers "subarray sum equals k" in interviews.

## The busiest day in every week

One more window, because it shows the limit of a running total. The owner also wants, for each 7-day period, the single best day inside it (to plan staffing). A maximum cannot be "un-added" when a day leaves: if the best day leaves, which is the next best? Recomputing it is O(k) per window.

The fix, promised in [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues#deque), is a deque of candidate positions whose revenues are in decreasing order. A day that arrives removes every weaker day from the back, because those can never be the maximum again while the newer, better day is in the window. The front of the deque is always the current maximum, and it is dropped once it slides out on the left. To keep both ends O(1) without a separate class, this version uses an array with a `head` index as the front, like the queue in that lesson:

window-max.js

```ts
function maxPerWindow(values, k) {
  const q = [];          // positions; values[q[head..]] is decreasing
  let head = 0;
  const out = [];
  for (let right = 0; right < values.length; right++) {
    while (q.length > head && values[q[q.length - 1]] <= values[right]) q.pop();
    q.push(right);
    if (q[head] <= right - k) head++; // the maximum slid out on the left
    if (right >= k - 1) out.push(values[q[head]]);
  }
  return out;
}

console.log(maxPerWindow([42, 51, 38, 60, 75, 90, 88, 40, 35, 99, 101, 97, 30, 45], 7));
console.log(maxPerWindow([5, 4, 3, 2, 1], 2), maxPerWindow([1, 2], 3));
```

Output of `node window-max.js` and of the browser terminal

```json
[
   90,  90,  90,  99,
  101, 101, 101, 101
]
[ 5, 4, 3, 2 ] []
```

Each position is pushed once and removed at most once, so the whole run is O(n) instead of O(n · k). The live part of the deque (from `head` on) never holds more than `k` positions; this simple version never frees the slots before `head`, so the array itself can grow to `n` entries. The ring-buffer deque from Stacks and queues would cap the memory at O(k).

## Failure cases

- **Rows are not days.** If closed days have no row, a 7-row window can span 9 days. Build a complete calendar (one row per day, 0 when closed) before sliding, or slide over timestamps instead of positions.
- **Window larger than the data, or not positive.** `k > n` has no window at all; `k ≤ 0` is meaningless. Return `null` or throw, but decide.
- **Off-by-one edges.** Write down whether `right` is inside the window (as here) or one past it, and derive `length = right − left + 1` and `start = right − k + 1` from that choice. Test with `k = 1` and `k = n`.
- **Negative values in a shrinking window.** "Shrink while the total is too big" assumes totals only grow when the window grows. With refunds or losses, use prefix sums with a `Map` instead.
- **`if` instead of `while` when shrinking.** One step left may not be enough to make the window valid again (the late delivery may be several positions in).
- **A stale entry in the window map.** In the no-repeat window, a previous position that is already left of the window must be ignored, or `left` jumps backwards.
- **Floating-point drift.** Adding and subtracting decimals thousands of times accumulates rounding errors, so a sliding total of naira values can drift away from the true sum. Integer kobo stays exact (as long as totals stay below `Number.MAX_SAFE_INTEGER`, about 9 × 10¹⁵).

## Testing window code

Every function in this lesson has a slow, obvious twin: recompute each window, or try every pair of start and end. Compare them on many small random inputs, including window sizes from 1 up to more than the length, so the edges come up constantly:

window-test.js

```ts
function bestPeriod(values, k) {
  if (k <= 0 || values.length < k) return null;
  let total = 0;
  for (let d = 0; d < k; d++) total += values[d];
  let best = total;
  for (let right = k; right < values.length; right++) {
    total += values[right] - values[right - k];
    best = Math.max(best, total);
  }
  return best;
}

function bestPeriodBrute(values, k) {
  if (k <= 0 || values.length < k) return null;
  let best = -Infinity;
  for (let s = 0; s + k <= values.length; s++) {
    best = Math.max(best, values.slice(s, s + k).reduce((a, b) => a + b, 0));
  }
  return best;
}

function xorshift(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

const random = xorshift(365);
let agree = 0, nulls = 0;
for (let t = 0; t < 4000; t++) {
  const values = Array.from({ length: Math.floor(random() * 10) }, () => Math.floor(random() * 21) - 10);
  const k = Math.floor(random() * 12);
  const fast = bestPeriod(values, k);
  if (fast === bestPeriodBrute(values, k)) agree++;
  if (fast === null) nulls++;
}
console.log(`${agree}/4000 agree (${nulls} had no window)`);
```

Output of `node window-test.js` and of the browser terminal

```ts
4000/4000 agree (2488 had no window)
```

The values include negatives (from −10 to 10), window sizes include 0 and sizes larger than the list, and the output reports how many cases had no window, so you know the `null` path was exercised as well as the normal one.

## Windows in production

- **SQL window functions.** Databases compute rolling totals directly: `SUM(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` is the fixed-size window, computed inside the database. Use `RANGE` with an interval over dates if rows can be missing.
- **Rate limiting.** "At most 100 requests per minute per user" is a sliding window over time. Limiters keep either the timestamps inside the window (exact, more memory) or counts per fixed bucket (approximate, tiny). ZudoJS's `createRateLimiter` in `@zudojs/security` is one such limiter; [the security lesson](https://zudojs.oyinlola.site/learn/zudo-security) uses it.
- **Precomputed totals.** Dashboards store daily totals (a summary table updated each night) so that range queries touch 365 rows, not millions of orders. That is prefix-sum thinking at the storage level.
- **Streams.** Monitoring systems compute moving averages over live data with exactly the add-entering, subtract-leaving update, because they cannot store the whole stream.

## New problems to practise

TRY IT YOURSELF

### The shortest run to reach a revenue target

A new shop wants to know the fewest consecutive days it ever needed to take ₦1,000,000. Daily revenues are never negative. Write `shortestRun(daily, target)` that returns the length of the shortest run whose total is at least the target, or 0 if no run reaches it. Use a variable window.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

While `total >= target`, the window is valid: record its length as a candidate for `best`, then shrink it from the left (subtract `daily[left]`, then `left++`) and check again.

HINT 2

`while (total >= target) { best = Math.min(best, right - left + 1); total -= daily[left]; left++; }`

SOLUTION

shortest-run.js

```ts
function shortestRun(daily, target) {
  let left = 0;
  let total = 0;
  let best = Infinity;
  for (let right = 0; right < daily.length; right++) {
    total += daily[right];
    while (total >= target) {           // valid: try to make it shorter
      best = Math.min(best, right - left + 1);
      total -= daily[left];
      left++;
    }
  }
  return best === Infinity ? 0 : best;
}

const naira = [200000, 150000, 400000, 50000, 600000, 100000, 350000];
console.log(shortestRun(naira, 1000000), shortestRun(naira, 5000000), shortestRun([1000000], 1000000));
```

Output of `node shortest-run.js` and of the browser terminal

```ts
3 0 1
```

This time the window shrinks while it is *valid*, because the goal is the shortest valid window, not the longest. It relies on revenues being non-negative: removing a day can only lower the total. O(n) time, O(1) space.

TRY IT YOURSELF

### A 7-day moving average

Charts smooth daily revenue with a 7-day moving average: for each day from the 7th on, the average of that day and the six before it. Write `movingAverage(daily, k)` in O(n), returning whole naira (rounded).

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Add `daily[i]` to `total` every iteration. Once `i >= k`, subtract `daily[i - k]`. Once `i >= k - 1`, push `Math.round(total / k)`.

HINT 2

`total += daily[i]; if (i >= k) total -= daily[i - k]; if (i >= k - 1) out.push(Math.round(total / k));`

SOLUTION

moving-average.js

```ts
function movingAverage(daily, k) {
  const out = [];
  let total = 0;
  for (let i = 0; i < daily.length; i++) {
    total += daily[i];
    if (i >= k) total -= daily[i - k];
    if (i >= k - 1) out.push(Math.round(total / k));
  }
  return out;
}

console.log(movingAverage([420, 510, 380, 600, 750, 900, 880, 400, 350, 990], 7));
console.log(movingAverage([100, 200], 7));
```

Output of `node moving-average.js` and of the browser terminal

```json
[ 634, 631, 609, 696 ]
[]
```

Dividing only when producing each output keeps the running total exact in whole numbers; averaging, then summing averages, would accumulate rounding errors.

TRY IT YOURSELF

### How many weeks beat the target?

Using prefix sums, count how many 7-day periods had total revenue of at least ₦500,000, where daily revenue is given in naira. Build the prefix array once and use one subtraction per period.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop `start` from 0 while `start + k <= daily.length`. Each period's total is `prefix[start + k] - prefix[start]`; count it when that is at least `target`.

HINT 2

`for (let start = 0; start + k <= daily.length; start++) { if (prefix[start + k] - prefix[start] >= target) count++; }`

SOLUTION

weeks-over-target.js

```ts
function weeksOver(daily, k, target) {
  const prefix = [0];
  for (const value of daily) prefix.push(prefix[prefix.length - 1] + value);
  let count = 0;
  for (let start = 0; start + k <= daily.length; start++) {
    if (prefix[start + k] - prefix[start] >= target) count++;
  }
  return count;
}

const daily = [42000, 51000, 38000, 60000, 75000, 90000, 88000, 40000, 35000, 99000, 101000, 97000, 30000, 45000];
console.log(weeksOver(daily, 7, 500000), weeksOver(daily, 7, 450000), weeksOver(daily, 30, 1));
```

Output of `node weeks-over-target.js` and of the browser terminal

```ts
2 4 0
```

The period starting at `start` covers positions `start` to `start + k − 1`, so its total is `prefix[start + k] − prefix[start]`. A fixed window would solve this too; prefix sums shine when the same array must also answer other, unrelated ranges.

## Summary

- Sliding windows answer questions about contiguous ranges. Keep a summary of the window and update it as items enter and leave, instead of recomputing it.
- Fixed size: add the entering item, subtract the leaving one. O(n) instead of O(n · k), whatever `k` is.
- Variable size: `right` grows the window every step; `left` shrinks it while it breaks the rule (or, for "shortest", while it satisfies it). Each edge only moves forward: O(n).
- Prefix sums answer any range total with one subtraction after one O(n) pass; with a `Map` of earlier prefix sums they count ranges with an exact total, even with negative values.
- A running maximum cannot be un-added; a decreasing deque of positions gives the maximum of every window in O(n).
- Watch the edges: `right − left + 1`, `right − k + 1`, `k > n`, missing days, negative values, and `while` rather than `if`.

Next: [Binary search on the answer](https://zudojs.oyinlola.site/learn/pattern-binary-search), where you search not for an item but for an answer: the smallest truck capacity, the first failing build.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
